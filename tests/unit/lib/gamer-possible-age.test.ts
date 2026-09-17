import { describe, it, expect } from "vitest";

import { possibleAgeOnDate } from "@/lib/gamer-age-eligibility";

// The stored birth date is always the 1st of the month the parent chose, so the
// child was born some day in that month: the range is every age that allows.

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

  it("reads the last day of February in a leap year", () => {
    expect(possibleAgeOnDate("2012-02-01", "2026-02-28")).toEqual({ min: 13, max: 14 });
    expect(possibleAgeOnDate("2012-02-01", "2025-02-28")).toEqual({ min: 12, max: 13 });
  });
});
