"use client";

import { useParams } from "next/navigation";
import { ProductDetailPage } from "@/components/public/products-v2/product-detail-page";

// Detail page shared by consumer-club and municipality-club rows. The
// router only ever lands consumer clubs here from the parent /clubs
// browse grid; municipality-club rows reach this same component via
// the future /registration entry point (out of scope here, but the
// component is reusable as-is — see redesign §7).
//
// `productType` is fixed to consumer_club for this surface; the body
// reads `product.product_type` for type-specific copy / verb selection
// where it matters, so a muni row threaded in via /registration would
// render its own banner + verb correctly.
export default function ClubDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProductDetailPage productId={params.id} productType="consumer_club" />;
}
