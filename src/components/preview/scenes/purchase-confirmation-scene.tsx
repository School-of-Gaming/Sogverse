"use client";

import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import {
  buildConfirmationFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
import type { ProductTopic } from "@/types";

/**
 * The post-signup summary for a scenario — what a parent sees straight after
 * paying (or joining the waiting list). A client component because the fixture
 * build can resolve live countdown timestamps.
 *
 * The confirmation surface's other scenarios — the paid states with no order
 * row to show — don't come through here: they need no fixture, so the renderer
 * mounts `PurchaseConfirmationNotice` for them directly.
 */
export function PurchaseConfirmationScene({
  scenario,
  topic = null,
}: {
  scenario: PreviewScenario;
  /**
   * The `?topic=` axis. The prep card on this page is decided by the product's
   * topic, and the fixtures name one topic per scenario — so this is how all
   * seven guides are read in their real placement without a scenario apiece.
   * `null` leaves the fixture's own topic alone.
   */
  topic?: ProductTopic | null;
}) {
  const {
    product,
    participantName,
    isSelfSeat,
    outcome,
    waitlistPosition,
    firstChargeAt,
  } = buildConfirmationFixture(scenario, { topic: topic ?? undefined });
  return (
    <PurchaseConfirmationView
      product={product}
      participantName={participantName}
      isSelfSeat={isSelfSeat}
      outcome={outcome}
      waitlistPosition={waitlistPosition}
      firstChargeAt={firstChargeAt}
    />
  );
}
