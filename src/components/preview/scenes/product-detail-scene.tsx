"use client";

import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import { ProductDetailPageBodyDraft } from "@/components/public/products/product-detail-page-body-draft";
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
 * **A tagged scenario renders the draft page body; every other one renders the
 * live one, untouched.** The choice is made here rather than inside either body
 * — that is what keeps "one body, two shells" true of the page as well as of
 * the card: neither body knows the other exists, and the live one carries no
 * draft switch at all. The panel is the same component either way; the draft
 * only moves it into a rail.
 *
 * The tag is the switch because the tag is what the redesign added: the shop
 * grid's cards link here, so a card wearing "Neuroinclusive" has to land on a
 * page wearing it too — same chip, same words, same picture, all read from the
 * shared per-scenario maps. An untagged scenario has nothing new to show, and
 * keeping it on the live page is what leaves the current design reviewable
 * beside the draft.
 *
 * Four of the redesign grid's cards carry demo art without a tag. Their detail
 * pages stay live, so that art is unused there — accepted: the alternative is
 * switching the whole page on "has a picture", which puts the layout behind a
 * fixture detail rather than behind the thing being reviewed.
 */
export function ProductDetailScene({ scenario }: { scenario: PreviewScenario }) {
  const fixture = buildScenarioFixture(scenario);
  const summaryHref = previewSceneHref("confirmation", scenario);
  const tag = scenarioTag(scenario);

  const panelProps = {
    product: fixture.product,
    state: fixture.state,
    authState: fixture.authState,
    summaryHref,
  };

  if (tag !== null) {
    return (
      <ProductDetailPageBodyDraft
        product={fixture.product}
        // `flat` is the panel's opt-in presentation variant, set only here: the
        // draft's rail is 20rem, and the panel's card-in-card-in-card nesting
        // leaves a participant row too narrow there for a name, an age and
        // "Already joined" on one line. Nothing about the panel's behaviour or
        // states changes — see `SignupPanelViewProps.flat`.
        signupPanel={<PreviewSignupPanel {...panelProps} flat />}
        tag={tag}
        // Fixture rows carry no storage path, so the hero needs the same demo
        // art the card showed; `null` from the map is a deliberate "no picture"
        // and paints the wordmark banner.
        imageSrc={scenarioArt(scenario)}
      />
    );
  }

  return (
    <ProductDetailPageBody
      product={fixture.product}
      signupPanel={<PreviewSignupPanel {...panelProps} />}
    />
  );
}
