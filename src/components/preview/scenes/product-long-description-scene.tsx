"use client";

import { registrationCtaKind } from "@/components/public/products/derive-registration-state";
import { buildLongDescriptionSceneFixture } from "@/components/public/products/mock-long-description-fixtures";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { previewSceneHref } from "../href";

/**
 * The product detail page with a full marketing long description on it.
 *
 * **The live body, over a fixture row** — not a draft, not a wrapper. The field
 * is markdown in the column, so the page reads it the way it reads any other
 * translated string and there is nothing left for a scene-only body to inject.
 * Everything around the blurb comes from the ordinary product fixtures, so what
 * is being judged is a real page with real copy in it rather than a card on its
 * own.
 *
 * A client component because the fixture resolves live countdown timestamps for
 * the signup panel, exactly as the sibling product scene does. The panel's CTA
 * points at the matching confirmation scene, so the previews still chain.
 */
export function ProductLongDescriptionScene() {
  const fixture = buildLongDescriptionSceneFixture();
  // The club these fixtures are built on, so the CTA lands on the same summary
  // the sibling product scene's does.
  const summaryHref = previewSceneHref("confirmation", "consumer-club");

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
      signupActionable={registrationCtaKind(fixture.state) === "primary"}
    />
  );
}
