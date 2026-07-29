import { describe, it, expect } from "vitest";
import {
  buildMunicipalityEntries,
  findMunicipalityBySlug,
  groupByRegion,
} from "@/lib/schools/municipalities";
import type { LocationWithChain } from "@/services/locations";
import type { EmbeddedLocation } from "@/lib/locations/embedded-chain";
import type { Json, Location } from "@/types";

// The inputs are the two scoped reads the /schools pages make: Finland's
// municipality rows with their ancestor chain, and the location each visible
// club points at with one level of parent. Neither carries a country filter or
// a lookup table any more — the query scopes the first, and the second is
// resolved off the row itself.
//
// Uusimaa -> {Helsinki -> School A, Espoo}; Pirkanmaa -> Tampere.
// Helsinki + Uusimaa carry a Swedish name; Tampere/Espoo don't (they fall back).
const UUSIMAA = chainNode("uusimaa", "Uusimaa", "region", { sv: "Nyland" });
const PIRKANMAA = chainNode("pirkanmaa", "Pirkanmaa", "region");
const FINLAND = chainNode("finland", "Finland", "country");

const MUNICIPALITIES: LocationWithChain[] = [
  municipality("helsinki", "Helsinki", UUSIMAA, { sv: "Helsingfors" }),
  municipality("espoo", "Espoo", UUSIMAA),
  municipality("tampere", "Tampere", PIRKANMAA),
];

/** An online club: its location IS the municipality. */
const ESPOO_CLUB: EmbeddedLocation = {
  id: "espoo",
  name: "Espoo",
  name_i18n: null,
  type: "municipality",
  parent: null,
};

/** An in-person club: its location is a site under the municipality. */
const HELSINKI_SITE_CLUB: EmbeddedLocation = {
  id: "schoolA",
  name: "School A",
  name_i18n: null,
  type: "site",
  parent: {
    id: "helsinki",
    name: "Helsinki",
    name_i18n: null,
    type: "municipality",
  },
};

/** Legacy data the DB trigger still permits: a club anchored to a region. */
const REGION_CLUB: EmbeddedLocation = {
  id: "pirkanmaa",
  name: "Pirkanmaa",
  name_i18n: null,
  type: "region",
  parent: null,
};

describe("buildMunicipalityEntries", () => {
  it("lists only FI municipalities, sorted, with slugs and region", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");

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
  });

  it("renders Swedish names for the sv locale, falling back to `name`", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "sv");
    const helsinki = entries.find((e) => e.id === "helsinki");
    expect(helsinki?.name).toBe("Helsingfors");
    expect(helsinki?.regionName).toBe("Nyland");
    // Espoo has no Swedish override → falls back to its `name`.
    expect(entries.find((e) => e.id === "espoo")?.name).toBe("Espoo");
  });

  it("builds the URL slug from the viewer-locale display name", () => {
    const fi = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    const sv = buildMunicipalityEntries(MUNICIPALITIES, [], "sv");
    expect(fi.find((e) => e.id === "helsinki")?.slug).toBe("helsinki");
    expect(sv.find((e) => e.id === "helsinki")?.slug).toBe("helsingfors");
    // No Swedish override → same slug in both locales.
    expect(fi.find((e) => e.id === "espoo")?.slug).toBe("espoo");
    expect(sv.find((e) => e.id === "espoo")?.slug).toBe("espoo");
  });

  it("indexes both the canonical and alternate names for search", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    const helsinki = entries.find((e) => e.id === "helsinki");
    expect(helsinki?.searchSlugs).toEqual(
      expect.arrayContaining(["helsinki", "helsingfors"]),
    );
  });

  it("flags a municipality with an online club (location_id = municipality)", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [ESPOO_CLUB], "fi");
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(false);
  });

  it("flags a municipality with an in-person club (location_id = site under it)", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [HELSINKI_SITE_CLUB], "fi");
    expect(entries.find((e) => e.id === "helsinki")?.hasClubs).toBe(true);
  });

  it("does NOT cascade region/country-scoped locations to municipalities", () => {
    // A club anchored to a region (legacy data) lights up nothing — availability
    // is municipality-exact.
    const entries = buildMunicipalityEntries(
      MUNICIPALITIES,
      [REGION_CLUB],
      "fi",
    );
    expect(entries.every((e) => e.hasClubs === false)).toBe(true);
  });

  it("ignores null location ids", () => {
    const entries = buildMunicipalityEntries(
      MUNICIPALITIES,
      [null, ESPOO_CLUB, null],
      "fi",
    );
    expect(entries.find((e) => e.id === "espoo")?.hasClubs).toBe(true);
  });
});

describe("findMunicipalityBySlug", () => {
  it("resolves the canonical viewer-locale slug", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    expect(findMunicipalityBySlug("helsinki", entries)?.id).toBe("helsinki");
    expect(findMunicipalityBySlug("espoo", entries)?.id).toBe("espoo");
  });

  it("resolves an alternate-locale slug to the same row", () => {
    // Built for `fi` (slug = "helsinki"), but a Swedish speaker's
    // "/schools/helsingfors" link must still land here via the search slugs.
    const fi = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    expect(findMunicipalityBySlug("helsingfors", fi)?.id).toBe("helsinki");
    // And the reverse: built for `sv` (slug = "helsingfors"), the Finnish
    // "/schools/helsinki" link resolves too.
    const sv = buildMunicipalityEntries(MUNICIPALITIES, [], "sv");
    expect(findMunicipalityBySlug("helsinki", sv)?.id).toBe("helsinki");
  });

  it("returns undefined for an unknown slug", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    expect(findMunicipalityBySlug("stockholm", entries)).toBeUndefined();
    expect(findMunicipalityBySlug("nope", entries)).toBeUndefined();
  });
});

describe("groupByRegion", () => {
  it("groups municipalities under their region, both sorted", () => {
    const entries = buildMunicipalityEntries(MUNICIPALITIES, [], "fi");
    const groups = groupByRegion(entries);

    expect(groups.map((g) => g.regionName)).toEqual(["Pirkanmaa", "Uusimaa"]);
    const uusimaa = groups.find((g) => g.regionId === "uusimaa");
    expect(uusimaa?.municipalities.map((m) => m.name)).toEqual([
      "Espoo",
      "Helsinki",
    ]);
  });

  it("groups only the entries passed in (e.g. the active subset)", () => {
    const active = buildMunicipalityEntries(MUNICIPALITIES, [ESPOO_CLUB], "fi").filter(
      (e) => e.hasClubs,
    );
    const groups = groupByRegion(active);
    expect(groups).toHaveLength(1);
    expect(groups[0].regionName).toBe("Uusimaa");
    expect(groups[0].municipalities.map((m) => m.name)).toEqual(["Espoo"]);
  });
});

function chainNode(
  id: string,
  name: string,
  type: Location["type"],
  name_i18n: Json | null = null,
) {
  return {
    id,
    name,
    name_i18n,
    type,
    parent_id: null,
    country_code: "FI",
    external_code: null,
  };
}

/** A municipality row as the scoped read returns it: chain nearest first. */
function municipality(
  id: string,
  name: string,
  region: ReturnType<typeof chainNode>,
  name_i18n: Json | null = null,
): LocationWithChain {
  return {
    id,
    name,
    name_i18n,
    type: "municipality",
    parent_id: region.id,
    country_code: "FI",
    external_code: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ancestors: [region, FINLAND],
  };
}
