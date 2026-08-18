import { SUPPORTED_COUNTRIES } from "@/lib/constants/location-hierarchies";

/**
 * **The region lock, as the shop panel has to reason about it.**
 *
 * A product may name one country it is sold in (`products.region_lock_country`,
 * ISO 3166-1 alpha-2). A parent may buy a seat on it only if the family's
 * self-attested home location sits in that country — the country of the
 * `locations` row their `profiles.home_location_id` points at.
 *
 * This module owns exactly that decision and nothing else. Two codes in, one of
 * three answers out, no React, no data access — so the fixture-driven preview
 * page and the live one make the same call. Deriving it anywhere else would be
 * a second copy of a rule that has to hold on the page *and* in the copy the
 * page renders.
 *
 * **A UI-only soft block.** Nothing here is enforcement: a parent who changes
 * their location in settings walks straight through it, and the server does not
 * care. That is the accepted design, which is why the wrong-country wording
 * never mentions settings — the block is a statement about who a product is
 * offered to, not a lock somebody is meant to pick.
 *
 * The three answers, and why "no location" is not just a flavour of "wrong":
 *
 * - `unlocked` — no lock on the product, or the family is in the right country.
 *   The panel is untouched; there is deliberately no third state where a
 *   permitted family is told they were checked.
 * - `no_location` — the product is locked and we do not know where the family
 *   is. This is a *missing input*, not a refusal, and the parent can clear it
 *   themselves in one step, so the signup form stays and gains a section asking
 *   for the location. The copy never names the country: naming it would turn a
 *   question into a hint about which answer unlocks the page.
 * - `wrong_country` — we know where they are and it is not where this product
 *   is sold. The form goes; there is no decision left for this reader, and the
 *   panel's grammar is that a full-panel note means exactly that. Here the
 *   country IS named, because a refusal that will not say what it is refusing
 *   on is worse than useless to the reader.
 */
export type RegionGate =
  | { kind: "unlocked" }
  | { kind: "no_location" }
  | { kind: "wrong_country"; requiredCountry: string };

/**
 * The gate for one product and one viewer.
 *
 * Both inputs are the shapes the live page will actually hold: the product's
 * nullable lock column, and the country code derived from the parent's home
 * location (null when they have not set one, or when the row carries no code).
 */
export function deriveRegionGate(
  regionLockCountry: string | null,
  viewerCountry: string | null,
): RegionGate {
  if (regionLockCountry === null) return { kind: "unlocked" };
  if (viewerCountry === null) return { kind: "no_location" };
  if (viewerCountry === regionLockCountry) return { kind: "unlocked" };
  return { kind: "wrong_country", requiredCountry: regionLockCountry };
}

/**
 * A country code as a reader's own language spells it.
 *
 * `Intl.DisplayNames` rather than the `name` on the country config, and the
 * reason is the sentence this lands in: "only offered to families in {country}"
 * is rendered in the viewer's locale, and the config's names are English
 * literals ("Finland", "United Kingdom") that would sit untranslated inside a
 * Finnish or French sentence. `Intl` already carries every locale's own form
 * ("Suomi", "Finlande") and is not a string anybody has to maintain.
 *
 * The config is the fallback, not the source: it covers a runtime whose ICU
 * data does not know the region, and it is the only place a code we have
 * deliberately catalogued could still be named. The bare code is the last
 * resort — wrong-looking on purpose, since a page saying "families in FI" is
 * visibly a bug rather than a quietly missing word.
 */
export function countryDisplayName(code: string, locale: string): string {
  const fallback =
    SUPPORTED_COUNTRIES.find((country) => country.code === code)?.name ?? code;
  // `Intl.DisplayNames.of` throws a RangeError on anything that is not a
  // well-formed region subtag, so the shape is checked rather than caught: a
  // malformed code is a data problem, and a try/catch here would swallow it.
  if (!/^[A-Za-z]{2}$/.test(code)) return fallback;
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? fallback;
}
