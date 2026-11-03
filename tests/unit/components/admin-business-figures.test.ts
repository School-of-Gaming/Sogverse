import { describe, expect, it } from "vitest";
import {
  certifiedNotOnRunning,
  engagementShares,
  gamersPerGeduPoints,
  hasUnattributedRevenue,
  seriesStart,
  signupRate,
  signupRateChangePoints,
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
    municipalityClubsWithoutFee: 0,
    ...overrides,
  };
}

describe("signupRate", () => {
  it("is the seated share of the window's sign-ups", () => {
    expect(signupRate({ registered: 8, seated: 2 })).toBe(0.25);
  });

  it("has no rate when nobody signed up, rather than a rate of nought", () => {
    expect(signupRate({ registered: 0, seated: 0 })).toBeNull();
  });
});

describe("signupRateChangePoints", () => {
  it("compares the two rates in whole percentage points", () => {
    expect(
      signupRateChangePoints({ registered: 3, seated: 1 }, { registered: 4, seated: 1 }),
    ).toBe(8);
  });

  it("has no change when either end has no rate", () => {
    expect(
      signupRateChangePoints({ registered: 4, seated: 1 }, { registered: 0, seated: 0 }),
    ).toBeNull();
  });
});

describe("engagementShares", () => {
  it("gives each slice its share of every family", () => {
    const shares = engagementShares({
      totalFamilies: 4,
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
        { month: "2025-12-01", sessions: null, ratio: null },
        { month: "2026-01-01", sessions: 0, ratio: { gamers: 0, gedus: 0, ratio: null } },
        { month: "2026-02-01", sessions: 3, ratio: { gamers: 12, gedus: 4, ratio: 3 } },
      ]),
    ).toEqual([
      { month: "2025-12-01", gamersPerGedu: null, sessions: null, gamers: null, gedus: null },
      { month: "2026-01-01", gamersPerGedu: null, sessions: 0, gamers: 0, gedus: 0 },
      { month: "2026-02-01", gamersPerGedu: 3, sessions: 3, gamers: 12, gedus: 4 },
    ]);
  });

  it("counts the certified Gedus on nothing running", () => {
    expect(certifiedNotOnRunning({ certified: 9, onRunningProduct: 6 })).toBe(3);
  });
});
