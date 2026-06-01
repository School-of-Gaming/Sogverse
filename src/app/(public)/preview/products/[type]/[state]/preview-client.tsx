"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import {
  buildDetailFixture,
  type PreviewStateKind,
} from "@/components/public/products/mock-detail-fixtures";
import type { ProductType } from "@/types";

interface ProductDetailPreviewClientProps {
  productType: ProductType;
  stateKind: PreviewStateKind;
}

export function ProductDetailPreviewClient({
  productType,
  stateKind,
}: ProductDetailPreviewClientProps) {
  const fixture = buildDetailFixture(productType, stateKind);
  return (
    <ProductDetailPageBody
      product={fixture.product}
      state={fixture.state}
      authState={fixture.authState}
      previewBanner
    />
  );
}
