import type { PreviewScenario } from "../mock-detail-fixtures";

/**
 * **The region-lock candidates as preview scenarios.**
 *
 * Seven pages on the existing product-detail scene: each of the three
 * candidates in each of the two blocked states, plus one unlocked page they all
 * share. They are a slug space of their own rather than entries in
 * `PreviewScenario`, because they are not products — every one of them renders
 * the *same* product fixture, and the only thing that varies is the gate and
 * which candidate is being looked at. Folding them into the product fixtures
 * would mean seven near-identical clubs whose difference lived somewhere the
 * fixture could not state.
 *
 * Data-only, like the confirmation notices beside them: the scene registry is
 * React-free and reads this list to publish the links, and the scene component
 * reads it to build the page.
 *
 * **The unlocked scenario is one page, not three.** All three candidates return
 * no slots at all for a permitted family, so a per-candidate copy of it would
 * be three identical pages inviting a reviewer to look for a difference that
 * cannot exist. It is listed under one candidate arbitrarily and says so.
 */
export type RegionLockVariant = "hybrid" | "overlay-both" | "checklist-both";

export interface RegionLockScenarioMeta {
  slug: string;
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: string;
  /** What this page shows that its siblings don't. Developer-facing English. */
  description: string;
  variant: RegionLockVariant;
  /** The product's lock — `products.region_lock_country`. */
  regionLockCountry: string | null;
  /** The country derived from the parent's home location; null when unset. */
  viewerCountry: string | null;
}

/**
 * The product every region-lock scenario renders: the flagship paid consumer
 * club, signed in with children, registration open. Chosen because it is the
 * fullest page the shop produces — hero art, a long marketing blurb, a price
 * with a monthly cadence on the CTA — so the block is judged against a page
 * with something to lose, rather than against a bare one.
 */
export const REGION_LOCK_BASE_SCENARIO: PreviewScenario = "consumer-club";

/** The country the fixture products are locked to. */
const LOCK = "FI";
/** Where the family is, in the wrong-country scenarios. */
const ELSEWHERE = "SE";

export const REGION_LOCK_SCENARIOS: readonly RegionLockScenarioMeta[] = [
  {
    slug: "region-hybrid-no-location",
    label: "Region lock · hybrid — no location set",
    description:
      "The form stays, an info note sits above the picker, and the CTA becomes “Set your location” — live, and opening the real location dialog over the rail. The case for it: a missing location is a question, not a refusal, so nothing is taken away and the one thing that unblocks the page is in the place the parent's eye already goes when a button will not click.",
    variant: "hybrid",
    regionLockCountry: LOCK,
    viewerCountry: null,
  },
  {
    slug: "region-hybrid-wrong-country",
    label: "Region lock · hybrid — wrong country",
    description:
      "The other half of the hybrid, and the one to compare against its sibling above: the form is gone entirely, replaced by the muted note naming the country — the same swap the panel already makes for a signed-in gedu. Open both and the question is whether two shapes for two situations reads as considered or as the panel changing its mind.",
    variant: "hybrid",
    regionLockCountry: LOCK,
    viewerCountry: ELSEWHERE,
  },
  {
    slug: "region-overlay-no-location",
    label: "Region lock · overlay both — no location set",
    description:
      "Nothing is offered until the family is known: the picker, the consent box and the CTA are all replaced by the note and one full-width button into the location dialog. The heaviest of the three responses to a missing field — worth opening next to the hybrid's version of the same state, since that is the whole argument between them.",
    variant: "overlay-both",
    regionLockCountry: LOCK,
    viewerCountry: null,
  },
  {
    slug: "region-overlay-wrong-country",
    label: "Region lock · overlay both — wrong country",
    description:
      "Identical treatment to the state above, which is this candidate's entire claim: “blocked” is one shape a reader learns once. The page keeps its price and its seat bar and loses everything you could act on.",
    variant: "overlay-both",
    regionLockCountry: LOCK,
    viewerCountry: ELSEWHERE,
  },
  {
    slug: "region-checklist-no-location",
    label: "Region lock · checklist both — no location set",
    description:
      "Indistinguishable from the hybrid's no-location page, on purpose: the two candidates agree about this state and disagree about the other one. It is here so the pair can be walked as a pair rather than reconstructed from memory.",
    variant: "checklist-both",
    regionLockCountry: LOCK,
    viewerCountry: null,
  },
  {
    slug: "region-checklist-wrong-country",
    label: "Region lock · checklist both — wrong country",
    description:
      "The page that only this candidate can produce: a complete, working signup form — pick a child, tick the rules — under a note saying the product is not sold here, with a CTA that names the refusal and never enables. The panel never changes shape; the question is whether a form nobody can submit is honest or a trap.",
    variant: "checklist-both",
    regionLockCountry: LOCK,
    viewerCountry: ELSEWHERE,
  },
  {
    slug: "region-unlocked",
    label: "Region lock · matching country — the reference page",
    description:
      "The control. A locked product opened by a family in the right country: the ordinary signup panel, with no note, no extra step and no trace that a check happened. One page for all three candidates, because none of them renders anything here — open it in a second tab and every blocked page above is a diff against it.",
    variant: "hybrid",
    regionLockCountry: LOCK,
    viewerCountry: LOCK,
  },
];

/** The scenario for a slug, or null when the slug is an ordinary product one. */
export function findRegionLockScenario(
  slug: string,
): RegionLockScenarioMeta | null {
  return REGION_LOCK_SCENARIOS.find((s) => s.slug === slug) ?? null;
}
