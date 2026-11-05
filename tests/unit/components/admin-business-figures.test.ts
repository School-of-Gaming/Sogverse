import { describe, expect, it } from "vitest";
import {
  certifiedNotOnRunning,
  engagementShares,
  gamersPerGeduPoints,
  hasUnattributedRevenue,
  largestRevenueBand,
  lastCompletePoint,
  revenueChange,
  seriesStart,
  firstWeekRate,
  firstWeekRateChangePoints,
} from "@/components/admin/business/business-figures";
import type { RevenueMonth } from "@/services/admin-business/admin-business.build";

const MONTHS = ["2025-12-01", "2026-01-01", "2026-02-01"];

function revenueMonth(overrides: Partial<RevenueMonth>): RevenueMonth {
  return {
    month: "2026-01-01",
    subscriptionCents: 0,
    campsAndEventsCents: 0,
    unattributedCents: 0,
    municipalityCents: 0,
    totalCents: 0,
    municipalityClubsWithoutFee: 0,
    ...overrides,
  };
}

describe("firstWeekRate", () => {
  it("is the engaged share of the cohort's sign-ups", () => {
    expect(firstWeekRate({ signups: 8, engaged: 2 })).toBe(0.25);
  });

  it("has no rate when nobody signed up, rather than a rate of nought", () => {
    expect(firstWeekRate({ signups: 0, engaged: 0 })).toBeNull();
  });
});

describe("firstWeekRateChangePoints", () => {
  it("compares the two rates in whole percentage points", () => {
    expect(
      firstWeekRateChangePoints({ signups: 3, engaged: 1 }, { signups: 4, engaged: 1 }),
    ).toBe(8);
  });

  it("has no change when either end has no rate", () => {
    expect(
      firstWeekRateChangePoints({ signups: 4, engaged: 1 }, { signups: 0, engaged: 0 }),
    ).toBeNull();
  });
});

describe("engagementShares", () => {
  it("gives each slice its share of every family", () => {
    const shares = engagementShares({
      totalFamilies: 4,
      subscribersNotYetBegun: 0,
      slices: [
        { slice: "subscriber", families: 1 },
        { slice: "neverEnrolled", families: 3 },
      ],
    });
    expect(shares.map((row) => row.share)).toEqual([0.25, 0.75]);
  });

  it("gives every slice nought when there are no families", () => {
    const shares = engagementShares({
      totalFamilies: 0,
      subscribersNotYetBegun: 0,
      slices: [{ slice: "subscriber", families: 0 }],
    });
    expect(shares[0]?.share).toBe(0);
  });
});

describe("hasUnattributedRevenue", () => {
  it("is false when every month's unattributed band is empty or absent", () => {
    expect(
      hasUnattributedRevenue([
        revenueMonth({ unattributedCents: null }),
        revenueMonth({ unattributedCents: 0 }),
      ]),
    ).toBe(false);
  });

  it("is true when any month has money naming no product", () => {
    expect(hasUnattributedRevenue([revenueMonth({ unattributedCents: 500 })])).toBe(true);
  });
});

describe("last month's revenue", () => {
  it("names the band that brought in most, with its share of the total", () => {
    expect(
      largestRevenueBand(
        revenueMonth({
          subscriptionCents: 1000,
          campsAndEventsCents: 500,
          municipalityCents: 8500,
          totalCents: 10000,
        }),
      ),
    ).toEqual({ band: "municipality", share: 0.85 });
  });

  it("names no band for a month with no total, or nothing taken", () => {
    expect(largestRevenueBand(revenueMonth({ totalCents: null }))).toBeNull();
    expect(largestRevenueBand(revenueMonth({ totalCents: 0 }))).toBeNull();
  });

  it("moves on the month before, or has no change when either has no total", () => {
    expect(revenueChange({ ...revenueMonth({ totalCents: 900 }), monthBeforeCents: 1000 })).toBe(
      -100,
    );
    expect(
      revenueChange({ ...revenueMonth({ totalCents: 900 }), monthBeforeCents: null }),
    ).toBeNull();
  });
});

describe("seriesStart", () => {
  it("covers the window when the records begin at or before its first month", () => {
    expect(seriesStart(MONTHS, "2024-06-01")).toEqual({ kind: "covered" });
    expect(seriesStart(MONTHS, "2025-12-01")).toEqual({ kind: "covered" });
  });

  it("names the month the records begin when it falls inside the window", () => {
    expect(seriesStart(MONTHS, "2026-01-01")).toEqual({ kind: "from", month: "2026-01-01" });
  });

  it("says there are no records when there is no first month", () => {
    expect(seriesStart(MONTHS, null)).toEqual({ kind: "none" });
  });
});

describe("the gamers per Gedu line", () => {
  it("draws no point for a month before records or with no gedu, and a point for the rest", () => {
    expect(
      gamersPerGeduPoints([
        { month: "2025-12-01", sessions: null, ratio: null, gedusWhoRan: null },
        { month: "2026-01-01", sessions: 0, ratio: { gamers: 0, gedus: 0, ratio: null }, gedusWhoRan: 0 },
        { month: "2026-02-01", sessions: 3, ratio: { gamers: 12, gedus: 4, ratio: 3 }, gedusWhoRan: 2 },
      ]),
    ).toEqual([
      { month: "2025-12-01", gamersPerGedu: null, sessions: null, gedusWhoRan: null },
      { month: "2026-01-01", gamersPerGedu: null, sessions: 0, gedusWhoRan: 0 },
      { month: "2026-02-01", gamersPerGedu: 3, sessions: 3, gedusWhoRan: 2 },
    ]);
  });

  it("leads with the last complete month's point, never the month in progress", () => {
    const points = [
      { month: "2026-01-01", gamersPerGedu: 2, sessions: 4, gedusWhoRan: 2 },
      { month: "2026-02-01", gamersPerGedu: 3, sessions: 3, gedusWhoRan: 1 },
    ];
    expect(lastCompletePoint(points, "2026-02-01")?.month).toBe("2026-01-01");
    expect(lastCompletePoint(points, "2026-01-01")).toBeNull();
  });

  it("counts the certified Gedus on nothing running", () => {
    expect(certifiedNotOnRunning({ certified: 9, onRunningProduct: 6 })).toBe(3);
  });
});
