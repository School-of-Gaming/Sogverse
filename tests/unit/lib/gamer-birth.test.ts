import { describe, it, expect } from "vitest";
import {
  assembleGamerDateOfBirth,
  gamerBirthMonthOptions,
  gamerBirthYearOptions,
  gamerBirthYearOptionsIncluding,
  splitGamerDateOfBirth,
} from "@/lib/gamer-birth";

describe("assembleGamerDateOfBirth", () => {
  it("zero-pads single-digit months", () => {
    expect(assembleGamerDateOfBirth(2017, 3)).toBe("2017-03-01");
  });

  it("leaves two-digit months alone", () => {
    expect(assembleGamerDateOfBirth(2014, 11)).toBe("2014-11-01");
  });

  it("always anchors the day to the 1st", () => {
    expect(assembleGamerDateOfBirth(2020, 1)).toBe("2020-01-01");
    expect(assembleGamerDateOfBirth(2020, 12)).toBe("2020-12-01");
  });
});

describe("gamerBirthYearOptions", () => {
  it("returns a rolling 13-year window from currentYear-6 down to currentYear-18", () => {
    const today = new Date("2026-05-11T12:00:00Z");
    expect(gamerBirthYearOptions(today)).toEqual([
      2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009, 2008,
    ]);
  });

  it("shifts forward by one year when the reference date advances a year", () => {
    const next = new Date("2027-01-01T12:00:00Z");
    const years = gamerBirthYearOptions(next);
    expect(years[0]).toBe(2021); // youngest age = 6 → currentYear - 6
    expect(years[years.length - 1]).toBe(2009); // oldest age = 18
  });

  it("is sorted descending", () => {
    const years = gamerBirthYearOptions(new Date("2026-05-11"));
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeLessThan(years[i - 1]);
    }
  });
});

describe("gamerBirthYearOptionsIncluding", () => {
  const today = new Date("2026-05-11T12:00:00Z");

  it("returns the plain window unchanged when the year is already in it", () => {
    expect(gamerBirthYearOptionsIncluding(2016, today)).toEqual(
      gamerBirthYearOptions(today),
    );
  });

  it("carries a year older than the window, still sorted descending", () => {
    const years = gamerBirthYearOptionsIncluding(1998, today);
    expect(years[years.length - 1]).toBe(1998);
    expect(years).toHaveLength(gamerBirthYearOptions(today).length + 1);
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBeLessThan(years[i - 1]);
    }
  });

  it("carries a year younger than the window at the head", () => {
    expect(gamerBirthYearOptionsIncluding(2025, today)[0]).toBe(2025);
  });
});

describe("gamerBirthMonthOptions", () => {
  const values = (locale: string, clamp?: Parameters<typeof gamerBirthMonthOptions>[1]) =>
    gamerBirthMonthOptions(locale, clamp).map((m) => m.value);

  it("offers all twelve months, labelled in the locale, when unclamped", () => {
    const months = gamerBirthMonthOptions("en-US");
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ value: 1, label: "January" });
    expect(months[11]).toEqual({ value: 12, label: "December" });
  });

  it("labels the months in the caller's own locale", () => {
    expect(gamerBirthMonthOptions("fi")[0].label).toBe("tammikuu");
  });

  it("offers all twelve when the selected year is in the past", () => {
    expect(
      values("en-US", { selectedYear: 2017, currentYear: 2026, currentMonth: 8 }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("stops at the current month when the selected year is the current year", () => {
    expect(
      values("en-US", { selectedYear: 2026, currentYear: 2026, currentMonth: 8 }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("offers only January in the current year's first month", () => {
    expect(
      values("en-US", { selectedYear: 2026, currentYear: 2026, currentMonth: 1 }),
    ).toEqual([1]);
  });

  it("carries a stored month the clamp would otherwise remove", () => {
    expect(
      values("en-US", {
        selectedYear: 2026,
        currentYear: 2026,
        currentMonth: 8,
        stored: { year: 2026, month: 11 },
      }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11]);
  });

  it("does not duplicate a stored month the clamp already keeps", () => {
    expect(
      values("en-US", {
        selectedYear: 2026,
        currentYear: 2026,
        currentMonth: 8,
        stored: { year: 2026, month: 3 },
      }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not carry the stored month into a different year's list", () => {
    // The row holds November 2025; with 2026 selected, November is a future
    // month of a year the row says nothing about.
    expect(
      values("en-US", {
        selectedYear: 2026,
        currentYear: 2026,
        currentMonth: 8,
        stored: { year: 2025, month: 11 },
      }),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("splitGamerDateOfBirth", () => {
  it("round-trips what assembleGamerDateOfBirth composes", () => {
    expect(splitGamerDateOfBirth(assembleGamerDateOfBirth(2017, 3))).toEqual({
      year: 2017,
      month: 3,
    });
  });

  it("reads the digits rather than the runtime's calendar", () => {
    // January 1st is the case a Date-based parse gets wrong west of UTC: the
    // UTC-midnight instant is still December 31st there.
    expect(splitGamerDateOfBirth("2019-01-01")).toEqual({ year: 2019, month: 1 });
    expect(splitGamerDateOfBirth("2019-12-01")).toEqual({ year: 2019, month: 12 });
  });

  it("ignores the day, which no form ever sets", () => {
    expect(splitGamerDateOfBirth("2013-07-24")).toEqual({ year: 2013, month: 7 });
  });
});
