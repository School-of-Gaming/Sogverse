"use client";

import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import {
  buildConfirmationFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";

/**
 * The post-signup summary for a scenario — what a parent sees straight after
 * paying (or joining the waiting list). A client component because the fixture
 * build can resolve live countdown timestamps.
 */
export function PurchaseConfirmationScene({
  scenario,
}: {
  scenario: PreviewScenario;
}) {
  const { product, gamerName, outcome, waitlistPosition } =
    buildConfirmationFixture(scenario);
  return (
    <PurchaseConfirmationView
      product={product}
      gamerName={gamerName}
      outcome={outcome}
      waitlistPosition={waitlistPosition}
    />
  );
}
