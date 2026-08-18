import { getCountryConfig } from "@/lib/constants/location-hierarchies";

/**
 * **The region lock, as the shop panel has to reason about it.**
 *
 * A product may name one country it is sold in (`products.region_lock_country`,
 * ISO 3166-1 alpha-2). A parent may buy a seat on it only if the family's
 * self-attested home location sits in that country — the country of the
 * `locations` row their `profiles.home_location_id` points at.
 *
 * This module owns exactly that decision and nothing else. Two codes in, one of
 * four answers out, no React, no data access — so the fixture-driven preview
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
 * The four answers, and why each is its own state:
 *
 * - `unlocked` — there is no lock on this product, so there is nothing to say
 *   and no trace that anything was checked. It is also what the page hands back
 *   when the read behind the check failed: the block is a soft signal, and
 *   turning a failed lookup into a refusal would cost an honest buyer their
 *   purchase over our own outage.
 * - `eligible` — the product is locked and this family is inside it. The signup
 *   form stays whole and gains a section stating where the product is offered
 *   and where the family lives. It carries no action: the statement is worth
 *   making to the people it is true for — it explains why the location on file
 *   matters — but changing a location mid-purchase is settings' business, not
 *   the panel's. Its sentence is the refusal's *converse*, not its twin: the
 *   blocked reader is told the product is only offered somewhere else, and this
 *   reader is told it is available to them because of where they live. Two
 *   speech acts, two message keys, deliberately not one.
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
 *
 * `eligible` and `no_location` share a slot on the panel, which is what makes
 * answering the question in place possible: a parent who confirms a matching
 * location watches the section they were asked to fill in become the section
 * saying they are in. `unlocked` and `wrong_country` are the two ends that show
 * nothing and everything.
 */
export type RegionGate =
  | { kind: "unlocked" }
  | { kind: "eligible"; requiredCountry: string }
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
  if (viewerCountry === regionLockCountry) {
    return { kind: "eligible", requiredCountry: regionLockCountry };
  }
  return { kind: "wrong_country", requiredCountry: regionLockCountry };
}

/**
 * Everything the live page knows about where this family lives, before it has
 * a country to compare.
 */
export interface RegionGateInputs {
  /** The product's lock — `products.region_lock_country`. */
  regionLockCountry: string | null;
  /**
   * The country of a place confirmed in the panel's own dialog. Undefined until
   * one is; it outranks the read for as long as both are in play, because the
   * picker handed us the row the profile now points at and the keyed read of it
   * is merely catching up.
   *
   * `null` is a *confirmed* pick whose row carries no country — the same three
   * values the read below has, and for the same reason: "they picked a place
   * with no code" and "they have picked nothing" are different facts and are
   * answered differently.
   */
  confirmedCountry: string | null | undefined;
  /**
   * The keyed read of the family's home location errored — and, in the live
   * page, *has errored at any point during this mount*. It is latched there
   * rather than sampled per render, because a late success flipping this back
   * to false would rewrite a panel the parent is already filling in.
   */
  homeLocationReadFailed: boolean;
  /**
   * The country on the resolved home-location row. Three distinct values:
   * a code, `null` for a row that carries none, and `undefined` for no row at
   * all — no location stored, or a stored id that resolves to nothing.
   */
  homeLocationCountry: string | null | undefined;
}

/**
 * The gate the live page shows, reads and all.
 *
 * `deriveRegionGate` answers the question once there is a country to compare;
 * this answers what to do when there might not be, and it lives here rather
 * than in the page because the two ways of not knowing are a *rule*, not
 * plumbing — and a rule stated in a component is one nothing can test.
 *
 * **All three of them fail open.** The block is a soft UI signal with nothing
 * behind it, so the two errors are not symmetric: refusing an honest buyer — or
 * standing them in front of a question they have already answered — costs a
 * sale over a fault of ours, while letting one family past a lock the server
 * never enforced costs nothing the design was relying on.
 *
 * - **The read failed.** No country now, and none for the rest of this mount:
 *   the caller latches the failure, so a retry landing later cannot take the
 *   form back off a parent who is already filling it in.
 * - **The row resolved and carries no country at all.** Deliberately not
 *   `no_location`: their location *is* set, this read is the authority on it,
 *   and offering the dialog would ask them to overwrite a stored value to
 *   answer a question about data we are missing.
 * - **The place they just confirmed carries no country.** The same fact as
 *   above, learned a different way, so it gets the same answer — and it has to,
 *   or the one path that was supposed to clear the question would end by asking
 *   it again, with the panel wedged on an answer no pick can give.
 */
export function resolveRegionGate({
  regionLockCountry,
  confirmedCountry,
  homeLocationReadFailed,
  homeLocationCountry,
}: RegionGateInputs): RegionGate {
  if (confirmedCountry !== undefined) {
    if (confirmedCountry === null) return { kind: "unlocked" };
    return deriveRegionGate(regionLockCountry, confirmedCountry);
  }
  if (homeLocationReadFailed) return { kind: "unlocked" };
  if (homeLocationCountry === null) return { kind: "unlocked" };
  return deriveRegionGate(regionLockCountry, homeLocationCountry ?? null);
}

/**
 * A country code as a reader's own language spells it.
 *
 * **The one home for this chain**, and every surface that has to name a locked
 * country calls it — the shop panel's three sentences and the admin details
 * row alike. Two copies of a four-link fallback chain drift silently: they had
 * already grown different guards and different config lookups before this was
 * folded back together.
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
 *
 * Two details of the `Intl` call are load-bearing, and are the same two the
 * admin form's country picker states:
 *
 * - **`"en"` is listed second, not left implicit.** A bare `[locale]` falls back
 *   to the *runtime* default locale for any locale ICU has no data for — which
 *   is `tlh` — and that default differs between the server and each visitor's
 *   machine. The result is a hydration mismatch on exactly the sentence this
 *   function exists to build. A named second language makes both ends agree.
 * - **`fallback: "none"`**, so an unknown region resolves to `undefined` and the
 *   chain below actually runs. The default (`"code"`) hands back the code
 *   itself, which is truthy — it would make the documented fallbacks dead code
 *   and quietly print "families in FI" where the config knows the word.
 */
export function countryDisplayName(code: string, locale: string): string {
  const fallback = getCountryConfig(code)?.name ?? code;
  // `Intl.DisplayNames.of` throws a RangeError on anything that is not a
  // well-formed region subtag, so the shape is checked rather than caught: a
  // malformed code is a data problem, and a try/catch here would swallow it.
  if (!/^[A-Za-z]{2}$/.test(code)) return fallback;
  return (
    new Intl.DisplayNames([locale, "en"], {
      type: "region",
      fallback: "none",
    }).of(code) ?? fallback
  );
}
