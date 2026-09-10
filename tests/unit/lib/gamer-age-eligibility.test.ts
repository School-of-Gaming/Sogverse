import { describe, it, expect } from "vitest";
import { gamerAgeBlock } from "@/lib/gamer-age-eligibility";

/**
 * **Which children a product's age band refuses, and — the part worth the
 * test — which ones it must not.**
 *
 * Two things make this more than subtraction. The stored birth date is the 1st
 * of a month because nothing in the product ever asks for the day, so every
 * child's real age today is one of two adjacent numbers and the helper has to
 * pick a side deliberately at each end. And the two ends read the calendar at
 * different dates: the minimum is measured at the later of today and the
 * product's start date, the maximum today. Both choices favour the family, and
 * the cases below are written so that a change to either shows up as a child
 * being wrongly let in or wrongly locked out rather than as a number moving.
 *
 * Every date here is a bare `YYYY-MM-DD` string, which is what the helper takes
 * — so nothing in this file depends on the runtime's timezone.
 */

/** An 8–12 band with no start date, which is the ordinary club. */
const BAND = { minAge: 8, maxAge: 12, startDate: null };

describe("inside the band", () => {
  it("passes a child comfortably in range", () => {
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2016-03-01", today: "2026-09-10" }),
    ).toBeNull();
  });

  it("passes a child at each end of it", () => {
    // Exactly 8, and exactly 12 with the month still to run.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2018-09-01", today: "2026-09-10" }),
    ).toBeNull();
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2014-09-01", today: "2026-09-10" }),
    ).toBeNull();
  });
});

describe("the lower end resolves the unknown day in the child's favour", () => {
  it("refuses a child who cannot be old enough on any day of their month", () => {
    // Born some time in September 2019: seven whichever day it was.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2019-09-01", today: "2026-09-10" }),
    ).toBe("under");
  });

  it("admits a child whose birthday month is this month", () => {
    // Born some time in September 2018. Born on the 1st they are already
    // eight; born on the 30th they are still seven for another twenty days.
    // The oldest they could be is what the minimum is tested against, so they
    // are in — and a helper measuring the youngest would lock them out for
    // three weeks of the month they turn eight in.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2018-09-01", today: "2026-09-10" }),
    ).toBeNull();
  });

  it("refuses them on the last day before that month", () => {
    // One day earlier and no day of September can have happened yet.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2018-09-01", today: "2026-08-31" }),
    ).toBe("under");
  });
});

describe("the lower end is measured at the start date, not at the click", () => {
  it("admits a child who turns old enough before the product starts", () => {
    // Seven today, eight when the club's first session runs. Refusing them a
    // seat in the weeks beforehand refuses them on a fact that is no longer
    // true by the time it matters.
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: 12,
        dateOfBirth: "2018-11-01",
        today: "2026-09-10",
        startDate: "2027-01-15",
      }),
    ).toBeNull();
  });

  it("admits a child who turns old enough exactly ON the start date", () => {
    // The boundary the rule is written at: their eighth birthday is the first
    // day of the club.
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: 12,
        dateOfBirth: "2019-01-01",
        today: "2026-09-10",
        startDate: "2027-01-01",
      }),
    ).toBeNull();
  });

  it("refuses a child who is still short on the start date", () => {
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: 12,
        dateOfBirth: "2019-02-01",
        today: "2026-09-10",
        startDate: "2027-01-01",
      }),
    ).toBe("under");
  });

  it("ignores a start date already in the past", () => {
    // A club that started in the spring is measured today, exactly as an
    // open-ended one is — the reference is the *later* of the two, and a past
    // start date is never it. Seven at the start, eight now, in either way.
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: 12,
        dateOfBirth: "2018-06-01",
        today: "2026-09-10",
        startDate: "2026-03-01",
      }),
    ).toBeNull();
  });
});

describe("the upper end resolves the unknown day in the child's favour", () => {
  it("admits a child whose thirteenth birthday month is this month", () => {
    // Born some time in September 2013. Born on the 1st they turned thirteen
    // nine days ago; born on the 30th they are still twelve. The youngest they
    // could be is what the maximum is tested against, so they are in.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2013-09-01", today: "2026-09-10" }),
    ).toBeNull();
  });

  it("refuses them once the month is over", () => {
    // October: no day of September 2013 leaves them under thirteen any more.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2013-09-01", today: "2026-10-01" }),
    ).toBe("over");
  });

  it("admits them right up to the day the youngest of them turns thirteen", () => {
    // September has 30 days, so the youngest possible birth date is the 30th
    // and the 29th is the last day on which *no* day of that month makes them
    // thirteen. The day after, the youngest of them has had their birthday and
    // the band has nothing left to be generous with.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2013-09-01", today: "2026-09-29" }),
    ).toBeNull();
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2013-09-01", today: "2026-09-30" }),
    ).toBe("over");
  });

  it("gets February's short month right", () => {
    // The last day of the birth month is computed, not assumed: February 2014
    // ends on the 28th, so the 28th of February is already the day the
    // youngest possible child turns thirteen. Were the month taken as 30 days
    // long — or as any length past the 28th — this pair would come out the
    // other way round.
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2014-02-01", today: "2027-02-27" }),
    ).toBeNull();
    expect(
      gamerAgeBlock({ ...BAND, dateOfBirth: "2014-02-01", today: "2027-02-28" }),
    ).toBe("over");
  });

  it("is measured today whatever the start date says", () => {
    // A child who turns thirteen before the club starts is not refused for it:
    // the upper end is about who the product is for, and the family has
    // already decided that. The start date only ever moves the lower end.
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: 12,
        dateOfBirth: "2013-12-01",
        today: "2026-09-10",
        startDate: "2027-06-01",
      }),
    ).toBeNull();
  });
});

describe("a null bound never blocks", () => {
  it("lets a very young child through a product with no minimum", () => {
    expect(
      gamerAgeBlock({
        minAge: null,
        maxAge: 12,
        dateOfBirth: "2023-05-01",
        today: "2026-09-10",
        startDate: null,
      }),
    ).toBeNull();
  });

  it("lets a teenager through a product with no maximum", () => {
    expect(
      gamerAgeBlock({
        minAge: 8,
        maxAge: null,
        dateOfBirth: "2008-05-01",
        today: "2026-09-10",
        startDate: null,
      }),
    ).toBeNull();
  });

  it("refuses nobody at all when the product names neither", () => {
    expect(
      gamerAgeBlock({
        minAge: null,
        maxAge: null,
        dateOfBirth: "2008-05-01",
        today: "2026-09-10",
        startDate: null,
      }),
    ).toBeNull();
  });
});
