import { describe, it, expect } from "vitest";
import {
  assembleGamerDateOfBirth,
  gamerBirthYearOptions,
} from "@/components/family/add-gamer-dialog-helpers";

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
