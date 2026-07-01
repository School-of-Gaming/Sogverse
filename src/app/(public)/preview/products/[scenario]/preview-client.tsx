"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
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
      signupPanel={
        <PreviewSignupPanel
          product={fixture.product}
          state={fixture.state}
          authState={fixture.authState}
          summaryHref={`/preview/confirmation/${scenario}`}
        />
      }
    />
  );
}
