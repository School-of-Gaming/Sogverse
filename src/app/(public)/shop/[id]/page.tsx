import type { Metadata, ResolvingMetadata } from "next";
import { buildProductMetadata } from "@/lib/products/product-metadata";
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

// The robots policy and the product's Open Graph card are both built by
// `buildProductMetadata`, shared with the municipality route
// (/schools/[municipalityName]/[id]) that renders this same page for the same
// product row. See its doc comment for why each part of the card is shaped the
// way it is.
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  return buildProductMetadata(id, parent);
}

export default async function ShopProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailPage productId={id} />;
}
