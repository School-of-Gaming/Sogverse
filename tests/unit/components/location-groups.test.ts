import { describe, it, expect } from "vitest";
import {
  filterLocationGroups,
  groupLocationsByParent,
  indexLocationGroups,
} from "@/components/locations/location-groups";
import type {
  LocationChainSummary,
  LocationSummary,
} from "@/components/locations/location-picker-panel";

/**
 * The picker panel's **set** scope: how a bounded list a surface fetched in full
 * becomes headers and rows, and what a typed query leaves standing. Pure
 * functions, so nothing is mounted here.
 */

const FI: LocationChainSummary = {
  id: "fi",
  name: "Suomi",
  name_i18n: null,
  type: "country",
};
const UUSIMAA: LocationChainSummary = {
  id: "uusimaa",
  name: "Uusimaa",
  name_i18n: { sv: "Nyland" },
  type: "region",
};
const PIRKANMAA: LocationChainSummary = {
  id: "pirkanmaa",
  name: "Pirkanmaa",
  name_i18n: null,
  type: "region",
};
const HELSINKI: LocationChainSummary = {
  id: "helsinki",
  name: "Helsinki",
  name_i18n: { sv: "Helsingfors" },
  type: "municipality",
};
const JARVENPAA: LocationChainSummary = {
  id: "jarvenpaa",
  name: "Järvenpää",
  name_i18n: null,
  type: "municipality",
};
const TAMPERE: LocationChainSummary = {
  id: "tampere",
  name: "Tampere",
  name_i18n: null,
  type: "municipality",
};

function venue(
  id: string,
  name: string,
  chain: LocationChainSummary[],
): LocationSummary & { ancestors: LocationChainSummary[] } {
  return {
    id,
    name,
    name_i18n: null,
    type: "site",
    country_code: "FI",
    ancestors: chain,
  };
}

const VENUES = [
  venue("tre-1", "Sampola", [TAMPERE, PIRKANMAA, FI]),
  venue("hki-2", "Kalasataman kirjasto", [HELSINKI, UUSIMAA, FI]),
  venue("hki-1", "Itälahdenkatu 23 B", [HELSINKI, UUSIMAA, FI]),
  venue("jp-1", "Kirjasto", [JARVENPAA, UUSIMAA, FI]),
];

describe("groupLocationsByParent", () => {
  it("files rows under the place immediately above them", () => {
    const groups = groupLocationsByParent(VENUES, "en", "");

    expect(groups.map((group) => group.label)).toEqual([
      "Helsinki",
      "Järvenpää",
      "Tampere",
    ]);
    expect(groups[0].rows.map((pick) => pick.location.name)).toEqual([
      "Itälahdenkatu 23 B",
      "Kalasataman kirjasto",
    ]);
  });

  // The levels above the header, so an admin sees the region without opening
  // anything — and the country is never one of them, because a grouped list
  // sits inside one country's worth of context already.
  it("puts the rest of the chain in the header's detail, without the country", () => {
    const groups = groupLocationsByParent(VENUES, "en", "");

    expect(groups.map((group) => group.detail)).toEqual([
      "Uusimaa",
      "Uusimaa",
      "Pirkanmaa",
    ]);
  });

  it("sorts headers and rows in the viewer's collation", () => {
    // Swedish-locale names sort differently and are what a Swedish viewer sees:
    // Helsinki renders as Helsingfors, which still sorts first here, but the
    // label being the *localized* name is the thing under test.
    const groups = groupLocationsByParent(VENUES, "sv", "");

    expect(groups[0].label).toBe("Helsingfors");
    expect(groups[0].detail).toBe("Nyland");
  });

  it("hands back the whole pick, not just an id", () => {
    const [helsinki] = groupLocationsByParent(VENUES, "en", "");
    const [first] = helsinki.rows;

    expect(first.location.id).toBe("hki-1");
    // Nearest first, chain intact — a foreign key and a path, with nothing left
    // to look up once the row is clicked.
    expect(first.ancestors.map((node) => node.id)).toEqual([
      "helsinki",
      "uusimaa",
      "fi",
    ]);
  });

  describe("a row with nothing above it", () => {
    const ORPHAN = [venue("orphan", "Nowhere Hall", [])];

    it("gets the caller's fallback label", () => {
      expect(groupLocationsByParent(ORPHAN, "en", "Elsewhere")[0].label).toBe(
        "Elsewhere",
      );
    });

    // Venues want no heading rather than one claiming more than it knows, so
    // the fallback is the caller's word and an empty one is legitimate.
    it("gets an empty header when that is what the caller asked for", () => {
      const [group] = groupLocationsByParent(ORPHAN, "en", "");

      expect(group.label).toBe("");
      expect(group.searchTerms).toEqual([]);
    });
  });

  it("keeps rows whose only ancestor is the country in one bucket", () => {
    const groups = groupLocationsByParent(
      [venue("nat-1", "National Arena", [FI])],
      "en",
      "Elsewhere",
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Elsewhere");
  });
});

describe("filterLocationGroups", () => {
  const index = indexLocationGroups(groupLocationsByParent(VENUES, "en", ""));
  const filter = (query: string) =>
    filterLocationGroups(index, query).map((group) => ({
      label: group.label,
      rows: group.rows.map((pick) => pick.location.name),
    }));

  it("returns every group for an empty query", () => {
    expect(filter("")).toHaveLength(3);
    expect(filter("   ")).toHaveLength(3);
  });

  // A header match keeps the whole group: someone typing a city wants its
  // venues, not the one venue spelled like it.
  it("keeps every row under a matching header", () => {
    expect(filter("helsinki")).toEqual([
      {
        label: "Helsinki",
        rows: ["Itälahdenkatu 23 B", "Kalasataman kirjasto"],
      },
    ]);
  });

  it("keeps only the matching rows under a header that does not match", () => {
    expect(filter("sampola")).toEqual([{ label: "Tampere", rows: ["Sampola"] }]);
  });

  it("drops a group with no match at all", () => {
    expect(filter("nothing here")).toEqual([]);
  });

  describe("folding", () => {
    it("finds an accented name from an unaccented needle", () => {
      expect(filter("jarvenpaa").map((group) => group.label)).toEqual([
        "Järvenpää",
      ]);
    });

    // The direction that breaks when only one side is folded.
    it("finds it from the accented needle too", () => {
      expect(filter("Järvenpää").map((group) => group.label)).toEqual([
        "Järvenpää",
      ]);
    });

    it("ignores case", () => {
      expect(filter("SAMPOLA")).toEqual([
        { label: "Tampere", rows: ["Sampola"] },
      ]);
    });

    // The alternate names are indexed alongside the canonical one, so a Swedish
    // speaker finds the row however their own UI is rendered.
    it("matches a header's alternate-locale name", () => {
      expect(filter("helsingfors").map((group) => group.label)).toEqual([
        "Helsinki",
      ]);
    });

    it("matches an infix, not only a prefix", () => {
      expect(filter("lahdenkatu")).toEqual([
        { label: "Helsinki", rows: ["Itälahdenkatu 23 B"] },
      ]);
    });
  });
});
