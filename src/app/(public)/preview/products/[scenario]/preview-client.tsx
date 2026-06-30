"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import {
  buildScenarioFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";

interface ProductDetailPreviewClientProps {
  scenario: PreviewScenario;
}

export function ProductDetailPreviewClient({
  scenario,
}: ProductDetailPreviewClientProps) {
  const fixture = buildScenarioFixture(scenario);
  return (
    <ProductDetailPageBody
      product={fixture.product}
      state={fixture.state}
      authState={fixture.authState}
    />
  );
}
