import { describe, it, expect } from "vitest";
import { finalSessionDate } from "@/lib/session-occurrence";

/**
 * ============================================================================
 * Which occurrence is a run's LAST one.
 * ============================================================================
 *
 * There is no stored final-session flag anywhere, so this has to be derived —
 * and it is derived **twice**, here for the client's completeness derivation and
 * in SQL for the dashboard's owed count. The two are twins: the RPC walks a
 * year-long window ending at `end_date`, floored at `start_date`, and takes the
 * greatest day whose weekday a schedule slot names and the group has not had
 * cancelled. Every case below is a property that walk also has, and the
 * comments say which.
 *
 * The dates here are bare calendar dates with no time of day and no zone, which
 * is what they are in the database too (`products.start_date` / `end_date` are
 * `date` columns). The arithmetic is therefore UTC-pinned and exact — no DST
 * transition can move a day — and that is the whole reason this is not built on
 * the instant-walking occurrence helpers beside it.
 */

/** Monday = 0, matching `schedule_slots.weekday` and `EXTRACT(ISODOW) - 1`. */
const MONDAY = [{ weekday: 0 }];
const THURSDAY = [{ weekday: 3 }];
/** A camp's five weekdays. */
const WEEKDAYS = [0, 1, 2, 3, 4].map((weekday) => ({ weekday }));
/** A group with nothing cancelled — every case but the cancellation block. */
const NONE: ReadonlySet<string> = new Set();

describe("finalSessionDate — runs that have no final session", () => {
  it("answers null for an open-ended run", () => {
    // The documented behaviour a flagged consumer club gets: no end date, no
    // last session, so nothing is ever owed. On the SQL side the lateral answers
    // NULL and the equality behind the fourth condition never holds.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2025-09-01",
        endDate: null,
        cancelledDates: NONE,
      }),
    ).toBeNull();
  });

  it("answers null for a run whose schedule projects nothing", () => {
    // A product with no slots at all — every weekday misses, so the walk falls
    // off the end of its window.
    expect(
      finalSessionDate({
        slots: [],
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        cancelledDates: NONE,
      }),
    ).toBeNull();
  });

  it("answers null when the last week holds no matching weekday", () => {
    // A one-day run on a day the schedule does not name: the start date floors
    // the walk on both sides, so the day before the run is never reached.
    expect(
      finalSessionDate({
        slots: THURSDAY,
        startDate: "2026-03-02",
        endDate: "2026-03-02",
        cancelledDates: NONE,
      }),
    ).toBeNull();
  });
});

describe("finalSessionDate — the last occurrence on or before the end date", () => {
  it("lands on the end date itself when the schedule names that weekday", () => {
    // 2026-03-30 is a Monday.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-01-05",
        endDate: "2026-03-30",
        cancelledDates: NONE,
      }),
    ).toBe("2026-03-30");
  });

  it("walks back to the last matching weekday before it", () => {
    // 2026-04-01 is a Wednesday; the last Monday on or before it is 2026-03-30.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-01-05",
        endDate: "2026-04-01",
        cancelledDates: NONE,
      }),
    ).toBe("2026-03-30");
  });

  it("takes the greatest of several slots, not the first one it meets", () => {
    // A camp runs Monday to Friday and ends on a Saturday: Friday is the last
    // day, and a walk that stopped at the first match in slot order would answer
    // Monday. The SQL takes a `max` over its window for the same reason.
    expect(
      finalSessionDate({
        slots: WEEKDAYS,
        startDate: "2026-03-16",
        endDate: "2026-03-21",
        cancelledDates: NONE,
      }),
    ).toBe("2026-03-20");
  });

  it("crosses a month and a year boundary without special-casing either", () => {
    // 2027-01-01 is a Friday; the last Thursday on or before it is 2026-12-31.
    expect(
      finalSessionDate({
        slots: THURSDAY,
        startDate: "2026-09-03",
        endDate: "2027-01-01",
        cancelledDates: NONE,
      }),
    ).toBe("2026-12-31");
  });

  it("is unmoved by a DST transition inside the window", () => {
    // Europe/Helsinki springs forward on 2026-03-29. The dates here are zoneless
    // calendar dates and the walk is UTC-pinned day arithmetic, so the
    // transition is not a thing that can happen to them — which is exactly why
    // this is not built on the instant-stepping occurrence walkers.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-03-02",
        endDate: "2026-03-31",
        cancelledDates: NONE,
      }),
    ).toBe("2026-03-30");
  });
});

describe("finalSessionDate — the start date is a floor", () => {
  it("refuses a match that falls before the run began", () => {
    // A run of two days ending on a Wednesday, on a Monday schedule: the Monday
    // in the window is the day before the run started, so there is no session.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-03-03",
        endDate: "2026-03-04",
        cancelledDates: NONE,
      }),
    ).toBeNull();
  });

  it("still searches the whole week when the run has no start date", () => {
    // `start_date` is nullable on an open-ended club, and a club can be given an
    // end date later; the SQL's GREATEST collapses to `end_date - 366` there,
    // and so does this.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: null,
        endDate: "2026-04-01",
        cancelledDates: NONE,
      }),
    ).toBe("2026-03-30");
  });
});

describe("finalSessionDate — a cancelled last session", () => {
  it("hands the obligation to the last session that is not cancelled", () => {
    // The SQL excludes the group's cancelled dates inside the same walk, so a
    // cancelled final Monday passes the creations condition to the one before.
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-01-05",
        endDate: "2026-03-30",
        cancelledDates: new Set(["2026-03-30"]),
      }),
    ).toBe("2026-03-23");
  });

  it("walks back past a run of cancelled weeks — further than one week", () => {
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-01-05",
        endDate: "2026-03-30",
        cancelledDates: new Set(["2026-03-30", "2026-03-23", "2026-03-16"]),
      }),
    ).toBe("2026-03-09");
  });

  it("answers null when every session of the run is cancelled", () => {
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-03-16",
        endDate: "2026-03-30",
        cancelledDates: new Set(["2026-03-16", "2026-03-23", "2026-03-30"]),
      }),
    ).toBeNull();
  });

  it("ignores a cancellation on a date the schedule does not name", () => {
    expect(
      finalSessionDate({
        slots: MONDAY,
        startDate: "2026-01-05",
        endDate: "2026-03-31",
        cancelledDates: new Set(["2026-03-31"]),
      }),
    ).toBe("2026-03-30");
  });
});
