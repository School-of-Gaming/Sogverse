"use client";

import { useParams } from "next/navigation";
import { ProductDetailPage } from "@/components/public/products/product-detail-page";

// Unified product detail / signup page for the shop. One route for every
// product type — the page fetches the product and derives its type from the
// row (for type-specific copy and the "back to listing" link). The URL ends in
// an opaque product id, so a per-type path segment (/shop/clubs/[id]) would add
// nesting without making the URL any more readable; a single /shop/[id] keeps
// it simple.
export default function ShopProductDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProductDetailPage productId={params.id} />;
}
