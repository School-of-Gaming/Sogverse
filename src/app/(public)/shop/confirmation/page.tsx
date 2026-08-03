import Stripe from "stripe";
import { createClient, getUser } from "@/lib/supabase/server";
import { ParticipationsService } from "@/services/participations";
import { ProductsService } from "@/services/products";
import {
  PurchaseConfirmationView,
  PurchaseConfirmationFallback,
  PurchaseConfirmationFinalizing,
  type SignupOutcome,
} from "@/components/public/products/purchase-confirmation-view";
import type { ParticipationConfirmation } from "@/services/participations";
import type { AppSupabaseClient, ProductBrowseRow } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
 * The paid path. Three things have to hold before this page will show anyone an
 * order: Stripe must recognise the session, it must actually be paid, and its
 * metadata must name the signed-in user as the purchaser. A session id is not
 * secret in the way a participation id is — it rides in a URL the parent could
 * paste anywhere — so the ownership check is what stops it doubling as a peek at
 * someone else's purchase. (The row read underneath is RLS-scoped too, so the
 * check is the outer of two gates, not the only one.)
 */
async function renderPaidConfirmation(
  supabase: AppSupabaseClient,
  participations: ParticipationsService,
  checkoutSessionId: string,
) {
  const user = await getUser();
  if (!user) return <PurchaseConfirmationFallback />;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
  } catch {
    // Unknown or malformed session id — a stale or hand-edited link.
    return <PurchaseConfirmationFallback />;
  }

  if (
    session.payment_status !== "paid" ||
    session.metadata?.customerId !== user.id
  ) {
    return <PurchaseConfirmationFallback />;
  }

  let confirmation: ParticipationConfirmation | null = null;
  try {
    confirmation =
      await participations.getConfirmationByCheckoutSession(checkoutSessionId);
  } catch {
    // Same swallow as the participation path: a transient read failure lands on
    // the finalizing state below, which retries, rather than on a 500.
  }

  // Paid, but no row yet: the webhook has not landed. Stripe waits up to ten
  // seconds on it before redirecting, so this needs the endpoint to have failed
  // or run long. Show that the payment worked and wait for the row — telling a
  // parent who has just been charged that we can't find their order would be
  // both alarming and wrong.
  if (!confirmation) {
    return (
      <PurchaseConfirmationFinalizing checkoutSessionId={checkoutSessionId} />
    );
  }

  return renderConfirmation(supabase, participations, confirmation);
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
  } catch {
    // Same swallow as above — a friendly fallback beats a 500.
  }

  if (!product) return <PurchaseConfirmationFallback />;

  return (
    <PurchaseConfirmationView
      product={product}
      gamerName={confirmation.gamerName}
      outcome={outcome}
      waitlistPosition={waitlistPosition}
    />
  );
}
