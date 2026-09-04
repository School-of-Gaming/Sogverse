import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmPaidParticipationRpcResult } from "@/services/participations/participations.contracts";
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";
import { isSupportedCurrency } from "@/lib/constants/currency";
import type { Json, PaymentPurpose } from "@/types";

const webhookSecret = process.env.STRIPE_PRODUCTS_WEBHOOK_SECRET!;

// Webhook idempotency: every payments row carries the stripe_event_id; a UNIQUE
// constraint catches duplicate deliveries.
//
// Errors during writes return 500 so Stripe retries. Unhandled event types
// return 200 — quieter than 4xx and Stripe will stop retrying.
//
// The payload shapes below are governed by the API version pinned on the *Stripe
// endpoint* (or, while the endpoint is unpinned, by the account default) — never
// by the version our own client sends with outbound calls. The two move
// independently, and the endpoint's version can change without a deploy, so
// every field Stripe has relocated across versions is read from both places.
// See `src/lib/stripe/client.ts` for the outbound half of this split.

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
        await handleCheckoutCompleted(admin, event, request);
        break;

      // No `checkout.session.expired` case on purpose: an abandoned session
      // leaves nothing in the database to reclaim. The participation is created
      // here, at payment confirmation, not before Checkout.

      case "invoice.paid":
        await handleInvoicePaid(admin, event);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(admin, event);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event);
        break;

      // No `charge.refunded` case on purpose either: it used to write a local
      // refunds ledger that nothing ever read back, so both the ledger and the
      // handler were removed. Stripe is the system of record for refunds and
      // retains them indefinitely, so the data is backfillable if a reader is
      // ever built. The event now falls through to the default below.

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

async function handleCheckoutCompleted(
  admin: Admin,
  event: Stripe.CheckoutSessionCompletedEvent,
  request: Request,
) {
  const session = event.data.object;
  // A completion is acted on when money arrived — OR when a subscription-mode
  // session legitimately cost nothing today.
  //
  // Stripe reports a €0 total as `no_payment_required`, and two things produce
  // one: a club whose first charge is deferred to a future start date
  // (`billing_cycle_anchor` + `proration_behavior: "none"` — see the checkout
  // route), and a 100%-off promotion code. Both create a live subscription that
  // will bill later, so requiring `"paid"` here meant creating no participation
  // at all for either — a silent failure, since the route still answered 200.
  //
  // The widening is per *mode*, not per deferral: payment-mode sessions
  // (camps, events) still require `"paid"`, because a one-off purchase that
  // collected nothing has bought nothing.
  const isZeroDueSubscription =
    session.mode === "subscription" &&
    session.payment_status === "no_payment_required";
  if (session.payment_status !== "paid" && !isZeroDueSubscription) return;

  const purchaseShape = session.metadata?.purchaseShape;
  const customerId = session.metadata?.customerId;
  const participantId = session.metadata?.participantId;
  const productId = session.metadata?.productId;
  // Our integration currency, always EUR. Safe to pair with `amount_total`
  // below: even with Adaptive Pricing on, `session.amount_total`/`currency`
  // report the EUR settlement amount we receive — the customer's local
  // currency lives in `session.presentment_details`, which we don't record.
  const currency = session.metadata?.currency;
  if (!purchaseShape || !customerId || !participantId || !productId || !currency) {
    return;
  }

  // Idempotency on payments — UNIQUE on stripe_event_id is the safety net.
  // This guard runs FIRST, before any write: it reads "a payment exists for this
  // event" as "this event is fully processed", which is what makes a replayed
  // delivery cheap and safe.
  const { data: existingPayment } = await admin
    .from("payments")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existingPayment) return;

  const isSubscription = purchaseShape.startsWith("subscription_");

  // The money has arrived, so this is where the participation is created — the
  // (product, gamer, customer) triple comes from metadata we wrote ourselves
  // when the session was built. The session's own id goes in too: the row
  // records it, which is what lets a re-run of this handler recognise its own
  // earlier work instead of reading it as a second payment. The RPC returns:
  //   'confirmed'         — a fresh active row, or the row this very session
  //                         already bought (the re-run case). Either way the
  //                         writes below are the right ones to make.
  //   'duplicate_payment' — a different payment already put this participant on
  //                         this product. Handled below.
  const { data: confirmResult, error: confirmErr } = await admin.rpc(
    "confirm_paid_participation",
    {
      p_product_id: productId,
      p_participant_id: participantId,
      p_customer_id: customerId,
      p_checkout_session_id: session.id,
    },
  );
  if (confirmErr) {
    throw new Error(`confirm_paid_participation failed: ${confirmErr.message}`);
  }
  const parsedConfirm =
    confirmPaidParticipationRpcResult.safeParse(confirmResult);
  if (!parsedConfirm.success) {
    // Unexpected shape from the RPC — throw so the route returns 500 and
    // Stripe retries, same as an RPC error above.
    throw new Error(
      `confirm_paid_participation returned an unexpected shape: ${parsedConfirm.error.message}`,
    );
  }
  const confirmJson = parsedConfirm.data;

  if (confirmJson.kind === "duplicate_payment") {
    // Rare: the parent completed two Stripe sessions for the same
    // (product, gamer) — the original tab and a retry tab — or paid for a seat
    // the gamer already held. Log loudly and record the payment under
    // `reservation_duplicate` (a name from the pre-payment-hold era, kept so the
    // enum and every historical row stay put) so admin can find it from a
    // payments query when the customer reports the double charge. The money
    // itself is refunded by hand; there is no automated refund.
    console.error(
      "[stripe/products webhook] duplicate payment detected — admin must refund manually",
      {
        existingParticipationId: confirmJson.existing_participation_id,
        eventId: event.id,
        customerId,
        participantId,
        productId,
        paymentIntent: expandableId(session.payment_intent),
        subscription: expandableId(session.subscription),
        amountCents: session.amount_total ?? 0,
        currency,
      },
    );

    // A duplicate *subscription* is live and recurring by the time this event
    // fires, and nothing else will ever stop it: no family_subscriptions row is
    // written, so renewals drop in the invoice handler and a cancellation finds
    // no row to tear down. Refunding one invoice does not stop the next one —
    // the subscription itself has to be cancelled, here. Single-payment
    // duplicates need no equivalent: one charge, refunded by hand.
    //
    // A failed cancel is logged rather than thrown, deliberately. Throwing
    // would win a free Stripe retry, but it would also stop the payment row
    // landing — and that row is both this branch's commit marker and the record
    // an admin queries when the customer reports the double charge. Worse, a
    // cancel is not safely repeatable: if the first one succeeded and only its
    // response was lost, the retry asks Stripe to cancel an already-cancelled
    // subscription and fails again, looping until Stripe gives up with nothing
    // recorded. So: record everything, and put the failure in the same log the
    // admin is already reading, naming the subscription they must cancel.
    if (isSubscription && typeof session.subscription === "string") {
      try {
        await stripe.subscriptions.cancel(session.subscription);
      } catch (cancelErr) {
        console.error(
          "[stripe/products webhook] could not cancel the duplicate subscription — cancel it by hand or it keeps billing",
          { subscription: session.subscription, eventId: event.id, cancelErr },
        );
      }
    }

    await insertPaymentRow(admin, {
      stripeEventId: event.id,
      customerId,
      amountCents: session.amount_total ?? 0,
      currency,
      purpose: "reservation_duplicate",
      stripePaymentIntentId: expandableId(session.payment_intent),
      stripeInvoiceId: expandableId(session.invoice),
      // The ledger echo KEEPS the historical `gamerId` key. Every payments row
      // ever written carries it, nothing reads the column programmatically
      // (it is an admin's forensic breadcrumb when a family reports a double
      // charge), and renaming it here would fork the stored shape into a
      // before/after that any future reader has to know about. One spelling,
      // for all of history.
      metadata: {
        gamerId: participantId,
        productId,
        purchaseShape,
        existingParticipationId: confirmJson.existing_participation_id,
      },
    });

    return;
  }

  // Subscription mode: record the per-participation family_subscriptions row
  // BEFORE the payment row, on purpose. The payment row is this handler's commit
  // marker — the idempotency guard at the top reads "a payment exists for this
  // event" as "this event is fully processed" and short-circuits the whole
  // handler. Writing the sub row first makes that invariant true: if the sub
  // insert fails, no payment row lands, so Stripe's retry re-runs the handler
  // and gets another shot at the sub row — instead of the guard skipping it
  // forever and leaving a live, untracked recurring Stripe sub (renewals would
  // then drop in handleInvoicePaid, and a cancellation would find no row to tear
  // the participation down). That re-run is only safe because the participation
  // records the session that bought it: the RPC above hands back the same row
  // rather than mistaking it for a second payment.
  //
  // Each subscription Checkout creates a brand-new Stripe sub (one per
  // gamer×club), so there's nothing to find-or-merge — just insert, keyed to the
  // participation. Idempotent on replay via the UNIQUE participation_id /
  // stripe_subscription_id (insert and swallow 23505).
  if (isSubscription && typeof session.subscription === "string") {
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
      // Translated, not passed through — the column's CHECK accepts a narrower
      // set than Stripe reports, and a sub created on a trial arrives `trialing`.
      // Degrading, not throwing: see the note on the function itself for why this
      // path cannot afford the throw the update path wants.
      status: statusForNewSubscription(sub, event.id),
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
    stripePaymentIntentId: expandableId(session.payment_intent),
    stripeInvoiceId: expandableId(session.invoice),
    // `gamerId` again, and deliberately — see the duplicate branch above.
    metadata: {
      gamerId: participantId,
      productId,
      purchaseShape,
      participationId: confirmJson.participation_id,
    },
  });

  // The confirmation mail, and the ONE thing in this handler that is not
  // naturally idempotent.
  //
  // **What guards it is `idempotent === false`, and nothing else can.** Stripe
  // redelivers, and a redelivery that gets this far — because the first attempt
  // died before writing its payment row, so the guard at the top of the handler
  // did not short-circuit it — calls the RPC again and is answered `confirmed`
  // with the same participation id. The two answers are indistinguishable
  // except for this flag, which the function sets from whether it INSERTed or
  // recognised the row this very Checkout Session had already bought. Keying on
  // the id, or on the absence of a payment row, would send the mail twice.
  //
  // **Last, after every write.** The payment row is this handler's commit
  // marker; putting a third-party round trip in front of it would add latency
  // and a failure surface to the middle of a money path. The accepted cost is
  // the narrow case where a delivery creates the participation and then fails a
  // later write: its retry reports `idempotent`, so no mail is ever sent for
  // that seat. The seat itself is intact and visible in My SOG, which is the
  // outcome that matters.
  if (!confirmJson.idempotent) {
    await sendProductConfirmationEmail({
      client: admin,
      // Stripe's request, deliberately. `getOrigin` honours a Host only when it
      // matches a trusted source, so this resolves either to our own deployment
      // host or to the canonical NEXT_PUBLIC_SITE_URL — both correct, and
      // neither reachable by anything Stripe sends.
      request,
      customerId,
      participantId,
      productId,
      participationId: confirmJson.participation_id,
      // The price shape, from the shape that was bought: a club is a monthly
      // subscription, a camp or event is paid once.
      mode: isSubscription ? "subscription" : "upfront",
      // Our integration currency, written onto the session's metadata when it
      // was built. Anything outside the supported set cannot be formatted, and
      // the mail then states no price rather than a wrong one.
      currency: isSupportedCurrency(currency) ? currency : undefined,
    });
  }
}

/**
 * The subscription an invoice was raised for, read from both places Stripe has
 * kept it.
 *
 * Up to and including API `2025-02-24.acacia` the id sits at the top level as
 * `subscription`. In `2025-03-31.basil` it moved under
 * `parent.subscription_details.subscription` and the top-level field is gone.
 * Which one a delivery carries is decided by the webhook endpoint's own API
 * version, so neither can be assumed — read the newer location first and fall
 * back to the older, and a renewal is recorded under either. Reading only one is
 * a silent failure: the handler returns early, the route answers 200, and
 * renewals simply stop being recorded.
 *
 * Both fields are expandable, so each can arrive as an id string or as the
 * object; webhook payloads never expand, but the object form costs one line.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // A widening assertion, not a reinterpretation: the installed SDK types
  // describe exactly one API version — the one this codebase pins outbound calls
  // to — and at that version `Stripe.Invoice` still has top-level `subscription`
  // and no `parent` at all. The intersection adds the newer field as optional
  // without contradicting anything the SDK says, so the runtime check below is
  // what decides which shape arrived.
  const { parent } = invoice as Stripe.Invoice & {
    parent?: {
      subscription_details?: {
        subscription?: string | Stripe.Subscription | null;
      } | null;
    } | null;
  };
  return (
    expandableId(parent?.subscription_details?.subscription) ??
    expandableId(invoice.subscription)
  );
}

/** An expandable Stripe reference as an id, whichever form it arrived in. */
function expandableId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

async function handleInvoicePaid(admin: Admin, event: Stripe.InvoicePaidEvent) {
  const invoice = event.data.object;
  const subId = invoiceSubscriptionId(invoice);
  // `subscription_create` is the invoice Stripe raises alongside the very
  // Checkout Session that created the subscription; `checkout.session.completed`
  // already recorded that purchase, so recording it again here would double it.
  //
  // Note what this does NOT skip. A club whose first charge was deferred to a
  // future start date may or may not raise a €0 invoice at creation — and this
  // gate means we do not have to know: any invoice belonging to that creation
  // carries `billing_reason: "subscription_create"` and is skipped here either
  // way, exactly as an ordinary immediate purchase's is. The first *real* charge
  // arrives weeks later at the anchor with `billing_reason:
  // "subscription_cycle"`, i.e. shaped exactly like a month-2 renewal, so the
  // ordinary renewal path below is the right one to record it. No gate here
  // needs widening for deferred billing: the €0 checkout leaves a zero-amount
  // payment row (its idempotency marker) and this handler writes the real one
  // when the money actually moves.
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
  const { error } = await admin
    .from("family_subscriptions")
    .update({
      status: statusForSubscriptionUpdate(sub),
      current_period_end:
        periodEnd !== null
          ? new Date(periodEnd * 1000).toISOString()
          : null,
    })
    .eq("id", ours.id);
  // Checked, like every other write in this route. It used to be dropped, which
  // turned a rejected status into a no-op the route still answered 200 to: the
  // row silently kept its previous status forever and nothing anywhere said so.
  if (error) throw error;
}

/**
 * The `family_subscriptions.status` vocabulary. A CHECK constraint enforces this
 * exact set, so a value outside it is not a wrong-looking row — it is a rejected
 * write.
 */
type FamilySubscriptionStatus =
  | "active"
  | "past_due"
  | "cancelled"
  | "incomplete"
  | "canceling";

/**
 * Stripe's subscription statuses onto ours.
 *
 * Stripe's set is wider than the CHECK accepts, and it does not even agree on
 * spelling (`canceled` there, `cancelled` here), so every status is translated
 * rather than passed through. The mappings that are not identity:
 *
 *   `trialing`           → `active`     A trial is a live subscription as far as
 *                                       anything downstream is concerned: the
 *                                       seat is held and the sessions show up.
 *                                       Overridden to `canceling` when the sub is
 *                                       set to lapse — see below, and note that
 *                                       this table alone would have swallowed
 *                                       that case.
 *   `unpaid`             → `cancelled`  Stripe has exhausted its retries and
 *                                       stopped trying to collect.
 *   `incomplete_expired` → `cancelled`  The first payment never completed and the
 *                                       subscription can no longer be paid.
 *   `paused`             → `past_due`   We never pause a subscription on purpose,
 *                                       so this can only arrive from a hand
 *                                       action in the Stripe dashboard. `past_due`
 *                                       is the nearest thing we model — not
 *                                       collecting, seat retained — and it is what
 *                                       raises the parent's payment-problem badge,
 *                                       which is the outcome we want for a
 *                                       subscription that has quietly stopped
 *                                       billing.
 *
 * The two type positions do different jobs and both are load-bearing. The
 * `satisfies` clause is the completeness check: a status added to the SDK's union
 * fails the build here until it is given a home. The declared type is looser on
 * purpose — Stripe can start sending a status the *installed* SDK has never heard
 * of, which arrives as a string outside the union, so a lookup miss is real at
 * runtime even though the compiler cannot see it from the object literal.
 */
const FAMILY_SUBSCRIPTION_STATUS: Record<
  string,
  FamilySubscriptionStatus | undefined
> = {
  active: "active",
  past_due: "past_due",
  canceled: "cancelled",
  unpaid: "cancelled",
  incomplete: "incomplete",
  incomplete_expired: "cancelled",
  trialing: "active",
  paused: "past_due",
} satisfies Record<Stripe.Subscription.Status, FamilySubscriptionStatus>;

/**
 * The status to store for a Stripe subscription, or `null` when Stripe sent one
 * nothing maps to. Callers decide what a miss costs them — see the two wrappers
 * below, which answer that differently on purpose.
 *
 * A subscription set to lapse at the period end is `canceling` to us: the
 * distinction Stripe draws with a boolean, we draw with a status, because it is
 * what the parent's "ending soon" badge and the access-until date key on. It has
 * to cover `trialing` as well as `active` — Stripe leaves a cancelling
 * subscription at `trialing` for the rest of its trial, and with `trialing`
 * mapping to `active` a parent who cancels mid-trial would otherwise read as
 * plainly active, with no badge and no end date. `past_due` is deliberately not
 * included: the parent-facing badges treat "ending soon" and "payment problem" as
 * mutually exclusive, and a failing card is the more urgent of the two.
 */
function mapSubscriptionStatus(
  sub: Stripe.Subscription,
): FamilySubscriptionStatus | null {
  if (
    sub.cancel_at_period_end &&
    (sub.status === "active" || sub.status === "trialing")
  ) {
    return "canceling";
  }
  return FAMILY_SUBSCRIPTION_STATUS[sub.status] ?? null;
}

/**
 * The status for the `customer.subscription.updated` path, where an unmapped
 * status **throws**.
 *
 * Nothing is stranded by that throw: the status update is the only write the
 * handler has pending, so a 500 leaves the row exactly as it was, Stripe retries,
 * and the failure is in the logs. That is strictly better than the bug this
 * replaced, where a rejected write was swallowed and the row kept a stale status
 * forever under a 200.
 */
function statusForSubscriptionUpdate(
  sub: Stripe.Subscription,
): FamilySubscriptionStatus {
  const mapped = mapSubscriptionStatus(sub);
  if (mapped === null) {
    throw new Error(
      `Unknown Stripe subscription status '${sub.status}' on ${sub.id} — no family_subscriptions.status maps to it`,
    );
  }
  return mapped;
}

/**
 * The status for the checkout path, where an unmapped status **degrades** instead
 * of throwing.
 *
 * The asymmetry with the update path is the point. Here the throw would land
 * mid-sequence: the Stripe subscription is already live and charging, and the
 * payment row — this handler's commit marker — has not been written yet. Stripe's
 * retry would re-read the same unmapped status and fail again, forever, so the
 * subscription would be left with no `family_subscriptions` row at all: renewals
 * drop in the invoice handler, and a cancellation finds nothing to tear the
 * participation down with. That is the exact state the write-ordering comment
 * further up this file exists to prevent, and a status we failed to translate is
 * not a good enough reason to enter it.
 *
 * So: log loudly enough to be found, store `incomplete`, and let the payment row
 * land. `incomplete` is the safe corner of the vocabulary — it does not claim the
 * subscription is healthy, does not raise a payment-problem badge at a parent for
 * something that may be fine, and does not end anything. A human correcting the
 * row afterwards is a small job; reconstructing an untracked live subscription is
 * not.
 *
 * Reachability, since it is not obvious: with outbound calls pinned, the retrieve
 * that feeds this cannot return a status the pinned version does not define — so
 * today this is unreachable. It stops being unreachable the moment the pin moves,
 * and that is precisely when nobody will be thinking about this function.
 */
function statusForNewSubscription(
  sub: Stripe.Subscription,
  eventId: string,
): FamilySubscriptionStatus {
  const mapped = mapSubscriptionStatus(sub);
  if (mapped !== null) return mapped;
  console.error(
    "[stripe/products webhook] unmapped Stripe subscription status on a new subscription — stored as 'incomplete', correct the row by hand",
    { subscription: sub.id, stripeStatus: sub.status, eventId },
  );
  return "incomplete";
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
