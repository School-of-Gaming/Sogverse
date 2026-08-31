import { describe, it, expect } from "vitest";
import {
  sameTickKeys,
  sortedTicks,
  ticksFromRows,
  toggleCoverageTick,
  type CoverageTick,
} from "@/components/gedu/coverage-ticks";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import type { LocationWithChain } from "@/services/locations";

/**
 * The coverage editor's pure half.
 *
 * What matters is the *semantics of a tick*: one tick is one independent claim
 * and one row, nothing cascades in either direction, and an empty selection is
 * a valid answer rather than an unsaved one. Everything a tick needs is now a
 * row id, so the identity questions this file used to answer — which country's
 * code, at which level, and does a row exist for it — have no equivalent.
 */

function chainNode(id: string, name: string, type: LocationWithChain["type"]) {
  return {
    id,
    name,
    name_i18n: null,
    type,
    parent_id: null,
    country_code: "FI",
    external_code: null,
  };
}

function savedRow(
  id: string,
  name: string,
  type: LocationWithChain["type"],
  ancestors: LocationWithChain["ancestors"] = [],
): LocationWithChain {
  return {
    id,
    name,
    name_i18n: null,
    type,
    parent_id: ancestors[0]?.id ?? null,
    country_code: "FI",
    external_code: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ancestors,
  };
}

function pick(
  id: string,
  name: string,
  type: LocationPick["location"]["type"],
  ancestors: LocationPick["ancestors"] = [],
): LocationPick {
  return {
    location: { id, name, name_i18n: null, type, country_code: "FI" },
    ancestors,
  };
}

describe("ticksFromRows", () => {
  it("keys every saved row by its id, whatever kind of place it is", () => {
    // The catalog era split saved rows into "tickable" and "legacy" chips a
    // gedu could remove but never re-add — sites, country rows, anything from
    // a country with no shipped catalog. Browsing the table itself removed the
    // distinction: they are all rows, and all of them tick.
    const ticks = ticksFromRows(
      [
        savedRow("m1", "Helsinki", "municipality"),
        savedRow("s1", "Kirjasto", "site"),
        savedRow("c1", "Finland", "country"),
      ],
      "en",
    );

    expect([...ticks.keys()].sort()).toEqual(["c1", "m1", "s1"]);
  });

  it("renders each chip with the path above it, country dropped", () => {
    const ticks = ticksFromRows(
      [
        savedRow("m1", "Helsinki", "municipality", [
          chainNode("r1", "Uusimaa", "region"),
          chainNode("c1", "Finland", "country"),
        ]),
      ],
      "en",
    );

    // Root-first, and without the country: "Uusimaa", not "Finland · Uusimaa".
    expect(ticks.get("m1")?.detail).toBe("Uusimaa");
  });

  it("renders the name in the viewer's locale", () => {
    const row = savedRow("m1", "Helsinki", "municipality");
    const ticks = ticksFromRows(
      [{ ...row, name_i18n: { sv: "Helsingfors" } }],
      "sv",
    );

    expect(ticks.get("m1")?.label).toBe("Helsingfors");
  });
});

describe("toggleCoverageTick", () => {
  it("adds a row that was not ticked", () => {
    const next = toggleCoverageTick(
      new Map(),
      pick("m1", "Helsinki", "municipality"),
      "en",
    );

    expect(next.get("m1")?.label).toBe("Helsinki");
  });

  it("removes a row that was", () => {
    const first = toggleCoverageTick(
      new Map(),
      pick("m1", "Helsinki", "municipality"),
      "en",
    );
    const second = toggleCoverageTick(
      first,
      pick("m1", "Helsinki", "municipality"),
      "en",
    );

    expect(second.size).toBe(0);
  });

  it("never mutates the map it was given", () => {
    const before = new Map<string, CoverageTick>();
    toggleCoverageTick(before, pick("m1", "Helsinki", "municipality"), "en");

    expect(before.size).toBe(0);
  });

  // The claim semantics, in the one place they can be asserted without a DOM:
  // ticking a parent adds exactly one entry, and nothing about its descendants.
  it("ticking a region claims the region and nothing else", () => {
    const next = toggleCoverageTick(
      new Map(),
      pick("r1", "Uusimaa", "region"),
      "en",
    );

    expect([...next.keys()]).toEqual(["r1"]);
  });

  it("unticking a municipality leaves an ancestor's claim alone", () => {
    let ticks = toggleCoverageTick(
      new Map(),
      pick("r1", "Uusimaa", "region"),
      "en",
    );
    ticks = toggleCoverageTick(
      ticks,
      pick("m1", "Helsinki", "municipality"),
      "en",
    );
    ticks = toggleCoverageTick(
      ticks,
      pick("m1", "Helsinki", "municipality"),
      "en",
    );

    expect([...ticks.keys()]).toEqual(["r1"]);
  });

  it("carries the picked row's path onto the chip", () => {
    const next = toggleCoverageTick(
      new Map(),
      pick("m1", "Helsinki", "municipality", [
        { id: "r1", name: "Uusimaa", name_i18n: null, type: "region" },
        { id: "c1", name: "Finland", name_i18n: null, type: "country" },
      ]),
      "en",
    );

    expect(next.get("m1")?.detail).toBe("Uusimaa");
  });
});

describe("sortedTicks", () => {
  it("orders by the label the user reads, not by id", () => {
    let ticks = toggleCoverageTick(
      new Map(),
      pick("z", "Espoo", "municipality"),
      "en",
    );
    ticks = toggleCoverageTick(ticks, pick("a", "Vantaa", "municipality"), "en");
    ticks = toggleCoverageTick(
      ticks,
      pick("m", "Helsinki", "municipality"),
      "en",
    );

    expect(sortedTicks(ticks, "en").map((tick) => tick.label)).toEqual([
      "Espoo",
      "Helsinki",
      "Vantaa",
    ]);
  });
});

describe("sameTickKeys", () => {
  it("compares the places claimed, not the order they were claimed in", () => {
    let a = toggleCoverageTick(
      new Map(),
      pick("m1", "Helsinki", "municipality"),
      "en",
    );
    a = toggleCoverageTick(a, pick("m2", "Espoo", "municipality"), "en");

    let b = toggleCoverageTick(
      new Map(),
      pick("m2", "Espoo", "municipality"),
      "en",
    );
    b = toggleCoverageTick(b, pick("m1", "Helsinki", "municipality"), "en");

    expect(sameTickKeys(a, b)).toBe(true);
  });

  it("sees a dropped claim", () => {
    const a = toggleCoverageTick(
      new Map(),
      pick("m1", "Helsinki", "municipality"),
      "en",
    );

    expect(sameTickKeys(a, new Map())).toBe(false);
  });

  // Two empty selections are equal, which is what keeps the save button
  // disabled for a gedu who is deliberately remote-only.
  it("treats two empty selections as the same", () => {
    expect(sameTickKeys(new Map(), new Map())).toBe(true);
  });
});
