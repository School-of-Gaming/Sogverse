import { createClient } from "@/lib/supabase/server";
import { ParticipationsService } from "@/services/participations";
import { ProductsService } from "@/services/products";
import {
  PurchaseConfirmationView,
  PurchaseConfirmationFallback,
  type SignupOutcome,
} from "@/components/public/products/purchase-confirmation-view";
import type { ProductBrowseRow } from "@/types";

// Post-signup summary page. The paid flow (Stripe `success_url`), the free-
// signup flow, and a waitlist join all land here with `?p=<participationId>`.
//
// Fetched server-side with the viewer's RLS-scoped client so the page renders
// complete on first paint — no client loading state, no skeleton, and so no
// layout shift. By the time the paid flow redirects here, Stripe has already
// waited on our webhook (`confirm_reservation` has run), and every field lives
// on the participation row from creation anyway, so there's nothing to poll.
//
// The static `/shop/confirmation` segment outranks the `/shop/[id]` dynamic
// route, so it never collides with a product detail URL.
export default async function ShopConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const participationId = (await searchParams).p;
  if (!participationId) return <PurchaseConfirmationFallback />;

  const supabase = await createClient();
  const participations = new ParticipationsService(supabase);
  let product: ProductBrowseRow | null = null;
  let gamerName: string | null = null;
  let outcome: SignupOutcome = "enrolled";
  let waitlistPosition: number | null = null;
  try {
    const confirmation = await participations.getConfirmation(participationId);
    if (confirmation) {
      product = await new ProductsService(supabase).getDetailById(
        confirmation.productId,
      );
      gamerName = confirmation.gamerName;
      // A waitlisted participation lands on the waitlist summary variant.
      outcome =
        confirmation.status === "waitlisted" ? "waitlisted" : "enrolled";
      // "You're #N" — fetched live (not the stale join-time value) so a parent
      // who revisits sees their position shrink as people ahead leave. Null is
      // tolerated: the view just omits the line.
      if (outcome === "waitlisted") {
        waitlistPosition =
          await participations.getWaitlistPosition(participationId);
      }
    }
  } catch {
    // RLS miss / stale id / transient error → render the friendly fallback
    // rather than a 500. A real purchaser effectively never lands here.
    //
    // Honest edge case: a transient DB/network blip is swallowed the same way,
    // so a parent who *just* paid could momentarily see the "couldn't find
    // that order" copy — alarming wording right after a charge. We accept it:
    // the failure is rare, the purchase is safe (it's in My SOG regardless),
    // and a simple page reload re-fetches and shows the real confirmation. Not
    // worth distinguishing transient errors from genuine misses today.
  }

  if (!product) return <PurchaseConfirmationFallback />;

  return (
    <PurchaseConfirmationView
      product={product}
      gamerName={gamerName}
      outcome={outcome}
      waitlistPosition={waitlistPosition}
    />
  );
}
