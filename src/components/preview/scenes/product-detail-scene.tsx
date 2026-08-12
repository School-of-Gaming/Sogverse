"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { PreviewSignupPanel } from "@/components/public/products/preview-signup-panel";
import {
  buildScenarioFixture,
  scenarioArt,
  scenarioTag,
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
 * **A tagged scenario renders the draft masthead; every other one is the live
 * page, untouched.** The tag is the switch because the tag is what the redesign
 * added: the shop grid's cards link here, so a card wearing "Neuroinclusive"
 * has to land on a page wearing it too — same chip, same words, same picture,
 * all read from the shared per-scenario maps. An untagged scenario has nothing
 * new to show and keeps the live thumbnail masthead, which is also what keeps
 * the live layout reviewable in the previews while the draft is being judged.
 *
 * Four of the redesign grid's cards carry demo art without a tag. Their detail
 * pages stay live, so that art is unused there — accepted: the alternative is
 * switching the masthead on "has a picture", which would put the whole page
 * behind a fixture detail rather than behind the thing being reviewed.
 */
export function ProductDetailScene({ scenario }: { scenario: PreviewScenario }) {
  const fixture = buildScenarioFixture(scenario);
  const summaryHref = previewSceneHref("confirmation", scenario);
  const tag = scenarioTag(scenario);
  return (
    <ProductDetailPageBody
      product={fixture.product}
      draft={
        tag === null
          ? undefined
          : // Fixture rows carry no storage path, so the hero needs the same
            // demo art the card showed; `null` from the map is a deliberate
            // "no picture" and paints the wordmark banner.
            { tag, imageSrc: scenarioArt(scenario) }
      }
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
