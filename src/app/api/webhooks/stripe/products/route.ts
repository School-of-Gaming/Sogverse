import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { currentPeriodEndOf } from "@/lib/stripe/subscription-period";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmBookingRpcResult } from "@/services/participations/participations.contracts";
import { sendProductConfirmationEmail } from "@/services/participations/product-confirmation-email.server";
import { isSupportedCurrency } from "@/lib/constants/currency";
import type { Json, PaymentPurpose } from "@/types";

const webhookSecret = process.env.STRIPE_PRODUCTS_WEBHOOK_SECRET!;

// Webhook idempotency: an event this route handles is looked up in
// `stripe_processed_events` before anything else, and recorded there only once
// its handler has made its last write. A redelivery of a finished event does
// nothing; one whose first delivery died part-way runs again, and every write a
// handler makes is safe to repeat (the UNIQUE on payments.stripe_event_id is the
// net under the payment row).
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
    // Unhandled types are not recorded: there is nothing to have finished.
    const handled = HANDLED_EVENT_TYPES.has(event.type);
    if (handled && (await isProcessed(admin, event.id))) {
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(admin, event, request);
        break;

      // No `checkout.session.expired` case on purpose: an abandoned session
      // leaves a pending booking that holds nothing, so there is nothing to
      // reclaim. The participation is created here, at payment confirmation,
      // not before Checkout.

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
    // Last, after every write the handler made: the mark means "finished", so
    // a delivery that failed before this line is run again in full by Stripe's
    // retry.
    if (handled) await markProcessed(admin, event);
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

/** The event types the switch above acts on, and so the ones marked processed. */
const HANDLED_EVENT_TYPES: ReadonlySet<string> = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

async function isProcessed(admin: Admin, eventId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("stripe_processed_events")
    .select("stripe_event_id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function markProcessed(admin: Admin, event: Stripe.Event) {
  const { error } = await admin
    .from("stripe_processed_events")
    .insert({ stripe_event_id: event.id, event_type: event.type });
  // A concurrent delivery of the same event finished first: already marked.
  if (error && error.code !== "23505") throw error;
}

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

  // `client_reference_id` is the booking the route wrote before Checkout. A
  // Session without one is not ours: the account also carries Sessions from
  // other sources.
  const bookingId = session.client_reference_id;
  if (!bookingId) return;

  // A finished event never gets here (the route checks it first), so this is a
  // first delivery or the re-run of one that died part-way. Every write below is
  // safe to repeat on that re-run, and the comments on each say why.
  //
  // The money has arrived, so this is where the participation is created, and
  // the answer carries every fact the writes below need. Two outcomes:
  //   settled           — a fresh seat, or the seat this very session already
  //                       bought (the re-run case). Either way the writes below
  //                       are the right ones to make.
  //   duplicate_payment — a different payment already put this participant on
  //                       this product. Handled below.
  const confirmed = await confirmBooking(admin, bookingId, session.id);
  const {
    customer_id: customerId,
    participant_id: participantId,
    product_id: productId,
    purchase_shape: purchaseShape,
    currency,
  } = confirmed;
  const isSubscription = purchaseShape.startsWith("subscription_");

  if (confirmed.kind === "duplicate_payment") {
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
        existingParticipationId: confirmed.existing_participation_id,
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

    // A duplicate bought no seat, so it names none: the seat the family
    // already held is the metadata's `existingParticipationId`. Recorded before
    // the cancel below, so a cancel that keeps failing still leaves the money
    // on record; a re-run meets the UNIQUE on stripe_event_id.
    await recordPayment(admin, {
      stripeEventId: event.id,
      customerId,
      amountCents: session.amount_total ?? 0,
      currency,
      purpose: "reservation_duplicate",
      participationId: null,
      productId,
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
        existingParticipationId: confirmed.existing_participation_id,
      },
    });

    // A duplicate *subscription* is live and recurring by the time this event
    // fires, and nothing else will ever stop it: no family_subscriptions row is
    // written, so renewals drop in the invoice handler and a cancellation finds
    // no row to tear down. Refunding one invoice does not stop the next one —
    // the subscription itself has to be cancelled, here. Single-payment
    // duplicates need no equivalent: one charge, refunded by hand.
    //
    // A failed cancel throws, so the event is not marked processed and Stripe's
    // retry cancels again — for days, where a log line waits for someone to
    // read it. The re-run is safe: confirm_booking answers duplicate_payment
    // again, the payment is recorded once, and the cancel skips a subscription
    // already cancelled (see the helper).
    if (isSubscription && typeof session.subscription === "string") {
      await cancelDuplicateSubscription(session.subscription, event.id);
    }

    return;
  }

  // A redelivery after the seat this session bought has ended: confirm_booking
  // answers a settled booking whose seat ended with no participation id. It can
  // only get this far when the first delivery died before it was marked
  // processed, so the money may be unrecorded. The seat stays ended, which rules
  // out every seat-dependent write below: no subscription row and no mail. The
  // payment still lands, as the record of the charge, naming the product but no
  // seat (the answer carries none), and a live subscription now has nothing
  // tracking it, so the log names it for a person.
  if (confirmed.participation_id === null) {
    console.error(
      "[stripe/products webhook] completed session for a seat that has since ended — check the subscription and refund by hand",
      {
        eventId: event.id,
        customerId,
        participantId,
        productId,
        subscription: expandableId(session.subscription),
        paymentIntent: expandableId(session.payment_intent),
      },
    );
    await recordPayment(admin, {
      stripeEventId: event.id,
      customerId,
      amountCents: session.amount_total ?? 0,
      currency,
      purpose: paymentPurposeFor(purchaseShape),
      participationId: null,
      productId,
      stripePaymentIntentId: expandableId(session.payment_intent),
      stripeInvoiceId: expandableId(session.invoice),
      metadata: {
        gamerId: participantId,
        productId,
        purchaseShape,
        participationId: null,
      },
    });
    return;
  }

  // Subscription mode: the per-participation family_subscriptions row. A
  // failed insert throws, so the event is not marked processed and Stripe's
  // retry re-runs the handler and gets another shot at it — rather than leaving
  // a live, untracked recurring Stripe sub (renewals would then drop in
  // handleInvoicePaid, and a cancellation would find no row to tear the
  // participation down). That re-run is only safe because the booking records
  // that it settled: the RPC above hands back the same seat rather than
  // mistaking it for a second payment.
  //
  // Each subscription Checkout creates a brand-new Stripe sub (one per
  // gamer×club), so there's nothing to find-or-merge — just insert, keyed to the
  // participation. Idempotent on replay via the UNIQUE participation_id /
  // stripe_subscription_id (insert and swallow 23505).
  // The confirmation mail's "your first payment is on …" line, and this handler
  // is the only send site that gets it for free: the subscription is retrieved
  // just below to write the row, so the period end is already in hand. It is a
  // *deferred* first charge only where nothing moved today — a club bought
  // before it starts completes Checkout at €0 — and only while the instant is
  // still ahead of us.
  let firstChargeAt: string | null = null;
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
      participation_id: confirmed.participation_id,
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

    if (
      (session.amount_total ?? 0) === 0 &&
      periodEnd !== null &&
      periodEnd * 1000 > Date.now()
    ) {
      firstChargeAt = new Date(periodEnd * 1000).toISOString();
    }
  }

  // Confirmed — record the money. A re-run meets the UNIQUE on
  // stripe_event_id and records nothing twice.
  await recordPayment(admin, {
    stripeEventId: event.id,
    customerId,
    amountCents: session.amount_total ?? 0,
    currency,
    purpose: paymentPurposeFor(purchaseShape),
    participationId: confirmed.participation_id,
    productId,
    stripePaymentIntentId: expandableId(session.payment_intent),
    stripeInvoiceId: expandableId(session.invoice),
    // `gamerId` again, and deliberately — see the duplicate branch above.
    metadata: {
      gamerId: participantId,
      productId,
      purchaseShape,
      participationId: confirmed.participation_id,
    },
  });

  // The confirmation mail, and the ONE thing in this handler that is not
  // naturally idempotent.
  //
  // **What guards it is `idempotent === false`, and nothing else can.** Stripe
  // redelivers, and a redelivery that gets this far — because the first attempt
  // died before the event was marked processed, so the route's check did not
  // short-circuit it — calls the RPC again and is answered `settled`
  // with the same participation id. The two answers are indistinguishable
  // except for this flag, which the function sets from whether it INSERTed or
  // found the booking already settled. Keying on
  // the id, or on the absence of a payment row, would send the mail twice.
  //
  // **Last, after every write.** Putting a third-party round trip in front of
  // the payment row would add latency and a failure surface to the middle of a
  // money path. The accepted cost is
  // the narrow case where a delivery creates the participation and then fails a
  // later write: its retry reports `idempotent`, so no mail is ever sent for
  // that seat. The seat itself is intact and visible in My SOG, which is the
  // outcome that matters.
  if (!confirmed.idempotent) {
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
      participationId: confirmed.participation_id,
      // The price shape, from the shape that was bought: a club is a monthly
      // subscription, a camp or event is paid once.
      mode: isSubscription ? "subscription" : "upfront",
      // Our integration currency, as the booking recorded it. Anything outside the supported set cannot be formatted, and
      // the mail then states no price rather than a wrong one.
      currency: isSupportedCurrency(currency) ? currency : undefined,
      // Null on everything but a club bought before it starts — see above.
      firstChargeAt,
    });
  }
}

/**
 * Cancels a duplicate checkout's subscription, and throws when it cannot.
 *
 * Read first, because a cancel is not repeatable on its own: Stripe refuses to
 * cancel a subscription that has already ended, so a re-run after a cancel that
 * succeeded (only its response lost) would fail on every retry. A subscription
 * already ended is the cancel having happened, and there is nothing to do.
 */
async function cancelDuplicateSubscription(subId: string, eventId: string) {
  try {
    const sub = await stripe.subscriptions.retrieve(subId);
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      return;
    }
    await stripe.subscriptions.cancel(subId);
  } catch (cancelErr) {
    console.error(
      "[stripe/products webhook] could not cancel the duplicate subscription — Stripe retries this event; if it keeps failing, cancel it by hand or it keeps billing",
      { subscription: subId, eventId, cancelErr },
    );
    throw cancelErr;
  }
}

async function confirmBooking(
  admin: Admin,
  bookingId: string,
  checkoutSessionId: string,
) {
  const { data, error } = await admin.rpc("confirm_booking", {
    p_booking_id: bookingId,
    p_checkout_session_id: checkoutSessionId,
  });
  if (error) throw new Error(`confirm_booking failed: ${error.message}`);
  const parsed = confirmBookingRpcResult.safeParse(data);
  if (!parsed.success) {
    // Unexpected shape from the RPC — throw so the route returns 500 and Stripe
    // retries, same as an RPC error above.
    throw new Error(
      `confirm_booking returned an unexpected shape: ${parsed.error.message}`,
    );
  }
  return parsed.data;
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
  // needs widening for deferred billing: the €0 checkout records no payment,
  // and this handler writes the first one when the money actually moves. An
  // invoice settled at €0 (a coupon, a credit balance) records nothing either.
  if (!subId || invoice.billing_reason === "subscription_create") return;
  const { data: famSub, error: famSubErr } = await admin
    .from("family_subscriptions")
    .select("customer_id, participation_id, participations!inner(product_id)")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (famSubErr) throw famSubErr;
  if (!famSub) return;

  // The seat's product as it stands when the renewal is paid: a club switch
  // moves the seat, and this renewal paid for the club it is in now.
  await recordPayment(admin, {
    stripeEventId: event.id,
    customerId: famSub.customer_id,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    purpose: "subscription_invoice",
    participationId: famSub.participation_id,
    productId: famSub.participations.product_id,
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
  // A failed read throws: answering "not ours" would mark the event processed
  // with the update never written.
  const { data: ours, error: oursErr } = await admin
    .from("family_subscriptions")
    .select("id, updated_at, ended_at")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (oursErr) throw oursErr;
  if (!ours) return;
  // A subscription that ended with its seat is final: a late or out-of-order
  // update describing it must never revive it, and the row's trigger refuses
  // the write (55000) if one tries. Stripe has nothing left to tell us here.
  if (ours.ended_at) return;

  const periodEnd = currentPeriodEndOf(sub);
  const priceId = sub.items.data[0]?.price.id;
  // Stripe delivers and retries out of order, so an event describing the
  // subscription BEFORE the club switch can arrive after the switch has already
  // written the target's price. Writing its price id then would silently
  // downgrade the row back to the club the family has left — the one field on
  // this row that names a product, and the one a stale payload can get wrong in
  // a way nothing else notices.
  //
  // `event.created` is the instant Stripe built the payload; `updated_at` is
  // the instant we last wrote the row. Older payload, no price write. Status and
  // period are unaffected: those are properties of the subscription's own
  // lifecycle rather than of which club it bills for, and a late arrival there
  // is corrected by the next event.
  const eventIsStale = event.created * 1000 < Date.parse(ours.updated_at);
  const { error } = await admin
    .from("family_subscriptions")
    .update({
      status: statusForSubscriptionUpdate(sub),
      // The subscription's current item price, exactly as the checkout-completed
      // handler records it at creation. The admin club switch changes this price
      // and fires this event, so without it the row would keep naming the club
      // the family has left. The event payload carries the items inline, so this
      // costs no extra retrieve. Last writer wins between this and the RPC that
      // moves the seat, and both write the same id.
      //
      // The key is OMITTED when the payload carries no item, rather than written
      // as null: an items-less update is this handler learning nothing about the
      // price, and "I learned nothing" must not overwrite a good stored id with
      // a null the rest of the app reads as "this seat bills for nothing".
      ...(priceId && !eventIsStale ? { stripe_price_id: priceId } : {}),
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
 * payment row and the processed mark have not been written yet. Stripe's
 * retry would re-read the same unmapped status and fail again, forever, so the
 * subscription would be left with no `family_subscriptions` row at all: renewals
 * drop in the invoice handler, and a cancellation finds nothing to tear the
 * participation down with. That is the exact state the sub-row comment further
 * up this file exists to prevent, and a status we failed to translate is not a
 * good enough reason to enter it.
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

async function handleSubscriptionDeleted(
  admin: Admin,
  event: Stripe.CustomerSubscriptionDeletedEvent,
) {
  const sub = event.data.object;

  // A failed read throws: answering "not ours" would mark the event processed
  // and leave the seat held after Stripe stopped billing it.
  const { data: famSub, error: famSubErr } = await admin
    .from("family_subscriptions")
    .select("participation_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (famSubErr) throw famSubErr;
  // No row → nothing to do: a sub on the account this flow never created.
  if (!famSub) return;

  // Portal-only cancellation (§4.5c): the parent cancelled this club's sub in
  // Stripe's hosted portal, Stripe fired this event, and now the seat ends.
  // Stripe has ALREADY cancelled the sub, so this path must not call Stripe
  // again — `end_participation` only touches our DB. The seat is kept, ended,
  // with its family_subscriptions row cancelled and stamped. A replayed
  // deletion finds that row again and end_participation answers kind='noop'
  // for a seat already ended, so the redelivery writes nothing.
  const { error } = await admin.rpc("end_participation", {
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
  /** The seat paid for; null where none was bought (see the column's comment). */
  participationId: string | null;
  productId: string;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  metadata: Json;
}

/**
 * A payment, recorded only when money moved. A club bought before it starts, or
 * with a 100%-off code, completes Checkout at €0, and a coupon or a credit
 * balance can settle an invoice at €0: the seat and the subscription are real,
 * but nothing was charged, so there is no payment. The event is still marked
 * processed by the route.
 */
async function recordPayment(admin: Admin, params: InsertPaymentParams) {
  if (params.amountCents === 0) return;
  const { error } = await admin.from("payments").insert({
    stripe_event_id: params.stripeEventId,
    customer_id: params.customerId,
    amount_cents: params.amountCents,
    currency: params.currency,
    purpose: params.purpose,
    participation_id: params.participationId,
    product_id: params.productId,
    stripe_payment_intent_id: params.stripePaymentIntentId,
    stripe_invoice_id: params.stripeInvoiceId,
    metadata: params.metadata,
  });
  // The re-run of an event that died after its payment landed: recorded once.
  if (error && error.code !== "23505") throw error;
}

function paymentPurposeFor(purchaseShape: string): PaymentPurpose {
  if (purchaseShape.startsWith("subscription_")) return "subscription_invoice";
  return "single_payment";
}
