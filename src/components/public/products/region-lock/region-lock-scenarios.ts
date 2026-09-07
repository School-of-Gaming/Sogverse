import type { PreviewScenario } from "../mock-detail-fixtures";

/**
 * **The three region-lock states the panel says something about, as preview
 * scenarios.**
 *
 * They belong to the product-detail scene — they are that page, seen by a
 * viewer the lock has something to say to — and they are three rather than one
 * because no family can be two of them at once: a family with no location, a
 * family in the wrong country and a family in the right one are three different
 * viewers. An *unlocked* product needs no scenario at all; that is the page
 * every other product scenario already shows.
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
/**
 * A product's lock and the viewer it is being read against — everything the
 * gate needs, and nothing about which preview link is being followed.
 *
 * Split out from the scenario meta below because the lock is not only the
 * subject of these three scenarios: another scenario can be *about* something
 * else and still be locked, and it has no business inventing a slug and a link
 * label to say so.
 */
export interface ProductRegionLock {
  /** The product's lock — `products.region_lock_country`. */
  regionLockCountry: string;
  /** The country under the parent's home location; null when they have none. */
  viewerCountry: string | null;
  /**
   * What that home location is called, as the confirmation variant says it
   * back. Null wherever there is no location to name — which is every scenario
   * but the eligible one.
   */
  viewerLocationName: string | null;
}

export interface RegionLockScenarioMeta extends ProductRegionLock {
  slug: string;
  /** Link text on the admin UI Previews page. Developer-facing English. */
  label: string;
}

/**
 * The product both scenarios render: the flagship paid consumer club, signed in
 * with children, registration open. Chosen because it is the fullest page the
 * shop produces — hero art, a long marketing blurb, a price with a monthly
 * cadence on the CTA — so the block is judged against a page with something to
 * lose rather than against a bare one.
 */
export const REGION_LOCK_BASE_SCENARIO: PreviewScenario = "consumer-club";

/**
 * The country the fixture product is locked to.
 *
 * France rather than Finland, deliberately: nearly every other fixture on this
 * platform is Finnish, so a Finnish lock is invisible — a reviewer cannot tell
 * a country the panel *read* from the country everything here happens to be in.
 * A French lock makes the comparison the panel is doing legible on sight.
 *
 * Exported because it is also the country the real Roblox Programme products
 * are locked to, so the Creator Academy scenario beside these reads its lock
 * from here rather than spelling a second "FR" that could drift from this one.
 */
export const REGION_LOCK_COUNTRY = "FR";
const LOCK = REGION_LOCK_COUNTRY;
/** Where the family is, in the wrong-country scenario. */
const ELSEWHERE = "FI";

/**
 * Where the family lives, in the eligible scenario — a French commune.
 * Exported for the same reason as the lock above.
 */
export const REGION_LOCK_HOME = "Lyon";
const HOME = REGION_LOCK_HOME;

export const REGION_LOCK_SCENARIOS: readonly RegionLockScenarioMeta[] = [
  {
    slug: "region-no-location",
    label: "Region lock — no location set",
    regionLockCountry: LOCK,
    viewerCountry: null,
    viewerLocationName: null,
  },
  {
    slug: "region-wrong-country",
    label: "Region lock — wrong country",
    regionLockCountry: LOCK,
    viewerCountry: ELSEWHERE,
    viewerLocationName: null,
  },
  {
    slug: "region-eligible",
    label: "Region lock — eligible",
    regionLockCountry: LOCK,
    viewerCountry: LOCK,
    viewerLocationName: HOME,
  },
];

/** The scenario for a slug, or null when the slug is an ordinary product one. */
export function findRegionLockScenario(
  slug: string,
): RegionLockScenarioMeta | null {
  return REGION_LOCK_SCENARIOS.find((s) => s.slug === slug) ?? null;
}
