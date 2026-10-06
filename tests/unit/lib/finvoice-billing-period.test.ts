import { describe, it, expect } from "vitest";
import { billingPeriodOf, earlierPeriodMonths } from "@/lib/finvoice";

/**
 * The calendar arithmetic of a billing period: which calendar months a
 * monthly, quarterly or half-yearly customer's file covers, and which month it
 * is produced in. Periods are calendar-aligned — quarters Jan–Mar, Apr–Jun,
 * Jul–Sep and Oct–Dec, half-years Jan–Jun and Jul–Dec — so every boundary is a
 * fact about the calendar, and each is pinned here.
 */

describe("billingPeriodOf", () => {
  it("makes a month its own one-month period", () => {
    expect(billingPeriodOf("monthly", "2026-02-01")).toEqual({
      cadence: "monthly",
      year: 2026,
      ordinal: 2,
      months: ["2026-02-01"],
      firstMonth: "2026-02-01",
      lastMonth: "2026-02-01",
      endDate: "2026-02-28",
    });
  });

  it.each([
    ["2026-01-01", 1, "2026-01-01", "2026-03-01", "2026-03-31"],
    ["2026-03-01", 1, "2026-01-01", "2026-03-01", "2026-03-31"],
    ["2026-04-01", 2, "2026-04-01", "2026-06-01", "2026-06-30"],
    ["2026-06-01", 2, "2026-04-01", "2026-06-01", "2026-06-30"],
    ["2026-07-01", 3, "2026-07-01", "2026-09-01", "2026-09-30"],
    ["2026-09-01", 3, "2026-07-01", "2026-09-01", "2026-09-30"],
    ["2026-10-01", 4, "2026-10-01", "2026-12-01", "2026-12-31"],
    ["2026-12-01", 4, "2026-10-01", "2026-12-01", "2026-12-31"],
  ])(
    "puts %s in quarter %i, %s to %s",
    (month, ordinal, firstMonth, lastMonth, endDate) => {
      const period = billingPeriodOf("quarterly", month);
      expect(period).toMatchObject({ ordinal, firstMonth, lastMonth, endDate });
      expect(period.months).toHaveLength(3);
    },
  );

  it.each([
    ["2026-01-01", 1, "2026-01-01", "2026-06-01"],
    ["2026-06-01", 1, "2026-01-01", "2026-06-01"],
    ["2026-07-01", 2, "2026-07-01", "2026-12-01"],
    ["2026-12-01", 2, "2026-07-01", "2026-12-01"],
  ])("puts %s in half %i, %s to %s", (month, ordinal, firstMonth, lastMonth) => {
    const period = billingPeriodOf("half_yearly", month);
    expect(period).toMatchObject({ ordinal, firstMonth, lastMonth });
    expect(period.months).toEqual([
      firstMonth,
      ...[1, 2, 3, 4, 5].map(
        (offset) =>
          `2026-${String(Number(firstMonth.slice(5, 7)) + offset).padStart(2, "0")}-01`,
      ),
    ]);
  });

  it("never crosses a year", () => {
    const december = billingPeriodOf("quarterly", "2026-12-01");
    const january = billingPeriodOf("quarterly", "2027-01-01");

    expect(december.year).toBe(2026);
    expect(january).toMatchObject({ year: 2027, ordinal: 1 });
  });

  it("knows February's length in a leap year", () => {
    expect(billingPeriodOf("monthly", "2028-02-01").endDate).toBe("2028-02-29");
  });
});

describe("earlierPeriodMonths", () => {
  it("asks for nothing more in a month that ends no period in use", () => {
    expect(
      earlierPeriodMonths("2026-05-01", ["monthly", "quarterly", "half_yearly"]),
    ).toEqual([]);
  });

  it("asks for nothing more when every customer is monthly", () => {
    expect(earlierPeriodMonths("2026-06-01", ["monthly"])).toEqual([]);
  });

  it("asks for the quarter's first two months at its end", () => {
    expect(earlierPeriodMonths("2026-03-01", ["quarterly", "half_yearly"])).toEqual(
      ["2026-01-01", "2026-02-01"],
    );
  });

  it("asks for the half-year's first five months once, whatever else ends there", () => {
    expect(
      earlierPeriodMonths("2026-06-01", ["quarterly", "half_yearly", "monthly"]),
    ).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
  });
});
