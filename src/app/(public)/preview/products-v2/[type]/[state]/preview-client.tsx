"use client";

import { ProductDetailPageBody } from "@/components/public/products-v2/product-detail-page-body";
import {
  buildDetailFixture,
  type PreviewStateKind,
} from "@/components/public/products-v2/mock-detail-fixtures";
import type { ProductTypeV2 } from "@/types";

interface ProductDetailPreviewClientProps {
  productType: ProductTypeV2;
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
      fixedNowMs={fixture.fixedNowMs}
      previewBanner
    />
  );
}
