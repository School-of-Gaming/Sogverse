import { describe, it, expect } from "vitest";
import { buildAdminSubstitutionsData } from "@/components/admin/substitutions/build-admin-substitutions-data";
import type {
  AdminOpenSubstitutionRequest,
  AdminResolvedSubstitution,
  AdminSubstitutionQueue,
} from "@/services/session-substitution";

/**
 * The Substitutions page's mapping: the four claims the page's whole reading
 * order rests on.
 *
 * 1. **Soonest session first, not the read's order.** The read orders by
 *    calendar date because a date is all SQL has — no instant travels on this
 *    surface — so two products meeting the same day in two zones arrive in an
 *    order that says nothing about which starts first.
 * 2. **Urgent is a fact about the page's pinned clock**, decided here so no
 *    component re-derives "soon" from the same two values and disagrees.
 * 3. **An orphan sorts on its date and keeps its row.** A request whose weekday
 *    the schedule no longer names has no start; it still has a day, and it is
 *    still work.
 * 4. **The zone line is about this document**, present only where something
 *    actually converted.
 *
 * Everything is pinned to a fixed instant — the mapping takes `now` as an
 * argument, so there is no clock to control and nothing to leak between cases.
 */

const NOW = new Date("2026-08-17T09:20:00+03:00");
const VIEWER_ZONE = "Europe/Helsinki";

const REQUESTER = "dc5d2ed1-5498-450a-8db1-dad9701d10cd";
const SUBSTITUTE = "ea0111ac-09ed-438c-85ef-f9f138b00209";

/** 0 = Monday, the app's own convention. */
const MON = 0;

function product(args: {
  id: string;
  timezone: string;
  slots: readonly { weekday: number; startTime: string }[];
}): AdminOpenSubstitutionRequest["product"] {
  return {
    id: args.id,
    product_type: "consumer_club",
    timezone: args.timezone,
    is_remote: true,
    translations: [{ locale: "en", name: `Club ${args.id}` }],
    schedule_slots: args.slots.map((slot) => ({
      weekday: slot.weekday,
      start_time: slot.startTime,
      duration_minutes: 60,
    })),
  };
}

function openRequest(args: {
  id: string;
  sessionDate: string;
  product: AdminOpenSubstitutionRequest["product"];
}): AdminOpenSubstitutionRequest {
  return {
    id: args.id,
    group_id: `group-${args.id}`,
    group_name: `Group ${args.id}`,
    session_date: args.sessionDate,
    role: "primary",
    reason: "sick",
    reason_note: null,
    created_at: "2026-08-16T20:00:00+03:00",
    requested_by: REQUESTER,
    requested_by_first_name: "Milo",
    requested_by_last_name: "Korhonen",
    product: args.product,
    offers: [],
  };
}

function build(queue: AdminSubstitutionQueue, now = NOW) {
  return buildAdminSubstitutionsData({
    queue,
    locale: "en",
    viewerTimeZone: VIEWER_ZONE,
    now,
  });
}

const HELSINKI_EVENING = product({
  id: "helsinki",
  timezone: "Europe/Helsinki",
  slots: [{ weekday: MON, startTime: "17:00" }],
});

/** 15:00 in Stockholm is 16:00 in Helsinki — an hour before the club above. */
const STOCKHOLM_AFTERNOON = product({
  id: "stockholm",
  timezone: "Europe/Stockholm",
  slots: [{ weekday: MON, startTime: "15:00" }],
});

describe("the admin Substitutions mapping", () => {
  it("orders by the session's own start, not by the date the read delivered", () => {
    const data = build({
      // As the read delivers them: same date, ordered by product id, which says
      // nothing at all about which of the two starts first.
      open: [
        openRequest({
          id: "helsinki",
          sessionDate: "2026-08-17",
          product: HELSINKI_EVENING,
        }),
        openRequest({
          id: "stockholm",
          sessionDate: "2026-08-17",
          product: STOCKHOLM_AFTERNOON,
        }),
      ],
      recent: [],
    });

    expect(data.open.map((request) => request.id)).toEqual([
      "stockholm",
      "helsinki",
    ]);
  });

  it("keeps the read's order between two rows that start at the same moment", () => {
    const twin = (id: string) =>
      openRequest({
        id,
        sessionDate: "2026-08-17",
        product: product({
          id,
          timezone: "Europe/Helsinki",
          slots: [{ weekday: MON, startTime: "17:00" }],
        }),
      });

    const data = build({
      open: [twin("first"), twin("second"), twin("third")],
      recent: [],
    });

    // A stable sort is what makes a tie mean "the read decided", which is what
    // stops the list reshuffling between two renders of one document.
    expect(data.open.map((request) => request.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("sorts a request the schedule no longer projects among its own day", () => {
    // A Wednesday on a club that meets Mondays: no slot names the weekday, so
    // there is no start — and the row is still work an admin has to clear.
    const orphan = openRequest({
      id: "orphan",
      sessionDate: "2026-08-19",
      product: HELSINKI_EVENING,
    });
    const before = openRequest({
      id: "before",
      sessionDate: "2026-08-17",
      product: HELSINKI_EVENING,
    });
    const after = openRequest({
      id: "after",
      sessionDate: "2026-08-24",
      product: HELSINKI_EVENING,
    });

    const data = build({ open: [after, orphan, before], recent: [] });

    expect(data.open.map((request) => request.id)).toEqual([
      "before",
      "orphan",
      "after",
    ]);
    const mapped = data.open[1];
    expect(mapped.startsAt).toBeNull();
    expect(mapped.sessionTime).toBeNull();
    // No start means no claim about how soon it is, so it is never urgent.
    expect(mapped.urgent).toBe(false);
  });

  it("marks a session starting inside the day, and only one that has not begun", () => {
    const data = build({
      open: [
        // 17:00 today, about eight hours out.
        openRequest({
          id: "today",
          sessionDate: "2026-08-17",
          product: HELSINKI_EVENING,
        }),
        // 17:00 next Monday, a week out.
        openRequest({
          id: "next-week",
          sessionDate: "2026-08-24",
          product: HELSINKI_EVENING,
        }),
      ],
      recent: [],
    });

    expect(
      data.open.map((request) => [request.id, request.urgent]),
    ).toEqual([
      ["today", true],
      ["next-week", false],
    ]);

    // Half past five: today's session has begun, and an admin cannot staff a
    // session that is already running — so the tint goes out rather than
    // shouting about the past.
    const later = build(
      {
        open: [
          openRequest({
            id: "today",
            sessionDate: "2026-08-17",
            product: HELSINKI_EVENING,
          }),
        ],
        recent: [],
      },
      new Date("2026-08-17T17:30:00+03:00"),
    );
    expect(later.open[0].urgent).toBe(false);
  });

  it("states the session's clock face in the viewer's zone", () => {
    const data = build({
      open: [
        openRequest({
          id: "stockholm",
          sessionDate: "2026-08-17",
          product: STOCKHOLM_AFTERNOON,
        }),
      ],
      recent: [],
    });

    // Authored at 15:00 in Stockholm, read at 16:00 in Helsinki.
    expect(data.open[0].sessionTime).toBe("16:00–17:00");
  });

  it("names the viewer's zone only where something converted", () => {
    const home = build({
      open: [
        openRequest({
          id: "helsinki",
          sessionDate: "2026-08-17",
          product: HELSINKI_EVENING,
        }),
      ],
      recent: [],
    });
    expect(home.timeZoneAbbrev).toBeNull();

    const away = build({
      open: [
        openRequest({
          id: "stockholm",
          sessionDate: "2026-08-17",
          product: STOCKHOLM_AFTERNOON,
        }),
      ],
      recent: [],
    });
    expect(away.timeZoneAbbrev).toBeTruthy();
  });

  it("carries a settled request's substitute, and leaves a withdrawal without one", () => {
    const base: Omit<
      AdminResolvedSubstitution,
      "id" | "status" | "substitute_id" | "substitute_first_name" | "substitute_last_name"
    > = {
      group_id: "group-a",
      group_name: "Group A",
      session_date: "2026-08-10",
      role: "primary",
      reason: "sick",
      reason_note: null,
      created_at: "2026-08-09T19:00:00+03:00",
      approved_at: "2026-08-10T08:00:00+03:00",
      requested_by: REQUESTER,
      requested_by_first_name: "Milo",
      requested_by_last_name: "Korhonen",
      product: HELSINKI_EVENING,
    };

    const data = build({
      open: [],
      recent: [
        {
          ...base,
          id: "stood-in",
          status: "substituted",
          substitute_id: SUBSTITUTE,
          substitute_first_name: "Saana",
          substitute_last_name: "Nieminen",
        },
        {
          ...base,
          id: "withdrawn",
          status: "withdrawn",
          approved_at: null,
          substitute_id: null,
          substitute_first_name: null,
          substitute_last_name: null,
        },
      ],
    });

    // Delivered newest-session-first by the read, and not re-sorted here: both
    // rows are on one date, so the read's order is the order.
    expect(data.recent.map((row) => row.substituteName)).toEqual([
      "Saana Nieminen",
      null,
    ]);
    expect(data.recent[0].substituteId).toBe(SUBSTITUTE);
    expect(data.recent[1].substituteId).toBeNull();
  });
});
