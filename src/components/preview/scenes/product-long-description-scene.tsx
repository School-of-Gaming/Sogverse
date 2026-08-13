"use client";

import { registrationCtaKind } from "@/components/public/products/derive-registration-state";
import {
  buildLongDescriptionSceneFixture,
  type LongDescriptionScenario,
} from "@/components/public/products/mock-long-description-fixtures";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { ProductDetailPageBodyMarkdownDraft } from "@/components/public/products/product-detail-page-body-markdown-draft";
import { previewSceneHref } from "../href";

/**
 * The product detail page with a real product's worth of long description, in
 * the three renderings the format change has to be chosen between.
 *
 * **One body, two shells, and here two bodies:** the blocks scenario renders
 * the live body untouched, and the markdown ones render the draft body that
 * will replace it — which is a wrapper over the same live body with one card
 * swapped, not a copy of the page. Everything else on the page comes from the
 * ordinary product fixtures, so the comparison is against the real page rather
 * than against a stripped-down version of it.
 *
 * A client component because the fixture resolves live countdown timestamps for
 * the signup panel, exactly as the sibling product scene does. The panel's CTA
 * points at the matching confirmation scene, so the previews still chain.
 */
export function ProductLongDescriptionScene({
  scenario,
}: {
  scenario: LongDescriptionScenario;
}) {
  const fixture = buildLongDescriptionSceneFixture(scenario);
  // The club these fixtures are built on, so the CTA lands on the same summary
  // the sibling product scene's does.
  const summaryHref = previewSceneHref("confirmation", "consumer-club");
  const panel = (
    <PreviewSignupPanel
      product={fixture.product}
      state={fixture.state}
      authState={fixture.authState}
      summaryHref={summaryHref}
    />
  );
  const signupActionable = registrationCtaKind(fixture.state) === "primary";

  if (fixture.markdown === null) {
    return (
      <ProductDetailPageBody
        product={fixture.product}
        signupPanel={panel}
        signupActionable={signupActionable}
      />
    );
  }

  return (
    <ProductDetailPageBodyMarkdownDraft
      product={fixture.product}
      signupPanel={panel}
      signupActionable={signupActionable}
      longDescriptionMarkdown={fixture.markdown}
    />
  );
}
