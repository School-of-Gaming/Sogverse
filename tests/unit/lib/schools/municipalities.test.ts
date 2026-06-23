import { describe, it, expect } from "vitest";
import {
  buildMunicipalityEntries,
  groupByRegion,
} from "@/lib/schools/municipalities";
import type { Json, Location } from "@/types";

// Finland → Uusimaa → {Helsinki → SchoolA, Espoo}
//         → Pirkanmaa → Tampere
// Sweden  → Stockholms län → Stockholm   (non-FI, must be excluded)
// Helsinki + Uusimaa carry a Swedish name; Tampere/Espoo don't (they fall back).
const LOCATIONS: Location[] = [
  loc("finland", "Finland", "country", null, "FI"),
  loc("uusimaa", "Uusimaa", "region", "finland", "FI", { sv: "Nyland" }),
  loc("helsinki", "Helsinki", "municipality", "uusimaa", "FI", {
    sv: "Helsingfors",
  }),
  loc("schoolA", "School A", "site", "helsinki", "FI"),
  loc("espoo", "Espoo", "municipality", "uusimaa", "FI"),
  loc("pirkanmaa", "Pirkanmaa", "region", "finland", "FI"),
  loc("tampere", "Tampere", "municipality", "pirkanmaa", "FI"),
  loc("sweden", "Sweden", "country", null, "SE"),
  loc("sthlmlan", "Stockholms län", "region", "sweden", "SE"),
  loc("stockholm", "Stockholm", "municipality", "sthlmlan", "SE"),
];

describe("buildMunicipalityEntries", () => {
  it("lists only FI municipalities, sorted, with slugs and region", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, [], "fi");

    expect(entries.map((e) => e.name)).toEqual(["Espoo", "Helsinki", "Tampere"]);
    expect(entries.find((e) => e.id === "helsinki")).toMatchObject({
      slug: "helsinki",
      regionId: "uusimaa",
      regionName: "Uusimaa",
      hasClubs: false,
    });
    expect(entries.find((e) => e.id === "tampere")?.regionName).toBe(
      "Pirkanmaa",
    );
    // Sweden's municipality is excluded.
    expect(entries.some((e) => e.id === "stockholm")).toBe(false);
  });

  it("renders Swedish names for the sv locale, falling back to `name`", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, [], "sv");
    const helsinki = entries.find((e) => e.id === "helsinki");
    expect(helsinki?.name).toBe("Helsingfors");
    expect(helsinki?.regionName).toBe("Nyland");
    // Espoo has no Swedish override → falls back to its `name`.
    expect(entries.find((e) => e.id === "espoo")?.name).toBe("Espoo");
  });

  it("builds the URL slug from the viewer-locale display name", () => {
    const fi = buildMunicipalityEntries(LOCATIONS, [], "fi");
    const sv = buildMunicipalityEntries(LOCATIONS, [], "sv");
    expect(fi.find((e) => e.id === "helsinki")?.slug).toBe("helsinki");
    expect(sv.find((e) => e.id === "helsinki")?.slug).toBe("helsingfors");
    // No Swedish override → same slug in both locales.
    expect(fi.find((e) => e.id === "espoo")?.slug).toBe("espoo");
    expect(sv.find((e) => e.id === "espoo")?.slug).toBe("espoo");
  });

  it("indexes both the canonical and alternate names for search", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, [], "fi");
    const helsinki = entries.find((e) => e.id === "helsinki");
    expect(helsinki?.searchSlugs).toEqual(
      expect.arrayContaining(["helsinki", "helsingfors"]),
    );
  });

  it("flags a municipality with an online club (location_id = municipality)", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, ["espoo"], "fi");
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(false);
  });

  it("flags a municipality with an in-person club (location_id = site under it)", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, ["schoolA"], "fi");
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(true);
  });

  it("does NOT cascade region/country-scoped locations to municipalities", () => {
    // A club anchored to a region (legacy data) lights up nothing — availability
    // is municipality-exact.
    const entries = buildMunicipalityEntries(
      LOCATIONS,
      ["pirkanmaa", "finland"],
      "fi",
    );
    expect(entries.every((e) => e.hasClubs === false)).toBe(true);
  });

  it("ignores null location ids", () => {
    const entries = buildMunicipalityEntries(
      LOCATIONS,
      [null, "espoo", null],
      "fi",
    );
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
  });
});

describe("groupByRegion", () => {
  it("groups municipalities under their region, both sorted", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, [], "fi");
    const groups = groupByRegion(entries);

    expect(groups.map((g) => g.regionName)).toEqual(["Pirkanmaa", "Uusimaa"]);
    const uusimaa = groups.find((g) => g.regionId === "uusimaa");
    expect(uusimaa?.municipalities.map((m) => m.name)).toEqual([
      "Espoo",
      "Helsinki",
    ]);
  });

  it("groups only the entries passed in (e.g. the active subset)", () => {
    const active = buildMunicipalityEntries(LOCATIONS, ["espoo"], "fi").filter(
      (e) => e.hasClubs,
    );
    const groups = groupByRegion(active);
    expect(groups).toHaveLength(1);
    expect(groups[0].regionName).toBe("Uusimaa");
    expect(groups[0].municipalities.map((m) => m.name)).toEqual(["Espoo"]);
  });
});

function loc(
  id: string,
  name: string,
  type: Location["type"],
  parent_id: string | null,
  country_code: string,
  name_i18n: Json | null = null,
): Location {
  return {
    id,
    name,
    name_i18n,
    type,
    parent_id,
    country_code,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}
