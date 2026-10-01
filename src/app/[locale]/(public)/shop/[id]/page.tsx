import type { Metadata, ResolvingMetadata } from "next";
import { Suspense } from "react";
import {
  buildProductMetadata,
  isListedInShop,
} from "@/lib/products/product-metadata";
import { ListedProductJsonLd } from "@/components/public/products/listed-product-json-ld";
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

// The product's Open Graph card is built by `buildProductMetadata`, shared with
// the municipality route (/schools/[municipalityName]/[id]) that renders this
// same page for the same product row. This route is the one where a product
// page can be promoted: it is indexable, with its language versions and its
// structured data, exactly while the product is on the shop's listing, and
// `noindex` otherwise — decided on every request, so unlisting takes effect at
// the next crawl. See the robots policy in `product-metadata.ts`.
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  // The listing check and the card's read run together: the check is handed
  // over unawaited, and the card awaits it only once its own read is back.
  return buildProductMetadata(id, parent, isListedInShop(id));
}

export default async function ShopProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      {/* Behind its own boundary so the shell streams without waiting on the
          listing check and the product read; the streamed block still lands
          in the same HTML response. */}
      <Suspense fallback={null}>
        <ListedProductJsonLd productId={id} />
      </Suspense>
      <ProductDetailPage productId={id} />
    </>
  );
}
