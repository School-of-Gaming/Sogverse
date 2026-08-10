import { describe, expect, it } from "vitest";
import {
  monthKey,
  withMonthDividers,
} from "@/components/session-feed/feed-rows";

/**
 * Month dividers exist to make a year-long feed scannable, so what matters is
 * exactly where the boundaries land — and that they land in the *viewer's* zone,
 * because a session just after local midnight on the 1st belongs to the new
 * month for the person reading it whatever month it was in UTC.
 */

function entry(id: string, iso: string) {
  return { id, startsAt: new Date(iso) };
}

describe("withMonthDividers", () => {
  it("emits no divider above the first entry", () => {
    const rows = withMonthDividers([entry("a", "2026-03-02T14:30:00Z")], "UTC");
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("entry");
  });

  it("emits nothing for an empty run", () => {
    expect(withMonthDividers([], "UTC")).toEqual([]);
  });

  it("emits one divider per boundary the descending scroll crosses", () => {
    const rows = withMonthDividers(
      [
        entry("apr2", "2026-04-06T14:30:00Z"),
        entry("apr1", "2026-04-01T14:30:00Z"),
        entry("mar2", "2026-03-30T14:30:00Z"),
        entry("mar1", "2026-03-23T14:30:00Z"),
        entry("feb1", "2026-02-23T14:30:00Z"),
      ],
      "UTC",
    );
    // A divider is keyed by the entry that introduces it, so `#month-mar2`
    // reads as "the boundary landing above mar2".
    expect(rows.map((r) => (r.kind === "month" ? `#${r.key}` : r.key))).toEqual([
      "apr2",
      "apr1",
      "#month-mar2",
      "mar2",
      "mar1",
      "#month-feb1",
      "feb1",
    ]);
  });

  /**
   * This function renders the order it is given and deliberately does not sort,
   * so a caller's ordering bug can produce a run that leaves a month and comes
   * back to it. Keying a divider by its month would then emit the same React key
   * twice inside one list — which does not throw, it quietly reuses a node for
   * the wrong row.
   */
  it("keeps every key unique even when the run revisits a month", () => {
    const rows = withMonthDividers(
      [
        entry("mar-a", "2026-03-30T14:30:00Z"),
        entry("feb-a", "2026-02-23T14:30:00Z"),
        entry("mar-b", "2026-03-02T14:30:00Z"),
        entry("feb-b", "2026-02-02T14:30:00Z"),
      ],
      "UTC",
    );
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.filter((r) => r.kind === "month")).toHaveLength(3);
  });

  it("labels the divider with the month being scrolled into", () => {
    const rows = withMonthDividers(
      [entry("apr", "2026-04-01T09:00:00Z"), entry("mar", "2026-03-30T09:00:00Z")],
      "UTC",
    );
    const divider = rows.find((r) => r.kind === "month");
    expect(divider).toBeDefined();
    // The instant handed to the label is the first entry *of* that month, so the
    // component's Intl call renders "March 2026", not "April 2026".
    if (divider?.kind === "month") {
      expect(divider.startsAt.toISOString()).toBe("2026-03-30T09:00:00.000Z");
    }
  });

  it("emits no divider inside one month, however many entries", () => {
    const rows = withMonthDividers(
      [
        entry("a", "2026-03-30T14:30:00Z"),
        entry("b", "2026-03-23T14:30:00Z"),
        entry("c", "2026-03-16T14:30:00Z"),
        entry("d", "2026-03-09T14:30:00Z"),
      ],
      "UTC",
    );
    expect(rows.every((r) => r.kind === "entry")).toBe(true);
  });

  it("crosses a year boundary as an ordinary month boundary", () => {
    const rows = withMonthDividers(
      [entry("jan", "2027-01-04T14:30:00Z"), entry("dec", "2026-12-28T14:30:00Z")],
      "UTC",
    );
    const keys = rows.filter((r) => r.kind === "month").map((r) => r.key);
    expect(keys).toEqual(["month-dec"]);
  });

  it("puts the boundary where the *viewer* sees it, not where UTC does", () => {
    // 31 March 22:30 UTC is already 1 April in Helsinki (UTC+3). A viewer in
    // Helsinki must see these two entries as different months; a UTC viewer must
    // see them as the same one.
    const entries = [
      entry("later", "2026-03-31T22:30:00Z"),
      entry("earlier", "2026-03-30T14:30:00Z"),
    ];
    expect(
      withMonthDividers(entries, "Europe/Helsinki").filter(
        (r) => r.kind === "month",
      ),
    ).toHaveLength(1);
    expect(
      withMonthDividers(entries, "UTC").filter((r) => r.kind === "month"),
    ).toHaveLength(0);
  });
});

describe("monthKey", () => {
  it("is the calendar month as the instant falls in the given zone", () => {
    const instant = new Date("2026-03-31T22:30:00Z");
    expect(monthKey(instant, "UTC")).toBe("2026-03");
    expect(monthKey(instant, "Europe/Helsinki")).toBe("2026-04");
  });
});
