import type { PreviewScenario } from "../mock-detail-fixtures";

/**
 * **The two blocked region-lock states, as preview scenarios.**
 *
 * They belong to the product-detail scene — they are that page, seen by a
 * viewer the lock has something to say to — and they are two rather than one
 * because a family with no location and a family in the wrong country cannot be
 * the same viewer. A permitted family needs no scenario: the panel is untouched
 * there, which is what every other product scenario already shows.
 *
 * A slug space of their own rather than entries in `PreviewScenario`, because
 * they are not products: both render the *same* product fixture, and what
 * varies is the viewer. Folding them into the fixtures would mean near-
 * identical clubs whose difference lived somewhere the fixture could not state.
 *
 * Data-only, like the confirmation notices beside them: the scene registry is
 * React-free and reads this list to publish the links, and the scene component
 * reads it to build the page.
 */
export interface RegionLockScenarioMeta {
  slug: string;
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: string;
  /** The product's lock — `products.region_lock_country`. */
  regionLockCountry: string;
  /** The country under the parent's home location; null when they have none. */
  viewerCountry: string | null;
}

/**
 * The product both scenarios render: the flagship paid consumer club, signed in
 * with children, registration open. Chosen because it is the fullest page the
 * shop produces — hero art, a long marketing blurb, a price with a monthly
 * cadence on the CTA — so the block is judged against a page with something to
 * lose rather than against a bare one.
 */
export const REGION_LOCK_BASE_SCENARIO: PreviewScenario = "consumer-club";

/** The country the fixture product is locked to. */
const LOCK = "FI";
/** Where the family is, in the wrong-country scenario. */
const ELSEWHERE = "SE";

export const REGION_LOCK_SCENARIOS: readonly RegionLockScenarioMeta[] = [
  {
    slug: "region-no-location",
    label: "Region lock — no location set",
    regionLockCountry: LOCK,
    viewerCountry: null,
  },
  {
    slug: "region-wrong-country",
    label: "Region lock — wrong country",
    regionLockCountry: LOCK,
    viewerCountry: ELSEWHERE,
  },
];

/** The scenario for a slug, or null when the slug is an ordinary product one. */
export function findRegionLockScenario(
  slug: string,
): RegionLockScenarioMeta | null {
  return REGION_LOCK_SCENARIOS.find((s) => s.slug === slug) ?? null;
}
