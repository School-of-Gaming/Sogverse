import { describe, it, expect } from "vitest";

import { ageOnDate, possibleAgeOnDate } from "@/lib/gamer-age-eligibility";

// A child is stored as a year and a month: born some day in that month.

const MARCH_2012 = { year: 2012, month: 3 };

describe("ageOnDate", () => {
  it("counts the child a year older from the 1st of their birth month", () => {
    expect(ageOnDate(MARCH_2012, "2026-02-28")).toBe(13);
    expect(ageOnDate(MARCH_2012, "2026-03-01")).toBe(14);
    expect(ageOnDate(MARCH_2012, "2026-03-31")).toBe(14);
    expect(ageOnDate(MARCH_2012, "2026-04-01")).toBe(14);
  });

  it("crosses a year boundary for a January or December birth", () => {
    expect(ageOnDate({ year: 2012, month: 1 }, "2025-12-31")).toBe(13);
    expect(ageOnDate({ year: 2012, month: 1 }, "2026-01-01")).toBe(14);
    expect(ageOnDate({ year: 2012, month: 12 }, "2026-11-30")).toBe(13);
    expect(ageOnDate({ year: 2012, month: 12 }, "2026-12-01")).toBe(14);
  });

  it("is the oldest age the birth month allows", () => {
    for (const on of ["2026-02-28", "2026-03-01", "2026-03-15", "2026-03-31"]) {
      expect(ageOnDate(MARCH_2012, on)).toBe(possibleAgeOnDate(MARCH_2012, on).max);
    }
  });
});

describe("possibleAgeOnDate", () => {
  it("is one age outside the birth month", () => {
    expect(possibleAgeOnDate(MARCH_2012, "2026-09-17")).toEqual({ min: 14, max: 14 });
    expect(possibleAgeOnDate(MARCH_2012, "2026-02-28")).toEqual({ min: 13, max: 13 });
  });

  it("spans two ages inside the birth month, until its last day", () => {
    // On 15 March the child born on the 1st is 14; one born on the 31st is 13.
    expect(possibleAgeOnDate(MARCH_2012, "2026-03-01")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate(MARCH_2012, "2026-03-15")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate(MARCH_2012, "2026-03-31")).toEqual({ min: 14, max: 14 });
  });

  it("reads the last day of February in a leap year", () => {
    const february2012 = { year: 2012, month: 2 };
    expect(possibleAgeOnDate(february2012, "2026-02-28")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate(february2012, "2025-02-28")).toEqual({ min: 12, max: 13 });
  });
});
