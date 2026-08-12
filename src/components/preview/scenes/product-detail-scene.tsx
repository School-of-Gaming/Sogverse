"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import {
  buildScenarioFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
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
 */
export function ProductDetailScene({ scenario }: { scenario: PreviewScenario }) {
  const fixture = buildScenarioFixture(scenario);
  const summaryHref = previewSceneHref("confirmation", scenario);

  return (
    <ProductDetailPageBody
      product={fixture.product}
      signupPanel={
        <PreviewSignupPanel
          product={fixture.product}
          state={fixture.state}
          authState={fixture.authState}
          summaryHref={summaryHref}
        />
      }
    />
  );
}
