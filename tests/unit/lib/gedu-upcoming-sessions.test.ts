import { describe, expect, it } from "vitest";
import type { GeduAssignmentRow } from "@/lib/gedu-assignment-rollup";
import {
  buildGeduUpcomingSessions,
  groupSessionsByWeek,
  initiallyShownWeeks,
  viewerWeekStart,
  weekHeadingKind,
  type GeduUpcomingSession,
} from "@/lib/gedu-upcoming-sessions";
import { OPEN_ENDED_OCCURRENCE_CAP } from "@/lib/session-occurrence";

/**
 * **What the Substitutions page's picker is a list of**: the sessions the
 * viewer holds a seat at and could still file an absence for.
 *
 * It is the app's one schedule expansion over the seat rows the page already
 * has, so what is worth pinning is not the walk — that has its own tests — but
 * the four decisions made around it:
 *
 * - the **horizon**, which is not this module's own: it is the app's forward
 *   rule, an open-ended run projecting the shared next-eight and a dated one
 *   running to its end date;
 * - a **finished** session is not offered, which is the card's rule too;
 * - a **substitution** seat contributes the one afternoon it covers, because a
 *   sub asking for a sub is a case the write accepts;
 * - **one row per (group, date)**, which is the session's unique key in
 *   Postgres — two slots on one day are one session, not two writes.
 */

const TIME_ZONE = "Europe/Helsinki";
/** Tuesday 17 March 2026, 11:00 in Helsinki. */
const NOW = new Date("2026-03-17T09:00:00.000Z");

function row(overrides: {
  productId: string;
  groupId: string;
  slots: GeduAssignmentRow["slots"];
  kind?: GeduAssignmentRow["kind"];
  substitutionDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isRemote?: boolean;
}): GeduAssignmentRow {
  return {
    product: {
      id: overrides.productId,
      timezone: TIME_ZONE,
      startDate: overrides.startDate ?? "2026-01-05",
      endDate: overrides.endDate ?? null,
      isRemote: overrides.isRemote ?? true,
      productType: "consumer_club",
      translations: [
        {
          locale: "en",
          name: `Product ${overrides.productId}`,
          description: "",
        },
      ],
    },
    groupId: overrides.groupId,
    kind: overrides.kind ?? "assignment",
    substitutionDate: overrides.substitutionDate ?? null,
    slots: overrides.slots,
    groupCount: 1,
    participantCount: 8,
    groupName: `Group ${overrides.groupId}`,
    groupParticipantCount: 8,
    siteName: null,
  };
}

/** Weekly on the given weekday (0 = Monday), in the product's own zone. */
function weekly(weekday: number, startTime: string, durationMinutes = 90) {
  return [{ weekday, startTime, durationMinutes }];
}

describe("the gedu's own upcoming sessions", () => {
  it("projects an open-ended run to the shared next-eight and no further", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [row({ productId: "p", groupId: "g", slots: weekly(0, "17:00") })],
      locale: "en",
      now: NOW,
    });
    // The number is the app's, imported rather than restated — a second copy
    // of it here would let the picker and the feed drift apart quietly.
    expect(sessions).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
  });

  it("projects a dated run to its end date, however far that is", () => {
    // Six Mondays to the end date, which is more than the open-ended cap
    // would have allowed and fewer than an unbounded walk would emit.
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({
          productId: "p",
          groupId: "g",
          slots: weekly(0, "17:00"),
          endDate: "2026-04-27",
        }),
      ],
      locale: "en",
      now: NOW,
    });
    expect(sessions.map((session) => session.sessionDate)).toEqual([
      "2026-03-23",
      "2026-03-30",
      "2026-04-06",
      "2026-04-13",
      "2026-04-20",
      "2026-04-27",
    ]);
  });

  it("applies each seat's own rule when a gedu holds both kinds", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({ productId: "open", groupId: "gopen", slots: weekly(0, "17:00") }),
        row({
          productId: "dated",
          groupId: "gdated",
          slots: weekly(1, "17:00"),
          endDate: "2026-03-31",
        }),
      ],
      locale: "en",
      now: NOW,
    });
    const byGroup = (groupId: string) =>
      sessions.filter((session) => session.groupId === groupId);
    expect(byGroup("gopen")).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
    // Today's own session is still running at NOW, so the dated run has this
    // Tuesday, the next two, and then its end date stops it.
    expect(byGroup("gdated").map((session) => session.sessionDate)).toEqual([
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
    ]);
  });

  it("offers the session in progress and never one that has finished", () => {
    // Tuesday is weekday 1, and `NOW` is 11:00 in Helsinki: one slot ends at
    // 10:30 and one is running.
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({ productId: "done", groupId: "gdone", slots: weekly(1, "09:00", 90) }),
        row({ productId: "live", groupId: "glive", slots: weekly(1, "10:30", 90) }),
      ],
      locale: "en",
      now: NOW,
    });

    const today = sessions.filter(
      (session) => session.sessionDate === "2026-03-17",
    );
    expect(today.map((session) => session.groupId)).toEqual(["glive"]);
  });

  it("takes a run's own end date as the nearer bound", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({
          productId: "camp",
          groupId: "gcamp",
          slots: weekly(1, "17:00"),
          endDate: "2026-03-24",
        }),
      ],
      locale: "en",
      now: NOW,
    });
    expect(sessions.map((session) => session.sessionDate)).toEqual([
      "2026-03-17",
      "2026-03-24",
    ]);
  });

  it("gives a substitution seat its one afternoon and nothing else", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({
          productId: "sub",
          groupId: "gsub",
          kind: "substitution",
          substitutionDate: "2026-03-24",
          slots: weekly(1, "17:00"),
        }),
      ],
      locale: "en",
      now: NOW,
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionDate).toBe("2026-03-24");
  });

  it("drops a substitution on a date the schedule no longer projects", () => {
    // The row says Wednesday; the schedule only names Tuesdays. Such a seat is
    // orphaned, and the write would be refused for it.
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({
          productId: "orphan",
          groupId: "gorphan",
          kind: "substitution",
          substitutionDate: "2026-03-25",
          slots: weekly(1, "17:00"),
        }),
      ],
      locale: "en",
      now: NOW,
    });
    expect(sessions).toEqual([]);
  });

  it("emits one entry per (group, date), earliest slot winning", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({
          productId: "camp",
          groupId: "gcamp",
          // A morning block and an afternoon block on the same weekday: one
          // session as far as the database is concerned.
          slots: [
            { weekday: 1, startTime: "13:00", durationMinutes: 120 },
            { weekday: 1, startTime: "09:30", durationMinutes: 120 },
          ],
          endDate: "2026-03-17",
        }),
      ],
      locale: "en",
      now: new Date("2026-03-17T06:00:00.000Z"),
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].key).toBe("gcamp:2026-03-17");
    expect(sessions[0].startsAt.toISOString()).toBe("2026-03-17T07:30:00.000Z");
  });

  it("orders every seat's sessions together, soonest first", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [
        row({ productId: "thu", groupId: "gthu", slots: weekly(3, "17:00") }),
        row({ productId: "wed", groupId: "gwed", slots: weekly(2, "17:00") }),
      ],
      locale: "en",
      now: NOW,
    });
    const starts = sessions.map((session) => session.startsAt.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(sessions[0].groupId).toBe("gwed");
  });
});

/**
 * ============================================================================
 * Weeks
 * ============================================================================
 *
 * Five weekly clubs over a term is sixty-odd rows, so the list is grouped by
 * week and opens on the two that hold almost every absence. Three things here
 * are decisions rather than consequences, and none of them is visible from the
 * component:
 *
 * - **the week is the viewer's**, so a session at 23:30 on a Sunday belongs to
 *   the week that Sunday ends and one at 00:30 on the Monday to the next;
 * - **a week is found by bare-date arithmetic**, which is exact across the two
 *   transition weekends a zoned 168-hour step gets wrong;
 * - **the opening weeks are this one and the next**, unless neither has
 *   anything — a term that starts in a fortnight opens on its first two weeks
 *   rather than on nothing.
 */
const HELSINKI = "Europe/Helsinki";

function session(key: string, startsAt: string): GeduUpcomingSession {
  const start = new Date(startsAt);
  return {
    key,
    groupId: `group-${key}`,
    sessionDate: key,
    startsAt: start,
    endsAt: new Date(start.getTime() + 90 * 60_000),
    timezone: HELSINKI,
    productId: `product-${key}`,
    productName: `Product ${key}`,
    productType: "consumer_club",
    groupName: "A",
    isRemote: true,
    siteName: null,
  };
}

describe("the week a session falls in", () => {
  it("is the one the viewer is living in, not UTC's", () => {
    // 22:30 UTC on Sunday 22 March is 00:30 on Monday the 23rd in Helsinki, so
    // for a Helsinki reader this session is next week's and for a UTC one it
    // is this week's.
    expect(viewerWeekStart(new Date("2026-03-22T22:30:00Z"), HELSINKI)).toBe(
      "2026-03-23",
    );
    expect(viewerWeekStart(new Date("2026-03-22T22:30:00Z"), "UTC")).toBe(
      "2026-03-16",
    );
  });

  it("puts a late Sunday and an early Monday in different weeks", () => {
    expect(viewerWeekStart(new Date("2026-03-22T21:30:00Z"), HELSINKI)).toBe(
      "2026-03-16",
    );
    expect(viewerWeekStart(new Date("2026-03-23T04:30:00Z"), HELSINKI)).toBe(
      "2026-03-23",
    );
  });

  it("is exact across the weekend the clocks go forward", () => {
    // Helsinki springs forward at 03:00 on Sunday 29 March 2026, so that week
    // is 167 hours long — which is what a flat seven-day instant step gets
    // wrong and bare-date arithmetic cannot.
    expect(viewerWeekStart(new Date("2026-03-28T10:00:00Z"), HELSINKI)).toBe(
      "2026-03-23",
    );
    expect(viewerWeekStart(new Date("2026-03-30T10:00:00Z"), HELSINKI)).toBe(
      "2026-03-30",
    );
  });
});

describe("grouping the list into weeks", () => {
  it("keeps the order and renders no empty week", () => {
    const weeks = groupSessionsByWeek(
      [
        session("a", "2026-03-17T15:00:00Z"),
        session("b", "2026-03-19T15:00:00Z"),
        // Nothing at all in the week of the 23rd — that week is simply absent
        // rather than a heading standing over no rows.
        session("c", "2026-03-31T15:00:00Z"),
      ],
      HELSINKI,
    );
    expect(weeks.map((week) => week.weekStart)).toEqual([
      "2026-03-16",
      "2026-03-30",
    ]);
    expect(weeks[0].sessions.map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("opens on this week and next", () => {
    const weeks = groupSessionsByWeek(
      [
        session("a", "2026-03-19T15:00:00Z"),
        session("b", "2026-03-24T15:00:00Z"),
        session("c", "2026-03-31T15:00:00Z"),
      ],
      HELSINKI,
    );
    expect(initiallyShownWeeks(weeks, NOW, HELSINKI)).toEqual([
      "2026-03-16",
      "2026-03-23",
    ]);
  });

  it("opens on the first two weeks that have anything when those are empty", () => {
    const weeks = groupSessionsByWeek(
      [
        session("a", "2026-04-07T15:00:00Z"),
        session("b", "2026-04-14T15:00:00Z"),
        session("c", "2026-04-21T15:00:00Z"),
      ],
      HELSINKI,
    );
    expect(initiallyShownWeeks(weeks, NOW, HELSINKI)).toEqual([
      "2026-04-06",
      "2026-04-13",
    ]);
  });

  it("names the three kinds of week", () => {
    expect(weekHeadingKind("2026-03-16", NOW, HELSINKI)).toBe("this");
    expect(weekHeadingKind("2026-03-23", NOW, HELSINKI)).toBe("next");
    expect(weekHeadingKind("2026-03-30", NOW, HELSINKI)).toBe("later");
  });
});
