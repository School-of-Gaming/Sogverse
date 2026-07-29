import { describe, it, expect } from "vitest";
import {
  codeRefsOf,
  matchResolvedRows,
  pendingTicksByCountry,
  sameTickKeys,
  sortedTicks,
  splitCoverageRows,
  toggleCoverageTick,
  type CoverageTick,
} from "@/components/gedu/coverage-ticks";
import { catalogRefKey, type CatalogPick } from "@/lib/locations/catalog";
import type { Location } from "@/types";

/**
 * Coverage is positive selection: one tick is one claim and one row, and no
 * tick ever implies another. These lock the three things that could silently
 * corrupt a gedu's coverage — a tick that cascades, a saved row the catalog
 * cannot show being dropped instead of surfaced, and a code with no row being
 * written off rather than refused.
 */

function loc(over: Partial<Location> & Pick<Location, "id">): Location {
  return {
    name: over.id,
    name_i18n: null,
    type: "municipality",
    parent_id: null,
    country_code: "FI",
    external_code: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function pick(over: Partial<CatalogPick> = {}): CatalogPick {
  return {
    country: "FR",
    type: "district",
    code: "59",
    name: "Nord",
    ancestors: ["Hauts-de-France"],
    ...over,
  };
}

describe("splitCoverageRows", () => {
  const rows: Location[] = [
    loc({
      id: "helsinki",
      name: "Helsinki",
      name_i18n: { sv: "Helsingfors" },
      country_code: "FI",
      external_code: "091",
    }),
    loc({
      id: "nord",
      name: "Nord",
      type: "district",
      country_code: "FR",
      external_code: "59",
    }),
    loc({ id: "sampola", name: "Sampola", type: "site" }),
    loc({
      id: "suomi",
      name: "Suomi",
      type: "country",
      country_code: "FI",
      external_code: "FI",
    }),
    loc({
      id: "leeds",
      name: "Leeds",
      country_code: "GB",
      external_code: "E08000035",
    }),
  ];

  it("turns a coded row into a tick keyed the way the catalog is", () => {
    const { ticks } = splitCoverageRows(rows, "fi");

    expect([...ticks.keys()]).toEqual([
      "FI:municipality:091",
      "FR:district:59",
    ]);
    expect(ticks.get("FI:municipality:091")).toEqual({
      ref: { country: "FI", type: "municipality", code: "091" },
      label: "Helsinki",
      detail: "",
      locationId: "helsinki",
    });
  });

  it("labels a tick in the viewer's locale", () => {
    const { ticks } = splitCoverageRows(rows, "sv");
    expect(ticks.get("FI:municipality:091")?.label).toBe("Helsingfors");
  });

  it("surfaces a site as a venue chip rather than dropping it", () => {
    const { legacy } = splitCoverageRows(rows, "fi");
    expect(legacy).toContainEqual({
      id: "sampola",
      label: "Sampola",
      kind: "venue",
    });
  });

  it("keeps a country row and a catalog-less country as chips", () => {
    // Neither has a catalog node to render a tick on: a country row is above
    // the catalog's top level, and GB ships no catalog at all.
    const { legacy, ticks } = splitCoverageRows(rows, "fi");
    const ids = legacy.map((row) => row.id);

    expect(ids).toContain("suomi");
    expect(ids).toContain("leeds");
    expect(ticks.has("FI:country:FI")).toBe(false);
  });
});

describe("toggleCoverageTick", () => {
  it("ticks exactly the node clicked, and nothing under or over it", () => {
    const region = pick({ type: "region", code: "32", name: "Hauts-de-France", ancestors: [] });
    const after = toggleCoverageTick(new Map(), region);

    expect([...after.keys()]).toEqual(["FR:region:32"]);
    // The département inside it is untouched — one claim is one row.
    expect(after.has("FR:district:59")).toBe(false);
  });

  it("unticks only the node clicked", () => {
    const region = pick({ type: "region", code: "32", name: "Hauts-de-France", ancestors: [] });
    const district = pick();

    let ticks = toggleCoverageTick(new Map(), region);
    ticks = toggleCoverageTick(ticks, district);
    ticks = toggleCoverageTick(ticks, region);

    expect([...ticks.keys()]).toEqual(["FR:district:59"]);
  });

  it("carries the catalog name and path so a chip renders before anything resolves", () => {
    const ticks = toggleCoverageTick(new Map(), pick());
    expect(ticks.get("FR:district:59")).toEqual({
      ref: { country: "FR", type: "district", code: "59" },
      label: "Nord",
      detail: "Hauts-de-France",
      locationId: null,
    });
  });

  it("does not mutate the input map", () => {
    const start = new Map<string, CoverageTick>();
    toggleCoverageTick(start, pick());
    expect(start.size).toBe(0);
  });
});

describe("pendingTicksByCountry", () => {
  it("groups only the ticks with no row id, by country", () => {
    let ticks = splitCoverageRows(
      [loc({ id: "helsinki", country_code: "FI", external_code: "091" })],
      "fi",
    ).ticks;
    ticks = toggleCoverageTick(ticks, pick());
    ticks = toggleCoverageTick(
      ticks,
      pick({ country: "FI", type: "region", code: "01", name: "Uusimaa" }),
    );

    const pending = pendingTicksByCountry(ticks);

    expect([...pending.keys()].sort()).toEqual(["FI", "FR"]);
    // The saved Helsinki tick already has its id and needs no resolution.
    expect(pending.get("FI")?.map((t) => t.ref.code)).toEqual(["01"]);
    expect(codeRefsOf(pending.get("FR") ?? [])).toEqual([
      { type: "district", external_code: "59" },
    ]);
  });
});

describe("matchResolvedRows", () => {
  const pending = [
    toggleCoverageTick(new Map(), pick()).get("FR:district:59")!,
    toggleCoverageTick(
      new Map(),
      pick({ type: "municipality", code: "59350", name: "Lille" }),
    ).get("FR:municipality:59350")!,
  ];

  it("pairs a row back to its tick on the full key", () => {
    const rows = [
      loc({ id: "nord-row", type: "district", country_code: "FR", external_code: "59" }),
      loc({
        id: "lille-row",
        type: "municipality",
        country_code: "FR",
        external_code: "59350",
      }),
    ];

    expect(matchResolvedRows(pending, rows)).toEqual({
      ids: ["nord-row", "lille-row"],
      unresolved: [],
    });
  });

  it("reports a code with no row instead of dropping the tick", () => {
    // The realistic case: French communes are seeded at release, so a commune
    // ticked before then resolves to nothing. Saving must refuse, not write a
    // coverage set quietly missing it.
    const rows = [
      loc({ id: "nord-row", type: "district", country_code: "FR", external_code: "59" }),
    ];

    const result = matchResolvedRows(pending, rows);

    expect(result.ids).toEqual(["nord-row"]);
    expect(result.unresolved.map((t) => t.label)).toEqual(["Lille"]);
  });

  it("does not let a same-coded row of another level satisfy a tick", () => {
    // "59" is a département code here; a région row carrying it is a different
    // place, and France really does reuse every région code that way.
    const rows = [
      loc({ id: "region-row", type: "region", country_code: "FR", external_code: "59" }),
    ];

    expect(matchResolvedRows([pending[0]], rows).unresolved).toHaveLength(1);
  });
});

describe("sortedTicks / sameTickKeys", () => {
  it("orders by the label the user reads", () => {
    let ticks = toggleCoverageTick(new Map(), pick({ code: "62", name: "Pas-de-Calais" }));
    ticks = toggleCoverageTick(ticks, pick());
    expect(sortedTicks(ticks, "fr").map((t) => t.label)).toEqual([
      "Nord",
      "Pas-de-Calais",
    ]);
  });

  it("compares by key, so a re-tick of the same place is not a change", () => {
    const saved = splitCoverageRows(
      [loc({ id: "helsinki", country_code: "FI", external_code: "091" })],
      "fi",
    ).ticks;

    const key = catalogRefKey({ country: "FI", type: "municipality", code: "091" });
    const retouched = toggleCoverageTick(
      toggleCoverageTick(saved, pick({ country: "FI", type: "municipality", code: "091", name: "Helsinki" })),
      pick({ country: "FI", type: "municipality", code: "091", name: "Helsinki" }),
    );

    expect(retouched.has(key)).toBe(true);
    expect(sameTickKeys(saved, retouched)).toBe(true);
    expect(sameTickKeys(saved, new Map())).toBe(false);
  });
});
