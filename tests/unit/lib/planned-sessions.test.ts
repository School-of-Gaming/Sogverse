import { describe, it, expect } from "vitest";
import {
  nextRunning,
  plannedSessionRows,
  trimOpenEndedFuture,
  type PlannedSession,
} from "@/lib/planned-sessions";

/**
 * The shaping the app does over the database's session plan. The plan itself
 * is the database's and is tested there (`tests/db/planned-sessions.test.ts`);
 * these cases hold the two helpers to what the occurrence walks they replace
 * answer — a list keeps every started session plus the next `cap` still open,
 * and the next session is the first open one nobody cancelled.
 */

const MARGIN = 5 * 60_000;

/** A one-hour session at 10:00 UTC on `date`. */
function session(date: string, cancelled = false): PlannedSession {
  return {
    date,
    startsAt: new Date(`${date}T10:00:00.000Z`),
    endsAt: new Date(`${date}T11:00:00.000Z`),
    cancelled,
  };
}

/** A weekly plan of `count` Monday sessions from 2030-01-07. */
function weekly(count: number): PlannedSession[] {
  return Array.from({ length: count }, (_, week) =>
    session(new Date(Date.UTC(2030, 0, 7 + week * 7)).toISOString().slice(0, 10)),
  );
}

const dates = (plan: readonly PlannedSession[]) => plan.map((s) => s.date);

describe("plannedSessionRows", () => {
  it("parses the database's rows into dates and instants", () => {
    const parsed = plannedSessionRows.parse([
      {
        session_date: "2030-03-30",
        starts_at: "2030-03-30T21:00:00+00:00",
        ends_at: "2030-03-31T02:00:00+00:00",
      },
      {
        session_date: "2030-03-31",
        starts_at: "2030-03-31T07:00:00+00:00",
        ends_at: "2030-03-31T08:00:00+00:00",
        cancelled: true,
      },
    ]);
    expect(parsed).toEqual([
      {
        date: "2030-03-30",
        startsAt: new Date("2030-03-30T21:00:00.000Z"),
        endsAt: new Date("2030-03-31T02:00:00.000Z"),
        // A plan read without cancellations in view has none.
        cancelled: false,
      },
      {
        date: "2030-03-31",
        startsAt: new Date("2030-03-31T07:00:00.000Z"),
        endsAt: new Date("2030-03-31T08:00:00.000Z"),
        cancelled: true,
      },
    ]);
  });

  it("refuses a row that is not a date or an instant", () => {
    const row = {
      session_date: "2030-03-30",
      starts_at: "2030-03-30T21:00:00+00:00",
      ends_at: "2030-03-31T02:00:00+00:00",
    };
    expect(plannedSessionRows.safeParse([{ ...row, session_date: "30.3.2030" }]).success).toBe(false);
    expect(plannedSessionRows.safeParse([{ ...row, starts_at: "soon" }]).success).toBe(false);
  });
});

describe("trimOpenEndedFuture", () => {
  const plan = weekly(20);

  it("keeps every started session and the next `cap` after them", () => {
    // Wednesday of the fourth week: three sessions are over, and eight lie ahead.
    const now = new Date("2030-01-30T12:00:00.000Z");
    expect(dates(trimOpenEndedFuture(plan, now, 8, MARGIN))).toEqual(
      dates(plan.slice(0, 4 + 8)),
    );
  });

  it("counts a session in progress toward the cap, and keeps it once", () => {
    const now = new Date("2030-01-28T10:30:00.000Z");
    const trimmed = trimOpenEndedFuture(plan, now, 8, MARGIN);
    // Weeks 1–3 have started and ended; week 4 is in progress and is the first
    // of the eight open ones, so the list stops at week 11.
    expect(dates(trimmed)).toEqual(dates(plan.slice(0, 11)));
  });

  it("keeps a session open for the margin after it ends", () => {
    const inside = new Date("2030-01-28T11:04:00.000Z");
    const after = new Date("2030-01-28T11:05:00.000Z");
    expect(trimOpenEndedFuture(plan, inside, 8, MARGIN)).toHaveLength(11);
    // Closed: week 4 is only a started session now, and the eighth open one is
    // week 12.
    expect(trimOpenEndedFuture(plan, after, 8, MARGIN)).toHaveLength(12);
  });

  it("before the first session, is the first `cap`", () => {
    const now = new Date("2029-12-01T00:00:00.000Z");
    expect(dates(trimOpenEndedFuture(plan, now, 8, MARGIN))).toEqual(
      dates(plan.slice(0, 8)),
    );
  });
});

describe("nextRunning", () => {
  it("is the first session that has not closed", () => {
    const plan = weekly(4);
    const { next, cancelledAhead } = nextRunning(
      plan,
      new Date("2030-01-14T10:30:00.000Z"),
      MARGIN,
    );
    // In progress is still next.
    expect(next?.date).toBe("2030-01-14");
    expect(cancelledAhead).toEqual([]);
  });

  it("skips the cancelled sessions ahead of it, and names them", () => {
    const plan = [
      session("2030-01-07"),
      session("2030-01-14", true),
      session("2030-01-21", true),
      session("2030-01-28"),
    ];
    const { next, cancelledAhead } = nextRunning(
      plan,
      new Date("2030-01-08T00:00:00.000Z"),
      MARGIN,
    );
    expect(next?.date).toBe("2030-01-28");
    expect(dates(cancelledAhead)).toEqual(["2030-01-14", "2030-01-21"]);
  });

  it("is null when every open session is cancelled", () => {
    const plan = [session("2030-01-07"), session("2030-01-14", true)];
    const { next, cancelledAhead } = nextRunning(
      plan,
      new Date("2030-01-08T00:00:00.000Z"),
      MARGIN,
    );
    expect(next).toBeNull();
    expect(dates(cancelledAhead)).toEqual(["2030-01-14"]);
  });
});
