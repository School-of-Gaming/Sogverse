import type { Metadata } from "next";
import { ProductDetailPage } from "@/components/public/products/product-detail-page";

// Unified product detail / signup page for the shop. One route for every
// product type — the page fetches the product and derives its type from the
// row (for type-specific copy and the "back to listing" link). The URL ends in
// an opaque product id, so a per-type path segment (/shop/clubs/[id]) would add
// nesting without making the URL any more readable; a single /shop/[id] keeps
// it simple.
//
// The route shell is a server component purely so it can answer the crawler;
// everything visible is still rendered client-side by ProductDetailPage.

/**
 * Robots policy for product pages: **noindex, unconditionally.** Owner
 * decision (Aug 2026): search engines and AI crawlers may discover only the
 * `/shop` browse surface — never an individual product page, listed or not.
 * Listings change with terms and seasons; the browse page is the stable thing
 * worth a search result, and an unlisted product's direct link (a campaign, an
 * unannounced cohort) must never turn up in search and become listed after
 * all. One static rule covers every case, so no per-product read is needed.
 *
 * This is a tag, not a robots.txt entry, and that is the point — a disallowed
 * URL is never fetched, so the crawler would never read the tag, and the URL
 * could still be indexed bare off an external link. Allowing the crawl and
 * serving noindex is what actually deindexes.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ShopProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailPage productId={id} />;
}
