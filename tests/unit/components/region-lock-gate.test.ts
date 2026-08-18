import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countryDisplayName,
  deriveRegionGate,
  resolveRegionGate,
} from "@/components/public/products/region-lock/region-gate";
import { REGION_LOCK_SCENARIOS } from "@/components/public/products/region-lock/region-lock-scenarios";
import { SUPPORTED_COUNTRIES } from "@/lib/constants/location-hierarchies";

/**
 * The region lock's one piece of real logic. Everything else about the lock is
 * rendering: the page derives this, hands it to the panel, and the panel picks
 * a shape for it — so the decision itself is tested once, here, and nothing
 * re-derives it in a component.
 */
describe("deriveRegionGate", () => {
  it("leaves an unlocked product alone, whoever is looking", () => {
    expect(deriveRegionGate(null, null)).toEqual({ kind: "unlocked" });
    expect(deriveRegionGate(null, "SE")).toEqual({ kind: "unlocked" });
  });

  it("tells a family in the locked country that they are in it", () => {
    // Not `unlocked`: an unlocked product has nothing to say, while a permitted
    // family on a locked one is told where the product is offered — the same
    // sentence the refused reader gets, which is what makes the section a
    // parent just filled in able to turn into its own answer.
    expect(deriveRegionGate("FI", "FI")).toEqual({
      kind: "eligible",
      requiredCountry: "FI",
    });
  });

  it("asks for a location before it refuses anybody", () => {
    // A missing location is a question, not a refusal — and the answer carries
    // no country, so no copy built from it can leak which one unlocks the page.
    expect(deriveRegionGate("FI", null)).toEqual({ kind: "no_location" });
  });

  it("names the country it refuses on", () => {
    expect(deriveRegionGate("FI", "SE")).toEqual({
      kind: "wrong_country",
      requiredCountry: "FI",
    });
  });
});

/**
 * What the live page does when it has no country to compare — the half of the
 * decision that used to live inside a component and could therefore only be
 * checked by reading it.
 */
describe("resolveRegionGate", () => {
  const base = {
    regionLockCountry: "FI",
    confirmedCountry: undefined,
    homeLocationReadFailed: false,
    homeLocationCountry: undefined,
  };

  it("asks for a location when nothing has resolved one", () => {
    expect(resolveRegionGate(base)).toEqual({ kind: "no_location" });
  });

  it("reads the resolved row when there is nothing better", () => {
    expect(
      resolveRegionGate({ ...base, homeLocationCountry: "FI" }),
    ).toEqual({ kind: "eligible", requiredCountry: "FI" });
    expect(
      resolveRegionGate({ ...base, homeLocationCountry: "SE" }),
    ).toEqual({ kind: "wrong_country", requiredCountry: "FI" });
  });

  it("lets a confirmed pick outrank the read it has not caught up with", () => {
    expect(
      resolveRegionGate({
        ...base,
        confirmedCountry: "FI",
        homeLocationCountry: undefined,
      }),
    ).toEqual({ kind: "eligible", requiredCountry: "FI" });
    // Including when the read still holds the *old* country: the parent just
    // told us where they are, and the row behind them is stale by definition.
    expect(
      resolveRegionGate({
        ...base,
        confirmedCountry: "FI",
        homeLocationCountry: "SE",
      }),
    ).toEqual({ kind: "eligible", requiredCountry: "FI" });
  });

  it("fails open when the read failed, rather than asking or refusing", () => {
    // Not `no_location`: the question would be a question we already have the
    // answer to and merely failed to fetch. Not `wrong_country` either — the
    // block is unenforced, and losing an honest sale to our own outage is the
    // expensive error.
    expect(
      resolveRegionGate({ ...base, homeLocationReadFailed: true }),
    ).toEqual({ kind: "unlocked" });
  });

  it("fails open on a place the parent confirmed that carries no country", () => {
    // The same fact as the codeless row below, learned from the other
    // direction, so it has to get the same answer. Handing back `no_location`
    // here would re-ask the question on the one path that exists to clear it:
    // the parent answers, the panel asks again, and no pick they can make ever
    // moves it. Fail open instead, exactly as a codeless read does.
    expect(
      resolveRegionGate({ ...base, confirmedCountry: null }),
    ).toEqual({ kind: "unlocked" });
    // And it still outranks the read underneath it, like any confirmed pick —
    // including a read that had a perfectly good country a moment ago.
    expect(
      resolveRegionGate({
        ...base,
        confirmedCountry: null,
        homeLocationCountry: "SE",
      }),
    ).toEqual({ kind: "unlocked" });
  });

  it("fails open on a resolved row that carries no country", () => {
    // Emphatically not `no_location`: their location IS set, so offering the
    // dialog would invite them to overwrite a stored value — and the keyed read
    // would keep handing back the same codeless row, wedging the panel on a
    // question no answer clears.
    expect(
      resolveRegionGate({ ...base, homeLocationCountry: null }),
    ).toEqual({ kind: "unlocked" });
  });

  it("leaves an unlocked product unlocked down every path", () => {
    for (const inputs of [
      { ...base, regionLockCountry: null },
      { ...base, regionLockCountry: null, homeLocationCountry: "SE" },
      { ...base, regionLockCountry: null, homeLocationReadFailed: true },
    ]) {
      expect(resolveRegionGate(inputs)).toEqual({ kind: "unlocked" });
    }
  });
});

/**
 * A runtime whose ICU data cannot name a single region.
 *
 * Every environment this suite actually runs in — Node with full ICU, and every
 * browser — names all of `SUPPORTED_COUNTRIES` outright, so the two fallbacks
 * beneath the `Intl` call are unreachable *by observation*: a test that merely
 * checks the answer is not the bare code passes without the fallback ever
 * running, and would go on passing if the fallback were deleted. Blinding the
 * call is what makes those links testable at all, and it is also the honest
 * picture of the case they exist for — a small-ICU build.
 */
function blindIntlDisplayNames() {
  vi.spyOn(Intl, "DisplayNames").mockImplementation(
    () =>
      ({
        of: () => undefined,
        resolvedOptions: () => ({
          locale: "en",
          style: "long",
          type: "region",
          fallback: "none",
        }),
      }) as Intl.DisplayNames,
  );
}

describe("countryDisplayName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names a country in the reader's own language", () => {
    expect(countryDisplayName("FI", "en")).toBe("Finland");
    expect(countryDisplayName("FI", "fi")).toBe("Suomi");
  });

  it("names it in English for a locale ICU has never heard of", () => {
    // "en" is listed second in the call for exactly this: a bare [locale] would
    // fall back to the *runtime* default, which differs between the server and
    // each visitor's machine — a hydration mismatch on the one sentence this
    // function exists to build.
    expect(countryDisplayName("FI", "tlh")).toBe("Finland");
  });

  it("falls back rather than throwing on a malformed code", () => {
    // `Intl.DisplayNames.of` throws a RangeError on anything that is not a
    // well-formed region subtag, so the shape is checked before the call.
    expect(countryDisplayName("nonsense", "en")).toBe("nonsense");
  });

  it("falls through to the bare code on a region ICU cannot name", () => {
    // `fallback: "none"` is what keeps the chain below the Intl call reachable
    // at all: the default hands the code straight back, which is truthy, and
    // would make both documented fallbacks dead. "QQ" is well-formed and
    // unassigned, so it reaches the fallbacks without throwing — and it is in
    // no catalogue either, so it lands on the last resort.
    expect(countryDisplayName("QQ", "en")).toBe("QQ");
  });

  it("prefers the catalogued English name over the bare code", () => {
    // The middle link of the chain, genuinely executed. **Asserted in Finnish
    // on purpose**: the catalogue's English names happen to be character-for-
    // character what ICU returns for `en`, so an English sweep would pass
    // whether the fallback ran or not — and would go on passing if the
    // blinding below silently stopped working. In `fi` the two disagree on
    // every country ("Suomi", "Ranska", "Ruotsi"), so a pass here is proof
    // that Intl answered nothing and the config answered instead.
    blindIntlDisplayNames();
    expect(countryDisplayName("FI", "fi")).toBe("Finland");
    for (const country of SUPPORTED_COUNTRIES) {
      expect(countryDisplayName(country.code, "fi")).toBe(country.name);
    }
    // And only a code in no catalogue at all reaches the last resort.
    expect(countryDisplayName("QQ", "fi")).toBe("QQ");
  });

  it("takes ICU's word for it wherever ICU has one", () => {
    // The normal path, stated as agreement rather than as inequality: on a
    // full-ICU runtime every supported code resolves through `Intl`, and the
    // catalogue is only consulted where `Intl` returns nothing. Comparing
    // against the same call the function makes is what keeps this honest on a
    // runtime with less data, where it degrades to the assertion above rather
    // than to a false pass.
    for (const country of SUPPORTED_COUNTRIES) {
      const icu = new Intl.DisplayNames(["en", "en"], {
        type: "region",
        fallback: "none",
      }).of(country.code);
      expect(countryDisplayName(country.code, "en")).toBe(icu ?? country.name);
    }
  });
});

describe("region-lock preview scenarios", () => {
  /**
   * One scenario per state the panel says something about, and nothing else.
   * The three are mutually exclusive viewers, which is what earns the split; an
   * unlocked product is not a fourth, because the page it produces is the one
   * every other product scenario already shows.
   */
  it("covers each state the panel speaks to exactly once, and nothing else", () => {
    const slugs = REGION_LOCK_SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const kinds = REGION_LOCK_SCENARIOS.map(
      (s) => deriveRegionGate(s.regionLockCountry, s.viewerCountry).kind,
    );
    expect(kinds.sort()).toEqual(["eligible", "no_location", "wrong_country"]);
  });

  /**
   * The confirmation variant names the place, so the one scenario that renders
   * it has to have a place to name — and the two that do not render it must not
   * carry a stray name that nothing shows.
   */
  it("gives the eligible scenario a location to name, and only it", () => {
    for (const scenario of REGION_LOCK_SCENARIOS) {
      const isEligible =
        deriveRegionGate(scenario.regionLockCountry, scenario.viewerCountry)
          .kind === "eligible";
      expect(
        scenario.viewerLocationName !== null,
        scenario.slug,
      ).toBe(isEligible);
    }
  });
});
