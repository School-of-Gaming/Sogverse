import type { Metadata } from "next";
import type Stripe from "stripe";
import { createClient, getUser } from "@/lib/supabase/server";
import { ParticipationsService } from "@/services/participations";
import { ProductsService } from "@/services/products";
import {
  PurchaseConfirmationView,
  PurchaseConfirmationFallback,
  PurchaseConfirmationNotice,
  type SignupOutcome,
} from "@/components/public/products/purchase-confirmation-view";
import { PurchaseConfirmationFinalizing } from "@/components/public/products/purchase-confirmation-finalizing";
import { stripe } from "@/lib/stripe/client";
import type { ParticipationConfirmation } from "@/services/participations";
import type { AppSupabaseClient, ProductBrowseRow } from "@/types";

// Post-signup summary page, reached two ways.
//
//   ?p=<participationId>      — the row already existed when the link was built:
//                               a free event, a municipality registration, a
//                               waitlist join.
//   ?session_id=<checkoutId>  — a paid signup. The participation is created by
//                               the Stripe webhook at payment confirmation, so
//                               when `success_url` was built there was no row to
//                               name. The Checkout Session is the handle both
//                               ends share; the row records it, and this page
//                               reads it back.
//
// Fetched server-side with the viewer's RLS-scoped client so the page renders
// complete on first paint. The one case that can't is a paid signup whose
// webhook has not landed yet — see the finalizing branch below.

// Owner decision (Aug 2026): search engines and AI crawlers may discover only
// the /shop browse surface. A crawler arriving here without params only ever
// sees the fallback, but the ruling is a static rule, so it applies here too.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
//
// The static `/shop/confirmation` segment outranks the `/shop/[id]` dynamic
// route, so it never collides with a product detail URL.
export default async function ShopConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; session_id?: string }>;
}) {
  const { p: participationId, session_id: checkoutSessionId } =
    await searchParams;

  const supabase = await createClient();
  const participations = new ParticipationsService(supabase);

  if (checkoutSessionId) {
    return renderPaidConfirmation(
      supabase,
      participations,
      checkoutSessionId,
    );
  }

  if (!participationId) return <PurchaseConfirmationFallback />;

  let confirmation: ParticipationConfirmation | null = null;
  try {
    confirmation = await participations.getConfirmation(participationId);
  } catch {
    // RLS miss / stale id / transient error → render the friendly fallback
    // rather than a 500. A real purchaser effectively never lands here.
    //
    // Honest edge case: a transient DB/network blip is swallowed the same way,
    // so a parent who *just* signed up could momentarily see the "couldn't find
    // that order" copy. We accept it: the failure is rare, the signup is safe
    // (it's in My SOG regardless), and a simple page reload re-fetches and shows
    // the real confirmation. Not worth distinguishing transient errors from
    // genuine misses today.
  }

  return renderConfirmation(supabase, participations, confirmation);
}

/**
 * The paid path, in the order the happy path can afford.
 *
 * **The row read comes first**, because when it succeeds it has already answered
 * the only question the Stripe gates below exist to answer. The read is
 * RLS-scoped (`customer_id = auth.uid()`, or the gamer's own row), so a session
 * id someone else pasted returns nothing and falls through to the gates. Asking
 * Stripe first would put a third-party round trip in front of first paint on
 * every ordinary confirmation, to re-derive an ownership fact the database just
 * proved.
 *
 * When there is no row, the gates become load-bearing and all three run: Stripe
 * must recognise the session, it must actually have bought something, and its
 * metadata must name the signed-in user as the purchaser. Without them a
 * stranger's pasted session id would be answered "Payment received", which is
 * both a lie and a leak.
 */
async function renderPaidConfirmation(
  supabase: AppSupabaseClient,
  participations: ParticipationsService,
  checkoutSessionId: string,
) {
  let confirmation: ParticipationConfirmation | null = null;
  try {
    confirmation =
      await participations.getConfirmationByCheckoutSession(checkoutSessionId);
  } catch {
    // Same swallow as the participation path: a transient read failure falls
    // through to the waiting state below, which retries, rather than to a 500.
  }

  if (confirmation) {
    return renderConfirmation(supabase, participations, confirmation);
  }

  const user = await getUser();
  if (!user) return <PurchaseConfirmationFallback />;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  } catch {
    // Unknown or malformed session id — a stale or hand-edited link.
    return <PurchaseConfirmationFallback />;
  }

  // "It was actually bought" — which for a subscription does not mean money
  // moved today. A club whose first charge is deferred to a future start date
  // (and a 100%-off promotion code) completes at €0, which Stripe reports as
  // `no_payment_required`; the subscription is live and will bill later, so
  // requiring `"paid"` here would answer a real purchaser with "we couldn't find
  // that order". Payment-mode sessions (camps, events) still require `"paid"`:
  // a one-off that collected nothing bought nothing.
  const boughtSomething =
    session.payment_status === "paid" ||
    (session.mode === "subscription" &&
      session.payment_status === "no_payment_required");
  if (!boughtSomething || session.metadata?.customerId !== user.id) {
    return <PurchaseConfirmationFallback />;
  }

  // Bought, and no row. Two very different reasons, and the parent deserves to be
  // told which: the webhook hasn't landed yet (wait), or the payment was refused
  // as a duplicate because this gamer already holds a spot on this product. In
  // the second case no row will *ever* carry this session id, so waiting would
  // spin forever under copy promising it only takes a moment.
  // `metadata` is non-null past the check above: a session without it can't have
  // matched the signed-in user's id.
  //
  // `|| undefined` rather than a bare read: Stripe types metadata as a total
  // string map, so a session that somehow lacks the key reads as `undefined` at
  // runtime while the compiler believes it is a string. Falsiness is the honest
  // test — a blank id is as unusable here as a missing one.
  const participantId = session.metadata.participantId || undefined;
  const productId = session.metadata.productId;
  if (participantId && productId) {
    let alreadySeated = false;
    try {
      alreadySeated = await participations.hasSeatOnProduct(
        productId,
        participantId,
      );
    } catch {
      // Unreadable → treat as "not a duplicate" and wait. The waiting state is
      // bounded, so a wrong guess here costs a delay, not a dead end.
    }
    if (alreadySeated) {
      return <PurchaseConfirmationNotice kind="duplicatePayment" />;
    }
  }

  // Stripe waits up to ten seconds on our webhook before redirecting, so getting
  // here needs the endpoint to have failed or run long. Show that the payment
  // worked and wait for the row — telling a parent who has just been charged
  // that we can't find their order would be both alarming and wrong.
  return (
    <PurchaseConfirmationFinalizing checkoutSessionId={checkoutSessionId} />
  );
}

/** The shared tail: resolve the product, then render the summary. */
async function renderConfirmation(
  supabase: AppSupabaseClient,
  participations: ParticipationsService,
  confirmation: ParticipationConfirmation | null,
) {
  if (!confirmation) return <PurchaseConfirmationFallback />;

  let product: ProductBrowseRow | null = null;
  let waitlistPosition: number | null = null;
  // "Your first charge is on …", for a club bought before it starts. Null on
  // every other signup, and on any read the viewer isn't the payer for.
  let firstChargeAt: string | null = null;
  // A waitlisted participation lands on the waitlist summary variant.
  const outcome: SignupOutcome =
    confirmation.status === "waitlisted" ? "waitlisted" : "enrolled";

  try {
    product = await new ProductsService(supabase).getDetailById(
      confirmation.productId,
    );
    // "You're #N" — fetched live (not the stale join-time value) so a parent
    // who revisits sees their position shrink as people ahead leave. Null is
    // tolerated: the view just omits the line.
    if (outcome === "waitlisted" && confirmation.participationId) {
      waitlistPosition = await participations.getWaitlistPosition(
        confirmation.participationId,
      );
    }
    if (outcome === "enrolled" && confirmation.participationId) {
      firstChargeAt = await participations.getDeferredFirstChargeAt(
        confirmation.participationId,
      );
    }
  } catch {
    // Same swallow as above — a friendly fallback beats a 500.
  }

  if (!product) return <PurchaseConfirmationFallback />;

  return (
    <PurchaseConfirmationView
      product={product}
      participantName={confirmation.participantName}
      // Which of the two voices the page speaks in. The row answers it
      // (participant = customer), so the same page is in the second person for
      // a parent's own seat and in the third for a child's, whoever is reading.
      isSelfSeat={confirmation.isSelfSeat}
      outcome={outcome}
      waitlistPosition={waitlistPosition}
      firstChargeAt={firstChargeAt}
    />
  );
}
