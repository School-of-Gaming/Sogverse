import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bundleSizeFromShape,
  frequencyFromShape,
} from "@/lib/stripe/participation-prices";
import type { PaymentPurposeV2 } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_PRODUCTS_WEBHOOK_SECRET!;

// Webhook idempotency: every payments_v2 / refunds_v2 row carries the
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

async function handleCheckoutCompleted(admin: Admin, event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;

  const reservationId = session.metadata?.reservationId;
  const purchaseShape = session.metadata?.purchaseShape;
  const customerId = session.metadata?.customerId;
  const gamerId = session.metadata?.gamerId;
  const productId = session.metadata?.productId;
  const currency = session.metadata?.currency;
  if (!reservationId || !purchaseShape || !customerId || !gamerId || !productId || !currency) {
    return;
  }

  // Idempotency on payments_v2 — UNIQUE on stripe_event_id is the safety net.
  const { data: existingPayment } = await admin
    .from("payments_v2")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existingPayment) return;

  const isSubscription = purchaseShape.startsWith("subscription_");
  const isBundle = purchaseShape.startsWith("bundle_");

  const creditsToGrant = isBundle ? bundleSizeFromShape(purchaseShape) : 0;

  // Confirm reservation atomically. RPC returns either 'confirmed' (active row)
  // or 'lost_seat' (race lost — refund + waitlist).
  const { data: confirmResult, error: confirmErr } = await admin.rpc(
    "confirm_reservation_v2",
    {
      p_reservation_id: reservationId,
      p_credits_to_grant: creditsToGrant,
    },
  );
  if (confirmErr) {
    throw new Error(`confirm_reservation_v2 failed: ${confirmErr.message}`);
  }
  const confirmJson = confirmResult as {
    kind: "confirmed" | "lost_seat";
    participation_id?: string;
    idempotent?: boolean;
  };

  if (confirmJson.kind === "lost_seat") {
    // Refund and put parent on waitlist.
    if (typeof session.payment_intent === "string") {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: session.payment_intent,
          reason: "requested_by_customer",
        });
        // Record the refund — but first we need a payments_v2 row. Without
        // one we can't satisfy the FK. So write the payment row first
        // (purpose is whatever the original was), then the refund.
        const paymentRow = await insertPaymentRow(admin, {
          stripeEventId: event.id,
          customerId,
          amountCents: session.amount_total ?? 0,
          currency,
          purpose: paymentPurposeFor(purchaseShape),
          stripePaymentIntentId: session.payment_intent,
          stripeInvoiceId: null,
          metadata: {
            gamerId,
            productId,
            purchaseShape,
            lostSeat: true,
          },
        });
        if (paymentRow) {
          await admin.from("refunds_v2").insert({
            payment_id: paymentRow.id,
            amount_cents: refund.amount,
            reason: "lost_seat_after_payment",
            stripe_refund_id: refund.id,
            stripe_event_id: `${event.id}:lost_seat_refund`,
          });
        }
      } catch (refundErr) {
        console.error("[stripe/products] refund failed on lost-seat path:", refundErr);
      }
    }

    // Put the parent on the waitlist.
    await admin.rpc("join_waitlist_v2", {
      p_product_id: productId,
      p_gamer_id: gamerId,
      p_customer_id: customerId,
    });
    return;
  }

  // Confirmed — record payment row.
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

  // Subscription mode: ensure the family_subscriptions_v2 row + item exist.
  if (isSubscription && typeof session.subscription === "string") {
    const subId = session.subscription;
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data"] });
    const frequency = frequencyFromShape(purchaseShape);

    // Find or create family_subscriptions_v2 row.
    let { data: famSub } = await admin
      .from("family_subscriptions_v2")
      .select("id")
      .eq("stripe_subscription_id", subId)
      .maybeSingle();

    if (!famSub) {
      const stripeCustomerId =
        typeof session.customer === "string" ? session.customer : "";
      const periodEnd = currentPeriodEndOf(sub);
      const inserted = await admin
        .from("family_subscriptions_v2")
        .insert({
          customer_id: customerId,
          stripe_subscription_id: subId,
          stripe_customer_id: stripeCustomerId,
          frequency,
          currency,
          status: sub.status,
          current_period_end:
            periodEnd !== null
              ? new Date(periodEnd * 1000).toISOString()
              : null,
        })
        .select("id")
        .single();
      famSub = inserted.data;
    }

    if (famSub !== null && confirmJson.participation_id !== undefined) {
      if (sub.items.data.length > 0) {
        const item = sub.items.data[0];
        await admin
          .from("family_subscription_items_v2")
          .insert({
            family_subscription_id: famSub.id,
            participation_id: confirmJson.participation_id,
            stripe_subscription_item_id: item.id,
            stripe_price_id: item.price.id,
          })
          .select()
          .maybeSingle();
      }
    }
  }
}

async function handleCheckoutExpired(admin: Admin, event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) return;
  await admin.rpc("expire_reservation_v2", { p_reservation_id: reservationId });
}

async function handleInvoicePaid(admin: Admin, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice & {
    subscription?: string | null;
    billing_reason?: string;
  };
  // First-period invoices come in via checkout.session.completed.
  if (!invoice.subscription || invoice.billing_reason === "subscription_create") return;

  const subId = invoice.subscription;
  const { data: famSub } = await admin
    .from("family_subscriptions_v2")
    .select("id, customer_id, currency")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (!famSub) return;

  const { data: existingPayment } = await admin
    .from("payments_v2")
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

async function handleSubscriptionUpdated(admin: Admin, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;

  // Bail explicitly if this isn't a sub we manage. Both the legacy Sorg
  // token webhook and this one subscribe to customer.subscription.* events
  // in Stripe Dashboard, so each fires for every sub on the account; the
  // only correct gate is "do we have a row for this stripe_subscription_id".
  const { data: ours } = await admin
    .from("family_subscriptions_v2")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (!ours) return;

  const periodEnd = currentPeriodEndOf(sub);
  await admin
    .from("family_subscriptions_v2")
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

async function handleSubscriptionDeleted(admin: Admin, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;

  const { data: famSub } = await admin
    .from("family_subscriptions_v2")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (!famSub) return; // Not a sub we manage — Sorg token sub etc.

  await admin
    .from("family_subscriptions_v2")
    .update({ status: "cancelled" })
    .eq("id", famSub.id);

  // Removing items flips coverage on the linked participations to bundle-mode.
  // The cron resolves coverage by joining family_subscription_items_v2 →
  // family_subscriptions_v2.status — purging items here makes the cron see
  // those participations as not-sub-covered immediately.
  await admin
    .from("family_subscription_items_v2")
    .delete()
    .eq("family_subscription_id", famSub.id);
}

async function handleChargeRefunded(admin: Admin, event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : null;
  if (!paymentIntentId) return;

  const { data: payment } = await admin
    .from("payments_v2")
    .select("id, amount_cents")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (!payment) return;

  // Pull the refund object from charge.refunds (the most recent one).
  const refunds = charge.refunds;
  if (!refunds || refunds.data.length === 0) return;
  const latest = refunds.data[0];

  // Idempotency: UNIQUE on stripe_refund_id. INSERT and swallow duplicates.
  const { error } = await admin
    .from("refunds_v2")
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
  purpose: PaymentPurposeV2;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  metadata: Record<string, unknown>;
}

async function insertPaymentRow(admin: Admin, params: InsertPaymentParams) {
  const { data, error } = await admin
    .from("payments_v2")
    .insert({
      stripe_event_id: params.stripeEventId,
      customer_id: params.customerId,
      amount_cents: params.amountCents,
      currency: params.currency,
      purpose: params.purpose,
      stripe_payment_intent_id: params.stripePaymentIntentId,
      stripe_invoice_id: params.stripeInvoiceId,
      metadata: params.metadata as never,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // duplicate event — ignore.
    throw error;
  }
  return data;
}

function paymentPurposeFor(purchaseShape: string): PaymentPurposeV2 {
  if (purchaseShape.startsWith("bundle_")) return "bundle";
  if (purchaseShape.startsWith("subscription_")) return "subscription_invoice";
  return "single_payment";
}
