"use client";

import { useState } from "react";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { registrationCtaKind } from "@/components/public/products/derive-registration-state";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import {
  buildScenarioFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { deriveRegionGate } from "@/components/public/products/region-lock/region-gate";
import type { RegionLockScenarioMeta } from "@/components/public/products/region-lock/region-lock-scenarios";
import { previewSceneHref } from "../href";

/**
 * The public product detail page, rendered from a scenario fixture.
 *
 * A client component because the fixture build resolves live countdown
 * timestamps. The signup panel's CTA points at the matching confirmation
 * scene, so the two previews chain the way the real flow does.
 *
 * One body: this renders the same `ProductDetailPageBody` the live route
 * renders, and everything that varies between scenarios — the tag, the hero
 * picture, the audience, the registration state — comes off the fixture row.
 * The shop grid's cards link here, so a card wearing "Neuroinclusive" lands on
 * a page wearing the same chip in the same corner because both read one row.
 *
 * **The region-lock scenarios are this page too**, which is why they are
 * scenarios here rather than a scene of their own: the same fixture with a lock
 * written onto its row, and a viewer the lock has something to say to. They
 * name the fixture they render, so nothing here decides which product a region
 * scenario is about. This component stands where the live route's data shell
 * stands, so it does what that shell does — derive the gate and hold the
 * country the parent picks — while the panel below owns the dialog, exactly as
 * in production.
 */
export function ProductDetailScene({
  scenario,
  regionLock,
}: {
  scenario: PreviewScenario;
  regionLock?: RegionLockScenarioMeta;
}) {
  // Where the family lives. The scenario seeds it; confirming a place in the
  // panel's dialog replaces it, so the gate re-derives against the pick and a
  // reviewer can walk from "no location" into either outcome without opening a
  // second page. The write behind it is inert, as every backend-touching action
  // in a scene is — there is no profile row here.
  const [viewerCountry, setViewerCountry] = useState<string | null>(
    regionLock?.viewerCountry ?? null,
  );

  const fixture = buildScenarioFixture(scenario);
  const summaryHref = previewSceneHref("confirmation", scenario);

  // The lock rides on the product row, as it does in the database, so nothing
  // downstream is handed a fixture shape the live page would not have.
  const product = regionLock
    ? { ...fixture.product, region_lock_country: regionLock.regionLockCountry }
    : fixture.product;

  return (
    <ProductDetailPageBody
      product={product}
      signupPanel={
        <PreviewSignupPanel
          product={product}
          state={fixture.state}
          authState={fixture.authState}
          summaryHref={summaryHref}
          regionGate={deriveRegionGate(
            product.region_lock_country,
            viewerCountry,
          )}
          onLocationPicked={setViewerCountry}
        />
      }
      // Read from the registration state exactly as the live route reads it,
      // which keeps the phone-width jump button on a blocked page: it scrolls
      // the reader to the panel, and the explanation is what the panel now
      // holds.
      signupActionable={registrationCtaKind(fixture.state) === "primary"}
    />
  );
}
