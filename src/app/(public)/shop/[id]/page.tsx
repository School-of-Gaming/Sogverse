import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
 * Robots policy for one product page.
 *
 * `is_visible` means "listed": an unlisted product is deliberately readable and
 * purchasable by direct link (a campaign landing page, an unannounced cohort),
 * and the one thing that must not happen is the link turning up in search
 * results and making it listed after all. So an unlisted product serves
 * noindex/nofollow, and a listed one keeps the site-wide default — no metadata
 * of its own, exactly as before.
 *
 * A row we cannot read (cancelled, completed, or simply not there) also gets
 * noindex: the page renders a not-found state, and there is nothing about it
 * worth indexing either.
 *
 * This is a tag, not a robots.txt entry, and that is the point — a disallowed
 * URL is never fetched, so the crawler would never read the tag, and the URL
 * could still be indexed bare off an external link. Allowing the crawl and
 * serving noindex is what actually deindexes.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("is_visible")
    .eq("id", id)
    .maybeSingle();

  if (data?.is_visible === true) return {};
  return { robots: { index: false, follow: false } };
}

export default async function ShopProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailPage productId={id} />;
}
