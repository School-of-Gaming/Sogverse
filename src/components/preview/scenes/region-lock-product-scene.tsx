"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { registrationCtaKind } from "@/components/public/products/derive-registration-state";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { deriveRegionGate } from "@/components/public/products/region-lock/region-gate";
import {
  REGION_LOCK_BASE_SCENARIO,
  type RegionLockScenarioMeta,
  type RegionLockVariant,
} from "@/components/public/products/region-lock/region-lock-scenarios";
import { SetLocationDialog } from "@/components/public/products/region-lock/set-location-dialog";
import type { RegionSlotBuilder } from "@/components/public/products/region-lock/variants/builder";
import { buildChecklistBothRegionSlots } from "@/components/public/products/region-lock/variants/checklist-both";
import { buildHybridRegionSlots } from "@/components/public/products/region-lock/variants/hybrid";
import { buildOverlayBothRegionSlots } from "@/components/public/products/region-lock/variants/overlay-both";
import { previewSceneHref } from "../href";

/**
 * **The product page under a region lock, one candidate block at a time.**
 *
 * The same body, the same fixture club and the same signup panel the ordinary
 * product scenes render — every one of these pages is that page plus a gate, so
 * a reviewer comparing a blocked page against the unlocked one is looking at a
 * genuine diff rather than at two pages that were built separately.
 *
 * The candidate is a pure function from the gate to the panel's slots, picked
 * here by slug. When the owner chooses, two of the three entries below go with
 * their files and the winner is wired into the live panel; nothing in the page
 * body, the panel or the view has a branch to unpick.
 *
 * Everything that would reach a backend is inert, and everything that is pure
 * UI works: the location dialog opens over the rail and browses real location
 * rows (the reference reads the live picker makes), the picker inside it
 * confirms, and the save holds its committing state and closes without
 * unblocking the panel — there is no profile row here to write.
 */
const BUILDERS: Record<RegionLockVariant, RegionSlotBuilder> = {
  hybrid: buildHybridRegionSlots,
  "overlay-both": buildOverlayBothRegionSlots,
  "checklist-both": buildChecklistBothRegionSlots,
};

export function RegionLockProductScene({
  scenario,
}: {
  scenario: RegionLockScenarioMeta;
}) {
  const locale = useLocale();
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  const fixture = buildScenarioFixture(REGION_LOCK_BASE_SCENARIO);
  // The CTA lands on the same confirmation scene the ordinary product page's
  // does, so the unlocked page still walks the whole detail → CTA → summary
  // flow rather than stopping at a button.
  const summaryHref = previewSceneHref(
    "confirmation",
    REGION_LOCK_BASE_SCENARIO,
  );
  // The two inputs the live page will hold: the product's lock column, and the
  // country under the parent's home location. Kept off the product row on
  // purpose — the column is being added in a separate change, and a fixture
  // that reached for a regenerated type would couple a design review to a
  // migration landing.
  const gate = deriveRegionGate(
    scenario.regionLockCountry,
    scenario.viewerCountry,
  );
  const regionGate = BUILDERS[scenario.variant]({
    gate,
    locale,
    onSetLocation: () => setLocationDialogOpen(true),
  });

  return (
    <>
      <ProductDetailPageBody
        product={fixture.product}
        signupPanel={
          <PreviewSignupPanel
            product={fixture.product}
            state={fixture.state}
            authState={fixture.authState}
            summaryHref={summaryHref}
            regionGate={regionGate}
          />
        }
        // Read from the registration state exactly as the live route reads it,
        // which means the phone-width jump button is still offered on a blocked
        // page: the gate is not part of that decision today. Whether it should
        // be — a full-width "Enrol now!" that scrolls to a panel saying the
        // product is not sold here — is a question for the same review, and it
        // is left visible rather than quietly answered.
        signupActionable={registrationCtaKind(fixture.state) === "primary"}
      />
      <SetLocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
      />
    </>
  );
}
