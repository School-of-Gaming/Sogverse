import { describe, expect, it } from "vitest";
import type { GeduAssignmentRow } from "@/lib/gedu-assignment-rollup";
import {
  GEDU_UPCOMING_SESSION_HORIZON_DAYS,
  buildGeduUpcomingSessions,
} from "@/lib/gedu-upcoming-sessions";

/**
 * **What the Substitutions page's picker is a list of**: the sessions the
 * viewer holds a seat at and could still file an absence for.
 *
 * It is the app's one schedule expansion over the seat rows the page already
 * has, so what is worth pinning is not the walk — that has its own tests — but
 * the four decisions made around it:
 *
 * - the **horizon**, which is the pool's own sixty-day window, because an
 *   absence filed beyond it would sit in a queue nobody can see;
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
  it("stops at the horizon the pool's own window stops at", () => {
    const sessions = buildGeduUpcomingSessions({
      rows: [row({ productId: "p", groupId: "g", slots: weekly(0, "17:00") })],
      locale: "en",
      now: NOW,
    });

    const horizon =
      NOW.getTime() + GEDU_UPCOMING_SESSION_HORIZON_DAYS * 24 * 60 * 60 * 1000;
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session.startsAt.getTime()).toBeLessThanOrEqual(horizon);
    }
    // Weekly, so the count is the window in weeks — and one more or one fewer
    // depending on where `now` falls inside the week.
    expect(sessions.length).toBeLessThanOrEqual(
      Math.ceil(GEDU_UPCOMING_SESSION_HORIZON_DAYS / 7) + 1,
    );
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
