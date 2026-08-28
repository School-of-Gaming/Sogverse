"use client";

import { useState } from "react";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { registrationCtaKind } from "@/components/public/products/derive-registration-state";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import {
  buildScenarioFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { resolveRegionGate } from "@/components/public/products/region-lock/region-gate";
import type { RegionLockScenarioMeta } from "@/components/public/products/region-lock/region-lock-scenarios";
import type { ConfirmedHomeLocation } from "@/components/public/products/signup-panel-view";
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
 * stands, so it does what that shell does — resolve the gate through the same
 * shared function, with the scenario's seeded location standing in for the
 * keyed read, and hold the place the parent picks — while the panel below owns
 * the dialog, exactly as in production.
 */
export function ProductDetailScene({
  scenario,
  regionLock,
  requiredConsentSlugs,
  // TEMP — strip before merge.
  fillerConsents,
}: {
  scenario: PreviewScenario;
  regionLock?: RegionLockScenarioMeta;
  /**
   * The enrolment conditions this scenario's product requires. Absent on every
   * ordinary scenario, which is what the live page looks like for nearly every
   * product; the required-consents scenario is the one that sets it, standing
   * in for the detail query's `product_required_consents` embed.
   */
  requiredConsentSlugs?: readonly string[];
  // TEMP — strip before merge. Obviously-fake extra consent rows for INSIDE the
  // panel's Required consent section, so the panel itself is taller than a
  // 1080p viewport and the two-end clamp can be judged by scrolling a rail whose
  // CTA sits at its very bottom. Only the `required-consents-tall` scenario
  // sets it.
  fillerConsents?: readonly string[];
}) {
  // A place confirmed in the panel's dialog, held exactly where the live
  // route's data shell holds it — so the pick outranks the scenario's seeded
  // location the same way it outranks a keyed read in production, and a
  // reviewer can walk from "no location" into either outcome (the confirmation
  // in place, or the overlay) without opening a second page. The write behind
  // it is inert, as every backend-touching action in a scene is: there is no
  // profile row here.
  const [confirmed, setConfirmed] = useState<ConfirmedHomeLocation | undefined>(
    undefined,
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
          requiredConsentSlugs={requiredConsentSlugs}
          // TEMP — strip before merge. The height comes from INSIDE the panel:
          // extra fake consent rows in its own Required consent section, which
          // is the shape a genuinely tall panel has and the one the clamp has to
          // make reachable.
          fillerConsents={fillerConsents}
          state={fixture.state}
          authState={fixture.authState}
          summaryHref={summaryHref}
          // The shell's own call, verbatim: a scenario's seeded country stands
          // in for the keyed read, the dialog's pick outranks it, and a
          // codeless pick fails open here for the same reason it does live.
          regionGate={resolveRegionGate({
            regionLockCountry: product.region_lock_country,
            confirmedCountry: confirmed?.countryCode,
            homeLocationReadFailed: false,
            homeLocationCountry: regionLock?.viewerCountry ?? undefined,
          })}
          homeLocationName={
            confirmed?.name ?? regionLock?.viewerLocationName ?? null
          }
          onLocationPicked={setConfirmed}
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
