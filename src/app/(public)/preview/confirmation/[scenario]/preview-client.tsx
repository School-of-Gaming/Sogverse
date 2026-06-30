"use client";

import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import {
  buildConfirmationFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";

interface ConfirmationPreviewClientProps {
  scenario: PreviewScenario;
}

export function ConfirmationPreviewClient({
  scenario,
}: ConfirmationPreviewClientProps) {
  const { product, gamerName, outcome } = buildConfirmationFixture(scenario);
  return (
    <PurchaseConfirmationView
      product={product}
      gamerName={gamerName}
      outcome={outcome}
    />
  );
}
