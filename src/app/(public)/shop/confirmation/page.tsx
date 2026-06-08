import { createClient } from "@/lib/supabase/server";
import { ParticipationsService } from "@/services/participations";
import { ProductsService } from "@/services/products";
import {
  PurchaseConfirmationView,
  PurchaseConfirmationFallback,
} from "@/components/public/products/purchase-confirmation-view";
import type { ProductBrowseRow } from "@/types";

// Post-purchase confirmation page. Both the paid flow (Stripe `success_url`)
// and the free-signup flow (router.push) land here with `?p=<participationId>`.
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
  let product: ProductBrowseRow | null = null;
  let gamerName: string | null = null;
  try {
    const confirmation = await new ParticipationsService(
      supabase,
    ).getConfirmation(participationId);
    if (confirmation) {
      product = await new ProductsService(supabase).getDetailById(
        confirmation.productId,
      );
      gamerName = confirmation.gamerName;
    }
  } catch {
    // RLS miss / stale id / transient error → render the friendly fallback
    // rather than a 500. A real purchaser never lands in here.
  }

  if (!product) return <PurchaseConfirmationFallback />;

  return <PurchaseConfirmationView product={product} gamerName={gamerName} />;
}
