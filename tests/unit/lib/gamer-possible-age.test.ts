import { describe, it, expect } from "vitest";

import { possibleAgeOnDate } from "@/lib/gamer-age-eligibility";

// The forms store the 1st of the month the parent chose, so the child was born
// some day in that month: the range is every age that allows. Rows carrying
// other days exist, and the range reads their month alone.

describe("possibleAgeOnDate", () => {
  it("is one age outside the birth month", () => {
    expect(possibleAgeOnDate("2012-03-01", "2026-09-17")).toEqual({ min: 14, max: 14 });
    expect(possibleAgeOnDate("2012-03-01", "2026-02-28")).toEqual({ min: 13, max: 13 });
  });

  it("spans two ages inside the birth month, until its last day", () => {
    // On 15 March the child born on the 1st is 14; one born on the 31st is 13.
    expect(possibleAgeOnDate("2012-03-01", "2026-03-15")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate("2012-03-01", "2026-03-31")).toEqual({ min: 14, max: 14 });
  });

  it("ignores the stored day, so every day of the birth month answers alike", () => {
    // A date inside the birth month, before and after the stored day: both are
    // the 1st's answer. Read as a date, the 20th would give 13 to 13 on the
    // 15th and leak which side of the 15th the birthday fell.
    for (const stored of ["2012-03-01", "2012-03-10", "2012-03-20", "2012-03-31"]) {
      expect(possibleAgeOnDate(stored, "2026-03-15")).toEqual({ min: 13, max: 14 });
      expect(possibleAgeOnDate(stored, "2026-03-31")).toEqual({ min: 14, max: 14 });
      expect(possibleAgeOnDate(stored, "2026-02-28")).toEqual({ min: 13, max: 13 });
    }
  });

  it("reads the last day of February in a leap year", () => {
    expect(possibleAgeOnDate("2012-02-01", "2026-02-28")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate("2012-02-01", "2025-02-28")).toEqual({ min: 12, max: 13 });
  });
});
