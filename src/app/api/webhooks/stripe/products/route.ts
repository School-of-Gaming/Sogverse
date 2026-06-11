import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, PaymentPurpose } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_PRODUCTS_WEBHOOK_SECRET!;

// Webhook idempotency: every payments / refunds row carries the
// stripe_event_id; UNIQUE constraints catch duplicate deliveries.
//
// Errors during writes return 500 so Stripe retries. Unhandled event types
// return 200 — quieter than 4xx and Stripe will stop retrying.

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(admin, event);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(admin, event);
        break;

      case "invoice.paid":
        await handleInvoicePaid(admin, event);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(admin, event);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event);
        break;

      case "charge.refunded":
        await handleChargeRefunded(admin, event);
        break;

      default:
        // Unhandled type — fine.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(
      `[stripe/products webhook] failure on ${event.type}:`,
      err,
    );
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}

type Admin = ReturnType<typeof createAdminClient>;

// Shape of confirm_reservation's jsonb return (function body lives in
// supabase/schema.sql). `kind` is always present; participation_id only on
// 'confirmed', existing_participation_id only on 'duplicate_payment'. The RPC
// also returns keys this route doesn't read (product_id, idempotent, …) —
// zod strips those.
const confirmReservationResultSchema = z.object({
  kind: z.enum(["confirmed", "orphan", "duplicate_payment"]),
  participation_id: z.string().optional(),
  existing_participation_id: z.string().optional(),
});

async function handleCheckoutCompleted(
  admin: Admin,
  event: Stripe.CheckoutSessionCompletedEvent,
) {
  const session = event.data.object;
  if (session.payment_status !== "paid") return;

  const reservationId = session.metadata?.reservationId;
  const purchaseShape = session.metadata?.purchaseShape;
  const customerId = session.metadata?.customerId;
  const gamerId = session.metadata?.gamerId;
  const productId = session.metadata?.productId;
  // Our integration currency, always EUR. Safe to pair with `amount_total`
  // below: even with Adaptive Pricing on, `session.amount_total`/`currency`
  // report the EUR settlement amount we receive — the customer's local
  // currency lives in `session.presentment_details`, which we don't record.
  const currency = session.metadata?.currency;
  if (!reservationId || !purchaseShape || !customerId || !gamerId || !productId || !currency) {
    return;
  }

  // Idempotency on payments — UNIQUE on stripe_event_id is the safety net.
  const { data: existingPayment } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existingPayment) return;

  const isSubscription = purchaseShape.startsWith("subscription_");

  // Confirm reservation. The RPC returns one of:
  //   'confirmed'        — happy path: row flipped reserving → active
  //                        (or already active, in which case `idempotent: true`).
  //   'orphan'           — row missing or in an unexpected status (admin
  //                        interference). Log; charge sits in Stripe awaiting
  //                        manual reconciliation.
  //   'duplicate_payment' — parent has another active/waitlisted/completed
  //                        row for this (product, gamer). Both Stripe sessions
  //                        completed (parent paid the original tab and a retry
  //                        tab). Record the duplicate so admin can find and
  //                        refund it; release the orphan reserving row.
  const { data: confirmResult, error: confirmErr } = await admin.rpc(
    "confirm_reservation",
    { p_reservation_id: reservationId },
  );
  if (confirmErr) {
    throw new Error(`confirm_reservation failed: ${confirmErr.message}`);
  }
  const parsedConfirm = confirmReservationResultSchema.safeParse(confirmResult);
  if (!parsedConfirm.success) {
    // Unexpected shape from the RPC — throw so the route returns 500 and
    // Stripe retries, same as a confirm_reservation error above.
    throw new Error(
      `confirm_reservation returned an unexpected shape: ${parsedConfirm.error.message}`,
    );
  }
  const confirmJson = parsedConfirm.data;

  if (confirmJson.kind === "orphan") {
    console.error(
      "[stripe/products webhook] orphan confirmation — reservation row missing or in unexpected status",
      { reservationId, eventId: event.id },
    );
    return;
  }

  if (confirmJson.kind === "duplicate_payment") {
    // Rare: parent paid two Stripe sessions that both targeted the same
    // (product, gamer). The first webhook landed an active row; this one is
    // the duplicate charge. Log loudly and record the payment under
    // `reservation_duplicate` so admin can find it from a payments query
    // (filter on purpose='reservation_duplicate') when the customer reports
    // the double charge. No automated refund — admin issues it manually.
    console.error(
      "[stripe/products webhook] duplicate payment detected — admin must refund manually",
      {
        reservationId,
        existingParticipationId: confirmJson.existing_participation_id,
        eventId: event.id,
        customerId,
        gamerId,
        productId,
        paymentIntent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : null,
        subscription:
          typeof session.subscription === "string" ? session.subscription : null,
        amountCents: session.amount_total ?? 0,
        currency,
      },
    );

    await insertPaymentRow(admin, {
      stripeEventId: event.id,
      customerId,
      amountCents: session.amount_total ?? 0,
      currency,
      purpose: "reservation_duplicate",
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripeInvoiceId:
        typeof session.invoice === "string" ? session.invoice : null,
      metadata: {
        gamerId,
        productId,
        purchaseShape,
        reservationId,
        existingParticipationId: confirmJson.existing_participation_id ?? null,
      },
    });

    // Release the orphan reserving row so it doesn't permanently hold a seat.
    await admin
      .from("participations")
      .delete()
      .eq("id", reservationId)
      .eq("status", "reserving");

    return;
  }

  // Subscription mode: record the per-participation family_subscriptions row
  // BEFORE the payment row, on purpose. The payment row is this handler's commit
  // marker — the idempotency guard at the top reads "a payment exists for this
  // event" as "this event is fully processed" and short-circuits the whole
  // handler. Writing the sub row first makes that invariant true: if the sub
  // insert fails, no payment row lands, so Stripe's retry re-runs the handler
  // (confirm_reservation is idempotent) and gets another shot at the sub row —
  // instead of the guard skipping it forever and leaving a live, untracked
  // recurring Stripe sub (renewals would then drop in handleInvoicePaid, and
  // a cancellation would find no row to tear the participation down).
  //
  // Each subscription Checkout creates a brand-new Stripe sub (one per
  // gamer×club), so there's nothing to find-or-merge — just insert, keyed to the
  // participation. Idempotent on replay via the UNIQUE participation_id /
  // stripe_subscription_id (insert and swallow 23505).
  if (
    isSubscription &&
    typeof session.subscription === "string" &&
    confirmJson.participation_id !== undefined
  ) {
    const subId = session.subscription;
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data"],
    });
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : "";
    const periodEnd = currentPeriodEndOf(sub);

    const { error: subErr } = await admin.from("family_subscriptions").insert({
      customer_id: customerId,
      participation_id: confirmJson.participation_id,
      stripe_subscription_id: subId,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: sub.items.data[0]?.price.id ?? null,
      currency,
      status: sub.status,
      current_period_end:
        periodEnd !== null ? new Date(periodEnd * 1000).toISOString() : null,
    });
    if (subErr && subErr.code !== "23505") {
      throw subErr;
    }
  }

  // Confirmed — record the payment row LAST. It's the commit marker the
  // idempotency guard at the top keys on (see the sub-row note above), so it
  // must come after every other write this handler makes.
  await insertPaymentRow(admin, {
    stripeEventId: event.id,
    customerId,
    amountCents: session.amount_total ?? 0,
    currency,
    purpose: paymentPurposeFor(purchaseShape),
    stripePaymentIntentId:
      typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripeInvoiceId:
      typeof session.invoice === "string" ? session.invoice : null,
    metadata: {
      gamerId,
      productId,
      purchaseShape,
      reservationId,
    },
  });
}

async function handleCheckoutExpired(
  admin: Admin,
  event: Stripe.CheckoutSessionExpiredEvent,
) {
  const session = event.data.object;
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) return;
  await admin.rpc("expire_reservation", { p_reservation_id: reservationId });
}

async function handleInvoicePaid(admin: Admin, event: Stripe.InvoicePaidEvent) {
  const invoice = event.data.object;
  // `subscription` is an expandable field; webhook payloads carry the
  // un-expanded id string, but handle the object form for type completeness.
  const subId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription?.id ?? null);
  // First-period invoices come in via checkout.session.completed.
  if (!subId || invoice.billing_reason === "subscription_create") return;
  const { data: famSub } = await admin
    .from("family_subscriptions")
    .select("id, customer_id, currency")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!famSub) return;

  const { data: existingPayment } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existingPayment) return;

  await insertPaymentRow(admin, {
    stripeEventId: event.id,
    customerId: famSub.customer_id,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    purpose: "subscription_invoice",
    stripePaymentIntentId: null,
    stripeInvoiceId: invoice.id,
    metadata: {
      stripeSubscriptionId: subId,
      billingReason: invoice.billing_reason,
    },
  });
}

async function handleSubscriptionUpdated(
  admin: Admin,
  event: Stripe.CustomerSubscriptionUpdatedEvent,
) {
  const sub = event.data.object;

  // Only act on subs we have a row for. The webhook subscribes to
  // customer.subscription.* at the account level, so it fires for every sub on
  // the account; "do we have a row for this stripe_subscription_id" is the gate.
  const { data: ours } = await admin
    .from("family_subscriptions")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (!ours) return;

  const periodEnd = currentPeriodEndOf(sub);
  await admin
    .from("family_subscriptions")
    .update({
      status:
        sub.status === "active" && sub.cancel_at_period_end
          ? "canceling"
          : sub.status,
      current_period_end:
        periodEnd !== null
          ? new Date(periodEnd * 1000).toISOString()
          : null,
    })
    .eq("id", ours.id);
}

// Stripe API: `current_period_end` lives on the subscription in older API
// versions and on the subscription items in newer ones. Read whichever side
// has it. Cast through `unknown` because the active SDK type elides one form.
function currentPeriodEndOf(sub: Stripe.Subscription): number | null {
  const item = sub.items.data[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  if (item && typeof item.current_period_end === "number") {
    return item.current_period_end;
  }
  const subAny = sub as Stripe.Subscription & { current_period_end?: number };
  if (typeof subAny.current_period_end === "number") {
    return subAny.current_period_end;
  }
  return null;
}

async function handleSubscriptionDeleted(
  admin: Admin,
  event: Stripe.CustomerSubscriptionDeletedEvent,
) {
  const sub = event.data.object;

  const { data: famSub } = await admin
    .from("family_subscriptions")
    .select("participation_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  // No row → nothing to do. The normal way to hit this is a *replayed*
  // deletion: the first delivery already tore the participation down (which
  // CASCADE-removed this row), so a redelivery finds nothing. Returning here
  // keeps the replay a clean 200 instead of a null-deref 500 that Stripe would
  // retry forever. (Also covers any sub on the account not created by this flow.)
  if (!famSub) return;

  // Portal-only cancellation (§4.5c): the parent cancelled this club's sub in
  // Stripe's hosted portal, Stripe fired this event, and now we tear the
  // participation down. Stripe has ALREADY cancelled the sub, so this path must
  // not call Stripe again — `cancel_participation` only touches our DB.
  // Hard-deleting the participation CASCADEs the family_subscriptions row away.
  // Idempotent: a replay finds no row (already gone) and returns kind='noop'.
  const { error } = await admin.rpc("cancel_participation", {
    p_participation_id: famSub.participation_id,
    p_reason: "subscription_cancelled",
  });
  if (error) throw error;
}

async function handleChargeRefunded(
  admin: Admin,
  event: Stripe.ChargeRefundedEvent,
) {
  const charge = event.data.object;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : null;
  if (!paymentIntentId) return;

  const { data: payment } = await admin
    .from("payments")
    .select("id, amount_cents")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!payment) return;

  // Pull the refund object from charge.refunds (the most recent one).
  // Each `charge.refunded` event corresponds to exactly one refund creation,
  // and Stripe sorts refunds.data newest-first — so data[0] is the refund this
  // event is about. Don't iterate refunds.data here: refunds has UNIQUE on
  // BOTH stripe_event_id AND stripe_refund_id, and looping would try to INSERT
  // multiple rows sharing the same event_id, silently failing all but the first.
  const refunds = charge.refunds;
  if (!refunds || refunds.data.length === 0) return;
  const latest = refunds.data[0];

  // Idempotency: UNIQUE on stripe_refund_id. INSERT and swallow duplicates.
  const { error } = await admin
    .from("refunds")
    .insert({
      payment_id: payment.id,
      amount_cents: latest.amount,
      reason: "admin_refund",
      stripe_refund_id: latest.id,
      stripe_event_id: event.id,
    });
  if (error && error.code !== "23505") {
    throw error;
  }
}

interface InsertPaymentParams {
  stripeEventId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  purpose: PaymentPurpose;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  metadata: Json;
}

async function insertPaymentRow(admin: Admin, params: InsertPaymentParams) {
  const { data, error } = await admin
    .from("payments")
    .insert({
      stripe_event_id: params.stripeEventId,
      customer_id: params.customerId,
      amount_cents: params.amountCents,
      currency: params.currency,
      purpose: params.purpose,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_invoice_id: params.stripeInvoiceId,
      metadata: params.metadata,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // duplicate event — ignore.
    throw error;
  }
  return data;
}

function paymentPurposeFor(purchaseShape: string): PaymentPurpose {
  if (purchaseShape.startsWith("subscription_")) return "subscription_invoice";
  return "single_payment";
}
