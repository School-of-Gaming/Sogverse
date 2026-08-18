import { describe, expect, it } from "vitest";
import {
  countryDisplayName,
  deriveRegionGate,
} from "@/components/public/products/region-lock/region-gate";
import { REGION_LOCK_SCENARIOS } from "@/components/public/products/region-lock/region-lock-scenarios";

/**
 * The region lock's one piece of real logic, and the one piece that outlives
 * the review: three candidate blocks are being compared on the preview scenes
 * and two of them will be deleted, but whichever wins reads its state from
 * here. Pinning it now means the surviving candidate inherits the decision
 * already tested rather than re-deriving it in a component.
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
  it("has unique slugs and covers every candidate in both blocked states", () => {
    const slugs = REGION_LOCK_SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const blocked = REGION_LOCK_SCENARIOS.filter(
      (s) =>
        deriveRegionGate(s.regionLockCountry, s.viewerCountry).kind !==
        "unlocked",
    );
    for (const variant of ["hybrid", "overlay-both", "checklist-both"]) {
      const kinds = blocked
        .filter((s) => s.variant === variant)
        .map((s) => deriveRegionGate(s.regionLockCountry, s.viewerCountry).kind);
      expect(new Set(kinds)).toEqual(new Set(["no_location", "wrong_country"]));
    }
  });

  it("carries exactly one unlocked reference page", () => {
    // One page, not one per candidate: none of them renders anything for a
    // permitted family, so three copies would invite a hunt for a difference
    // that cannot exist.
    const unlocked = REGION_LOCK_SCENARIOS.filter(
      (s) =>
        deriveRegionGate(s.regionLockCountry, s.viewerCountry).kind ===
        "unlocked",
    );
    expect(unlocked).toHaveLength(1);
  });
});
