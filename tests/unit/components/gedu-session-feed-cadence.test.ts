import { describe, expect, it } from "vitest";
import { toZonedTime } from "date-fns-tz";
import {
  CLUB_FUTURE_SPECS,
  buildSessionFeedFixture,
  countLeadingFutureSpecs,
  sessionStartsForCadence,
  type EntrySpec,
} from "@/components/gedu/session-feed/mock-fixtures";
import { OPEN_ENDED_OCCURRENCE_CAP } from "@/lib/session-occurrence";

/**
 * The session-feed fixtures place every session relative to a `now` the caller
 * supplies, so the only thing that can be wrong is the arithmetic that walks
 * backwards from the next session. These tests pin it: a weekly club stays on
 * its weekday, a camp runs consecutive weekdays and never invents a Saturday,
 * and neither drifts an hour across a DST boundary.
 */

const TZ = "Europe/Helsinki";

/** Wall-clock `HH:MM` in the club's own zone. */
function wallClock(instant: Date): string {
  const zoned = toZonedTime(instant, TZ);
  return `${String(zoned.getHours()).padStart(2, "0")}:${String(
    zoned.getMinutes(),
  ).padStart(2, "0")}`;
}

/** JS weekday (0 = Sunday) in the club's own zone. */
function weekdayIn(instant: Date): number {
  return toZonedTime(instant, TZ).getDay();
}

function calendarDaysBetween(later: Date, earlier: Date): number {
  const a = toZonedTime(later, TZ);
  const b = toZonedTime(earlier, TZ);
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((dayA - dayB) / 86_400_000);
}

describe("sessionStartsForCadence — weekly", () => {
  const starts = sessionStartsForCadence({
    // A Wednesday, mid-term.
    now: new Date("2026-02-11T09:00:00Z"),
    count: 10,
    cadence: "weekly",
    weekday: 0, // Monday
    startTime: "16:30",
    timeZone: TZ,
  });

  it("puts the next session first and walks strictly backwards", () => {
    expect(starts).toHaveLength(10);
    expect(starts[0].getTime()).toBeGreaterThan(
      new Date("2026-02-11T09:00:00Z").getTime(),
    );
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].getTime()).toBeLessThan(starts[i - 1].getTime());
    }
  });

  it("keeps every session on the club's weekday at its wall clock", () => {
    for (const start of starts) {
      expect(weekdayIn(start)).toBe(1); // Monday
      expect(wallClock(start)).toBe("16:30");
    }
  });

  it("steps exactly seven calendar days at a time", () => {
    for (let i = 1; i < starts.length; i++) {
      expect(calendarDaysBetween(starts[i - 1], starts[i])).toBe(7);
    }
  });
});

describe("sessionStartsForCadence — daily", () => {
  const starts = sessionStartsForCadence({
    // A Wednesday morning, before the day's 10:00 start.
    now: new Date("2026-02-11T06:00:00Z"),
    count: 8,
    cadence: "daily",
    weekday: 0,
    startTime: "10:00",
    timeZone: TZ,
  });

  it("runs consecutive weekdays, newest first", () => {
    expect(starts).toHaveLength(8);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].getTime()).toBeLessThan(starts[i - 1].getTime());
    }
  });

  it("never lands on a weekend", () => {
    for (const start of starts) {
      expect(weekdayIn(start)).toBeGreaterThanOrEqual(1);
      expect(weekdayIn(start)).toBeLessThanOrEqual(5);
    }
  });

  it("steps one calendar day, or three when reaching back over a weekend", () => {
    for (let i = 1; i < starts.length; i++) {
      // Monday reaches back to Friday; every other step is a single day.
      const expected = weekdayIn(starts[i - 1]) === 1 ? 3 : 1;
      expect(calendarDaysBetween(starts[i - 1], starts[i])).toBe(expected);
    }
  });

  it("keeps the wall clock on every day", () => {
    for (const start of starts) {
      expect(wallClock(start)).toBe("10:00");
    }
  });

  it("skips today once its start time has passed", () => {
    // 10:30 Helsinki on the same Wednesday — the day's session has begun.
    const afterStart = sessionStartsForCadence({
      now: new Date("2026-02-11T08:30:00Z"),
      count: 1,
      cadence: "daily",
      weekday: 0,
      startTime: "10:00",
      timeZone: TZ,
    });
    expect(weekdayIn(afterStart[0])).toBe(4); // Thursday
  });

  it("reaches over the weekend from a Friday evening", () => {
    // Friday 20:00 Helsinki: the next weekday session is Monday.
    const starts = sessionStartsForCadence({
      now: new Date("2026-02-13T18:00:00Z"),
      count: 1,
      cadence: "daily",
      weekday: 0,
      startTime: "10:00",
      timeZone: TZ,
    });
    expect(weekdayIn(starts[0])).toBe(1); // Monday
  });
});

describe("sessionStartsForCadence — DST", () => {
  // Europe/Helsinki springs forward on Sunday 29 March 2026. A run of sessions
  // reaching back across it must keep its wall clock: a flat 7x24h (or 24h)
  // subtraction silently moves the club to 15:30 for the older half of the term.
  const springForward = new Date("2026-04-08T09:00:00Z"); // Wednesday after

  it("holds the wall clock across the transition, weekly", () => {
    const starts = sessionStartsForCadence({
      now: springForward,
      count: 6,
      cadence: "weekly",
      weekday: 0,
      startTime: "16:30",
      timeZone: TZ,
    });
    // Six Mondays back from 8 April reaches into early March, well before the
    // transition.
    expect(starts.map(wallClock)).toEqual(Array(6).fill("16:30"));
    expect(new Set(starts.map(weekdayIn))).toEqual(new Set([1]));
  });

  it("holds the wall clock across the transition, daily", () => {
    const starts = sessionStartsForCadence({
      now: springForward,
      count: 10,
      cadence: "daily",
      startTime: "10:00",
      weekday: 0,
      timeZone: TZ,
    });
    expect(starts.map(wallClock)).toEqual(Array(10).fill("10:00"));
  });
});

describe("sessionStartsForCadence — a future block", () => {
  const now = new Date("2026-02-11T09:00:00Z"); // Wednesday, mid-term

  it("puts the next session at futureCount - 1 and steps forward above it", () => {
    const starts = sessionStartsForCadence({
      now,
      count: 8,
      cadence: "weekly",
      weekday: 0,
      startTime: "16:30",
      timeZone: TZ,
      futureCount: 3,
    });

    // Still strictly descending across the whole list — the future block is not
    // a separately-ordered island, it is the head of one continuous sequence.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].getTime()).toBeLessThan(starts[i - 1].getTime());
    }
    // Index 2 is the next session; 0 and 1 are further ahead, 3+ are past.
    expect(starts[2].getTime()).toBeGreaterThan(now.getTime());
    expect(starts[1].getTime()).toBeGreaterThan(starts[2].getTime());
    expect(starts[3].getTime()).toBeLessThan(now.getTime());
    for (const start of starts) expect(wallClock(start)).toBe("16:30");
  });

  it("walks a camp's future forward over the weekend without inventing a Saturday", () => {
    const starts = sessionStartsForCadence({
      // Friday morning before the 10:00 start.
      now: new Date("2026-02-13T06:00:00Z"),
      count: 6,
      cadence: "daily",
      weekday: 0,
      startTime: "10:00",
      timeZone: TZ,
      futureCount: 4,
    });
    for (const start of starts) {
      expect(weekdayIn(start)).toBeGreaterThanOrEqual(1);
      expect(weekdayIn(start)).toBeLessThanOrEqual(5);
      expect(wallClock(start)).toBe("10:00");
    }
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].getTime()).toBeLessThan(starts[i - 1].getTime());
    }
  });

  it("clamps a futureCount past the list length", () => {
    const starts = sessionStartsForCadence({
      now,
      count: 2,
      cadence: "weekly",
      weekday: 0,
      startTime: "16:30",
      timeZone: TZ,
      futureCount: 9,
    });
    expect(starts).toHaveLength(2);
    for (const start of starts) {
      expect(start.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("countLeadingFutureSpecs", () => {
  it("counts the leading run and stops at the first past entry", () => {
    expect(
      countLeadingFutureSpecs([
        { kind: "future" },
        { kind: "future" },
        { kind: "needs_record" },
        // A stray future entry after the past block is a caller ordering bug
        // and must not extend the count.
        { kind: "future" },
      ]),
    ).toBe(2);
  });

  it("is zero for a purely historical list and the full length for a purely future one", () => {
    expect(countLeadingFutureSpecs([{ kind: "no_record" }])).toBe(0);
    expect(
      countLeadingFutureSpecs([{ kind: "future" }, { kind: "future" }]),
    ).toBe(2);
  });
});

describe("CLUB_FUTURE_SPECS", () => {
  it("reaches exactly as far ahead as the shared open-ended cap", () => {
    // The feed's horizon and the dashboards' horizon are the same rule; if the
    // cap moves, this fixture has to move with it or the scene starts lying.
    expect(CLUB_FUTURE_SPECS).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
    expect(CLUB_FUTURE_SPECS.every((s) => s.kind === "future")).toBe(true);
  });

  it("shows a substitute request and a forward note, so both states are visible", () => {
    expect(
      CLUB_FUTURE_SPECS.some(
        (s) => s.kind === "future" && s.needsSubstitute === true,
      ),
    ).toBe(true);
    expect(
      CLUB_FUTURE_SPECS.some(
        (s) => s.kind === "future" && s.publicNote !== undefined,
      ),
    ).toBe(true);
  });
});

describe("buildSessionFeedFixture", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("emits one entry per spec, in the order given", () => {
    const specs: readonly EntrySpec[] = [
      { kind: "future" },
      { kind: "needs_record" },
      { kind: "skipped", reason: "Public holiday" },
    ];
    const { entries } = buildSessionFeedFixture(now, { specs });
    expect(entries.map((e) => e.kind)).toEqual([
      "future",
      "needs_record",
      "skipped",
    ]);
  });

  it("dates the whole future block ahead of now, next session last", () => {
    const specs: readonly EntrySpec[] = [
      { kind: "future" },
      { kind: "future" },
      { kind: "future" },
      { kind: "needs_record" },
    ];
    const { entries } = buildSessionFeedFixture(now, { specs });
    for (const entry of entries.slice(0, 3)) {
      expect(entry.startsAt.getTime()).toBeGreaterThan(now.getTime());
    }
    expect(entries[3].startsAt.getTime()).toBeLessThan(now.getTime());
  });

  it("carries a future spec's planning fields onto its entry", () => {
    const { entries } = buildSessionFeedFixture(now, {
      specs: [
        {
          kind: "future",
          publicNote: "Redstone follow-up.",
          staffNote: "Charge the spare laptop.",
          needsSubstitute: true,
        },
      ],
    });
    expect(entries[0]).toMatchObject({
      kind: "future",
      publicNote: "Redstone follow-up.",
      staffNote: "Charge the spare laptop.",
      needsSubstitute: true,
    });
  });

  it("leaves an unplanned future session's fields null and unflagged", () => {
    const { entries } = buildSessionFeedFixture(now, {
      specs: [{ kind: "future" }],
    });
    expect(entries[0]).toMatchObject({
      kind: "future",
      publicNote: null,
      staffNote: null,
      needsSubstitute: false,
    });
  });

  it("defaults to the weekly club with its full future horizon", () => {
    const { entries, timeZone } = buildSessionFeedFixture(now);
    expect(timeZone).toBe(TZ);
    const future = entries.filter((e) => e.kind === "future");
    expect(future).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
    // The next session is the last future entry, and every one of them is on
    // the club's own weekday.
    for (const entry of future) {
      expect(entry.startsAt.getTime()).toBeGreaterThan(now.getTime());
      expect(weekdayIn(entry.startsAt)).toBe(1);
    }
  });

  it("packs a camp's dates into consecutive weekdays", () => {
    const specs: readonly EntrySpec[] = Array.from({ length: 6 }, () => ({
      kind: "needs_record" as const,
    }));
    const { entries } = buildSessionFeedFixture(now, {
      cadence: "daily",
      specs,
      startTime: "10:00",
      durationMinutes: 180,
    });
    for (const entry of entries) {
      expect(weekdayIn(entry.startsAt)).toBeGreaterThanOrEqual(1);
      expect(weekdayIn(entry.startsAt)).toBeLessThanOrEqual(5);
      expect(entry.endsAt.getTime() - entry.startsAt.getTime()).toBe(
        180 * 60 * 1000,
      );
    }
  });
});
