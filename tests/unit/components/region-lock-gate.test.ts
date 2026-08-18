import { describe, expect, it } from "vitest";
import {
  countryDisplayName,
  deriveRegionGate,
} from "@/components/public/products/region-lock/region-gate";
import { REGION_LOCK_SCENARIOS } from "@/components/public/products/region-lock/region-lock-scenarios";

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

  it("passes a family in the locked country", () => {
    expect(deriveRegionGate("FI", "FI")).toEqual({ kind: "unlocked" });
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

describe("countryDisplayName", () => {
  it("names a country in the reader's own language", () => {
    expect(countryDisplayName("FI", "en")).toBe("Finland");
    expect(countryDisplayName("FI", "fi")).toBe("Suomi");
  });

  it("falls back rather than throwing on a malformed code", () => {
    // `Intl.DisplayNames.of` throws a RangeError on anything that is not a
    // well-formed region subtag, so the shape is checked before the call.
    expect(countryDisplayName("nonsense", "en")).toBe("nonsense");
  });
});

describe("region-lock preview scenarios", () => {
  /**
   * One scenario per blocked state and nothing else. The two are mutually
   * exclusive viewers, which is what earns the split; a permitted family is not
   * a third scenario, because the page it sees is the one every other product
   * scenario already shows.
   */
  it("covers each blocked state exactly once, and nothing else", () => {
    const slugs = REGION_LOCK_SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const kinds = REGION_LOCK_SCENARIOS.map(
      (s) => deriveRegionGate(s.regionLockCountry, s.viewerCountry).kind,
    );
    expect(kinds.sort()).toEqual(["no_location", "wrong_country"]);
  });
});
