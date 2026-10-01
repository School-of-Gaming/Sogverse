import type { Metadata, ResolvingMetadata } from "next";
import { buildProductMetadata } from "@/lib/products/product-metadata";
import { ProductDetailPage } from "@/components/public/products/product-detail-page";

interface PageProps {
  params: Promise<{ municipalityName: string; id: string }>;
}

// A municipality club's detail page, reached from its `/schools/<slug>` listing.
// Renders the same detail UI as `/shop/[id]`, with the back link pointed at that
// listing (labelled with the municipality) instead of the storefront. The
// product itself is fetched client-side by <ProductDetailPage>, exactly as on
// `/shop/[id]`.
//
// **The page component reads nothing.** The slug is handed straight to the
// detail page, which builds the back link's href from it and takes the label's
// municipality name off the product row it is already fetching — the embed
// carries the municipality's `name`/`name_i18n` at depth 0 (online club) or 1
// (in-person), so the name costs nothing extra. This route used to read every
// Finnish municipality here to turn the slug into that one string, which was
// most of its cold TTFB.
//
// Two consequences of that, both deliberate:
//
//   - **The slug is not validated, and an unknown one no longer 404s.** It never
//     gated the product — it only decided where "back" goes — so a hand-typed
//     slug now renders the club with a back link to a listing that 404s itself.
//     Accepted: the route is noindex and normal navigation always pairs the
//     right slug with the right club.
//   - **The href still comes from the URL slug, never from the product's own
//     municipality**, so the child URL stays in the slug namespace its parent
//     listing was linked from (`helsingfors` stays `helsingfors`).

/**
 * Robots policy: **noindex, unconditionally**, whatever the product — the
 * whole `/schools` tree is reachable, never promoted
 * (`docs/architecture/site-quality.md`). Its products are only for families
 * living in the named municipalities, and a consumer product opened here is a
 * second URL for a row whose promoted page, if it has one, is its shop
 * address. The Open Graph card is the product's own, from the builder the shop
 * route shares, so a club pasted into a school's parent group unfurls as the
 * club rather than as the generic site-wide preview.
 *
 * The municipality slug deliberately plays no part in it. It decides where the
 * back link returns to, not which product this is, and two URLs onto one row
 * must not describe that row differently.
 *
 * This is now the route's only server-side read.
 */
export async function generateMetadata(
  { params }: PageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  return buildProductMetadata(id, parent, false);
}

export default async function MunicipalityClubDetailPage({ params }: PageProps) {
  const { municipalityName, id } = await params;

  return <ProductDetailPage productId={id} municipalitySlug={municipalityName} />;
}
