import { describe, it, expect } from "vitest";
import {
  buildMunicipalityEntries,
  groupByRegion,
} from "@/lib/schools/municipalities";
import type { Location } from "@/types";

// Finland → Uusimaa → {Helsinki → SchoolA, Espoo}
//         → Pirkanmaa → Tampere
// Sweden  → Stockholms län → Stockholm   (non-FI, must be excluded)
const LOCATIONS: Location[] = [
  loc("finland", "Finland", "country", null, "FI"),
  loc("uusimaa", "Uusimaa", "region", "finland", "FI"),
  loc("helsinki", "Helsinki", "municipality", "uusimaa", "FI"),
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
    const entries = buildMunicipalityEntries(LOCATIONS, []);

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

  it("flags a municipality with an online club (location_id = municipality)", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, ["espoo"]);
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(false);
  });

  it("flags a municipality with an in-person club (location_id = site under it)", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, ["schoolA"]);
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(true);
  });

  it("does NOT cascade region/country-scoped locations to municipalities", () => {
    // A club anchored to a region (legacy data) lights up nothing — availability
    // is municipality-exact.
    const entries = buildMunicipalityEntries(LOCATIONS, ["pirkanmaa", "finland"]);
    expect(entries.every((e) => e.hasClubs === false)).toBe(true);
  });

  it("ignores null location ids", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, [null, "espoo", null]);
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
  });
});

describe("groupByRegion", () => {
  it("groups municipalities under their region, both sorted", () => {
    const entries = buildMunicipalityEntries(LOCATIONS, []);
    const groups = groupByRegion(entries);

    expect(groups.map((g) => g.regionName)).toEqual(["Pirkanmaa", "Uusimaa"]);
    const uusimaa = groups.find((g) => g.regionId === "uusimaa");
    expect(uusimaa?.municipalities.map((m) => m.name)).toEqual([
      "Espoo",
      "Helsinki",
    ]);
  });

  it("groups only the entries passed in (e.g. the active subset)", () => {
    const active = buildMunicipalityEntries(LOCATIONS, ["espoo"]).filter(
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
): Location {
  return {
    id,
    name,
    type,
    parent_id,
    country_code,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}
