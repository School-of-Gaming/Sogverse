import { describe, expect, it } from "vitest";
import {
  GEDU_ACTIVITY_TYPE_ORDER,
  assignmentEndedOn,
  assignmentLiveness,
  geduActivityTypeOf,
  groupAssignmentsByType,
  rollUpGeduAssignments,
  type GeduAssignmentRow,
} from "@/lib/gedu-assignment-rollup";
import { Constants } from "@/types/database.types";
import type { ProductType } from "@/types";

/**
 * The roll-up is what replaced the dashboard's per-occurrence enumeration, so
 * the things worth pinning are that it emits exactly one row per assignment,
 * that "next session" survives the in-progress case, and that the ordering puts
 * an imminent session at the top where a gedu will look for it.
 */

const TZ = "Europe/Helsinki";

function row(over: {
  id: string;
  name: string;
  /** 0 = Monday, matching the schedule_slots convention. */
  weekday?: number;
  startTime?: string;
  durationMinutes?: number;
  startDate?: string | null;
  endDate?: string | null;
  isRemote?: boolean;
  siteName?: string | null;
  slots?: GeduAssignmentRow["slots"];
}): GeduAssignmentRow {
  return {
    product: {
      id: over.id,
      timezone: TZ,
      startDate: over.startDate ?? "2025-01-06",
      endDate: over.endDate ?? null,
      padletUrl: null,
      isRemote: over.isRemote ?? true,
      productType: "consumer_club",
      translations: [{ locale: "en", name: over.name, description: "" }],
    },
    groupId: `${over.id}-group`,
    groupCount: 2,
    gamerCount: 14,
    groupName: `${over.name} A`,
    groupGamerCount: 7,
    siteName: over.siteName ?? null,
    slots:
      over.slots ??
      [
        {
          weekday: over.weekday ?? 0,
          startTime: over.startTime ?? "16:30",
          durationMinutes: over.durationMinutes ?? 90,
        },
      ],
  };
}

function rollUp(
  rows: GeduAssignmentRow[],
  now: Date,
  extra: Partial<Parameters<typeof rollUpGeduAssignments>[0]> = {},
) {
  return rollUpGeduAssignments({
    rows,
    now,
    locale: "en",
    hrefByProductId: Object.fromEntries(
      rows.map((r) => [r.product.id, `/preview/gedu-product/${r.product.id}`]),
    ),
    ...extra,
  });
}

describe("rollUpGeduAssignments", () => {
  // Wednesday 11 Feb 2026, 11:00 Helsinki.
  const now = new Date("2026-02-11T09:00:00Z");

  it("emits exactly one summary per assignment, not one per occurrence", () => {
    // The whole point of the roll-up: a weekly club used to produce eight rows.
    const summaries = rollUp([row({ id: "p1", name: "Monday Club" })], now);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      productId: "p1",
      groupId: "p1-group",
      productName: "Monday Club",
      groupName: "Monday Club A",
      groupGamerCount: 7,
    });
  });

  it("collapses a five-slot camp week to one card", () => {
    const summaries = rollUp(
      [
        row({
          id: "camp",
          name: "Builders Camp",
          slots: [0, 1, 2, 3, 4].map((weekday) => ({
            weekday,
            startTime: "10:00",
            durationMinutes: 180,
          })),
          startDate: "2026-02-09",
          endDate: "2026-02-20",
        }),
      ],
      now,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].nextSessionStart).not.toBeNull();
  });

  it("carries the next occurrence, including one in progress right now", () => {
    // Wednesday 16:45 Helsinki, inside a 16:30–18:00 Wednesday slot.
    const midSession = new Date("2026-02-11T14:45:00Z");
    const summaries = rollUp(
      [row({ id: "p1", name: "Wednesday Club", weekday: 2 })],
      midSession,
    );
    const { nextSessionStart, nextSessionEnd } = summaries[0];
    expect(nextSessionStart).not.toBeNull();
    // The in-progress session is the soonest meaningful moment, so the card
    // shows it rather than skipping a week — and its window is open.
    expect(nextSessionStart!.getTime()).toBeLessThan(midSession.getTime());
    expect(assignmentLiveness(summaries[0], midSession)).toEqual({
      inProgress: true,
      voiceIsOpen: true,
    });
    // The end is what the card's start–end range label is built from, so a
    // summary that carried a start and no end would render half a line.
    expect(nextSessionEnd).not.toBeNull();
    expect(nextSessionEnd!.getTime() - nextSessionStart!.getTime()).toBe(
      90 * 60_000,
    );
    expect(nextSessionEnd!.getTime()).toBeGreaterThan(midSession.getTime());
  });

  it("carries the end of a session still ahead of us too", () => {
    // Nothing about the range label depends on the session having started.
    const summaries = rollUp(
      [
        row({
          id: "p1",
          name: "Friday Club",
          weekday: 4,
          durationMinutes: 120,
        }),
      ],
      now,
    );
    const { nextSessionStart, nextSessionEnd } = summaries[0];
    expect(nextSessionEnd).not.toBeNull();
    expect(nextSessionEnd!.getTime() - nextSessionStart!.getTime()).toBe(
      120 * 60_000,
    );
  });

  it("reports no next session once an end-dated product has finished", () => {
    const summaries = rollUp(
      [
        row({
          id: "over",
          name: "Finished Camp",
          startDate: "2025-06-02",
          endDate: "2025-06-13",
        }),
      ],
      now,
    );
    expect(summaries[0].nextSessionStart).toBeNull();
    expect(summaries[0].nextSessionEnd).toBeNull();
    expect(assignmentLiveness(summaries[0], now)).toEqual({
      inProgress: false,
      voiceIsOpen: false,
    });
    // …and that emptiness is explained rather than left as an anomaly: the card
    // reads the same last day back off the summary and says so.
    expect(assignmentEndedOn(summaries[0], now)).toBe("2025-06-13");
  });

  it("carries the product's last day and zone through to the card", () => {
    // The pair the ended test needs. Neither half answers it alone, so a
    // summary that dropped either would leave the card unable to ask.
    const summaries = rollUp(
      [row({ id: "camp", name: "Camp", endDate: "2026-06-13" })],
      now,
    );
    expect(summaries[0].endDate).toBe("2026-06-13");
    expect(summaries[0].timezone).toBe(TZ);
  });

  it("leaves an open-ended club with no last day at all", () => {
    const summaries = rollUp([row({ id: "p1", name: "Club" })], now);
    expect(summaries[0].endDate).toBeNull();
    expect(assignmentEndedOn(summaries[0], now)).toBeNull();
  });

  it("reports no next session for an assignment with no slots", () => {
    const summaries = rollUp(
      [row({ id: "empty", name: "Unscheduled Club", slots: [] })],
      now,
    );
    expect(summaries[0].nextSessionStart).toBeNull();
  });

  it("sorts by soonest next session ascending", () => {
    // Thursday before Friday before Monday, from a Wednesday.
    const summaries = rollUp(
      [
        row({ id: "mon", name: "Monday", weekday: 0 }),
        row({ id: "fri", name: "Friday", weekday: 4 }),
        row({ id: "thu", name: "Thursday", weekday: 3 }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["thu", "fri", "mon"]);
  });

  it("sinks assignments with nothing scheduled to the bottom", () => {
    const summaries = rollUp(
      [
        row({ id: "none", name: "Unscheduled", slots: [] }),
        row({ id: "mon", name: "Monday", weekday: 0 }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["mon", "none"]);
  });

  /**
   * A finished run has nothing to contribute to "what am I doing next", which is
   * the question this ordering answers — but it is not gone, because its
   * workspace is where the historic records live and an outstanding write-up on
   * it is still owed. So it is demoted, not dropped.
   */
  it("puts every ended assignment below every live one", () => {
    const summaries = rollUp(
      [
        row({
          id: "done",
          name: "Finished Camp",
          startDate: "2025-06-02",
          endDate: "2025-06-13",
        }),
        row({ id: "mon", name: "Monday", weekday: 0 }),
        row({ id: "thu", name: "Thursday", weekday: 3 }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["thu", "mon", "done"]);
  });

  it("sorts an ended assignment below even an unscheduled live one", () => {
    // "Nothing scheduled" is a gap somebody may still fill; "ended" never is.
    const summaries = rollUp(
      [
        row({
          id: "done",
          name: "Finished Camp",
          startDate: "2025-06-02",
          endDate: "2025-06-13",
        }),
        row({ id: "none", name: "Unscheduled", slots: [] }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["none", "done"]);
  });

  it("orders the ended run most-recently-ended first", () => {
    // Last term's club before the one from two years ago: the recent one is the
    // paperwork a gedu is still finishing, the old one is archive.
    const summaries = rollUp(
      [
        row({ id: "old", name: "Old", startDate: "2024-01-08", endDate: "2024-05-31" }),
        row({ id: "recent", name: "Recent", startDate: "2025-09-01", endDate: "2025-12-19" }),
        row({ id: "middle", name: "Middle", startDate: "2025-01-06", endDate: "2025-06-13" }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual([
      "recent",
      "middle",
      "old",
    ]);
  });

  it("breaks a same-day tie between two ended runs by name", () => {
    const summaries = rollUp(
      [
        row({ id: "b", name: "Bravo", startDate: "2025-01-06", endDate: "2025-06-13" }),
        row({ id: "a", name: "Alfa", startDate: "2025-01-06", endDate: "2025-06-13" }),
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["a", "b"]);
  });

  it("takes the attention count from the caller and defaults it to zero", () => {
    const summaries = rollUp(
      [row({ id: "p1", name: "A" }), row({ id: "p2", name: "B" })],
      now,
      { attentionByProductId: { p1: 3 } },
    );
    const byId = new Map(summaries.map((s) => [s.productId, s.attentionCount]));
    expect(byId.get("p1")).toBe(3);
    expect(byId.get("p2")).toBe(0);
  });

  it("hands a remote product the caller's own room href", () => {
    const summaries = rollUp(
      [row({ id: "p1", name: "Remote Club", isRemote: true })],
      now,
      { voiceHrefByProductId: { p1: "/voice/group/p1-group" } },
    );
    expect(summaries[0].hasVoiceRoom).toBe(true);
    expect(summaries[0].voiceHref).toBe("/voice/group/p1-group");
  });

  it("gives an in-person product an inert Join href", () => {
    const summaries = rollUp(
      [row({ id: "onsite", name: "Onsite Club", isRemote: false })],
      now,
      { voiceHrefByProductId: { onsite: "/voice/group/onsite-group" } },
    );
    expect(summaries[0].voiceHref).toBe("#");
  });

  it("falls back to an inert Join href when the caller supplies none", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].voiceHref).toBe("#");
  });

  it("uses the caller's per-product open href", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].openHref).toBe("/preview/gedu-product/p1");
  });

  /**
   * The footer's two answers to "where is this happening", and the invariant
   * that keeps a card from claiming both: a venue is carried only by a product
   * with no room, whatever the row underneath says.
   */
  it("carries an in-person product's venue through to the card", () => {
    const summaries = rollUp(
      [
        row({
          id: "onsite",
          name: "Onsite Camp",
          isRemote: false,
          siteName: "Sello Library, Espoo",
        }),
      ],
      now,
    );
    expect(summaries[0].hasVoiceRoom).toBe(false);
    expect(summaries[0].siteName).toBe("Sello Library, Espoo");
  });

  it("drops a venue from a remote product even when the row supplies one", () => {
    // A product with a voice room has no building, and a card showing both
    // would be claiming the group meets in two places at once.
    const summaries = rollUp(
      [
        row({
          id: "remote",
          name: "Remote Club",
          isRemote: true,
          siteName: "Sello Library, Espoo",
        }),
      ],
      now,
    );
    expect(summaries[0].hasVoiceRoom).toBe(true);
    expect(summaries[0].siteName).toBeNull();
  });

  it("leaves a venue null on an in-person product that has none recorded", () => {
    const summaries = rollUp(
      [row({ id: "onsite", name: "Onsite Camp", isRemote: false })],
      now,
    );
    expect(summaries[0].siteName).toBeNull();
  });
});

/**
 * Liveness is asked of the clock rather than baked into the summary, so that a
 * card's gradient, badge and Join button can never be answering two different
 * instants. These pin the three things that follow from that.
 */
describe("assignmentLiveness", () => {
  const start = new Date("2026-02-11T14:30:00Z");
  const end = new Date("2026-02-11T16:00:00Z");
  const remote = { nextSessionStart: start, nextSessionEnd: end, hasVoiceRoom: true };

  it("is quiet before the session, on both counts", () => {
    // Well before the window opens, not merely before the start.
    const early = new Date("2026-02-11T09:00:00Z");
    expect(assignmentLiveness(remote, early)).toEqual({
      inProgress: false,
      voiceIsOpen: false,
    });
  });

  it("reports in progress from the start instant onwards", () => {
    expect(assignmentLiveness(remote, start).inProgress).toBe(true);
    expect(
      assignmentLiveness(remote, new Date("2026-02-11T15:00:00Z")).inProgress,
    ).toBe(true);
  });

  it("never opens a window on a product with no room", () => {
    // Mid-session, which is exactly when a room would report itself open.
    const onsite = { ...remote, hasVoiceRoom: false };
    const midSession = new Date("2026-02-11T15:00:00Z");
    expect(assignmentLiveness(onsite, midSession)).toEqual({
      inProgress: true,
      voiceIsOpen: false,
    });
  });

  it("says nothing is happening when nothing is scheduled", () => {
    expect(
      assignmentLiveness(
        { nextSessionStart: null, nextSessionEnd: null, hasVoiceRoom: true },
        start,
      ),
    ).toEqual({ inProgress: false, voiceIsOpen: false });
  });
});

/**
 * Whether a run is over is the one thing standing between a card that reads as
 * history and a card that reads as a scheduling fault, and it turns on a
 * calendar date's day ending — which is a different instant in every zone. These
 * pin the boundary itself.
 */
describe("assignmentEndedOn", () => {
  const helsinki = (endDate: string | null) => ({
    endDate,
    timezone: "Europe/Helsinki",
    nextSessionStart: null,
  });

  it("says nothing about a run with no last day", () => {
    expect(
      assignmentEndedOn(helsinki(null), new Date("2026-02-11T09:00:00Z")),
    ).toBeNull();
  });

  it("keeps a run alive on its own last day, right to the end of it", () => {
    // 13 Jun 2025, 23:58 Helsinki — still the last day, so still running.
    expect(
      assignmentEndedOn(
        helsinki("2025-06-13"),
        new Date("2025-06-13T20:58:00Z"),
      ),
    ).toBeNull();
  });

  it("ends it once that day is over, and names the day", () => {
    // 14 Jun 2025, 00:02 Helsinki — one minute past.
    expect(
      assignmentEndedOn(
        helsinki("2025-06-13"),
        new Date("2025-06-13T21:02:00Z"),
      ),
    ).toBe("2025-06-13");
  });

  /**
   * The day ends where the schedule lives. A viewer somewhere else does not get
   * to retire a Helsinki club early or keep it alive late — otherwise the same
   * card would be history for one gedu and current for the gedu beside them.
   */
  it("ends the day in the product's zone, not the viewer's", () => {
    // 13 Jun 2025 22:30 UTC: already the 14th in Helsinki (UTC+3), still the
    // 13th in New York. The Helsinki product is over; the New York one is not.
    const instant = new Date("2025-06-13T22:30:00Z");
    expect(assignmentEndedOn(helsinki("2025-06-13"), instant)).toBe("2025-06-13");
    expect(
      assignmentEndedOn(
        {
          endDate: "2025-06-13",
          timezone: "America/New_York",
          nextSessionStart: null,
        },
        instant,
      ),
    ).toBeNull();
  });

  /**
   * The one case the date test alone gets wrong: a session that starts on the
   * final day and is still running after that day's midnight. The run is past
   * its end date and demonstrably not over, and a card calling it history would
   * be withholding the Join from a session somebody is sitting in.
   */
  it("is not over while one of its own sessions is still in flight", () => {
    expect(
      assignmentEndedOn(
        {
          endDate: "2025-06-13",
          timezone: "Europe/Helsinki",
          nextSessionStart: new Date("2025-06-13T20:00:00Z"),
        },
        new Date("2025-06-13T21:10:00Z"),
      ),
    ).toBeNull();
  });
});

/**
 * The dashboard stopped having one umbrella heading and now renders one section
 * per type noun. Which sections exist, and in what order, is entirely this
 * function's answer — so an empty group leaking through would put a heading on
 * the page with nothing under it, and a reordering would move a gedu's clubs
 * below their events between two deploys.
 */
describe("geduActivityTypeOf", () => {
  it("folds both club types into one noun", () => {
    // A gedu standing in the room cannot tell a consumer club from a
    // municipality one, and has no reason to: the difference is who pays.
    expect(geduActivityTypeOf("consumer_club")).toBe("club");
    expect(geduActivityTypeOf("municipality_club")).toBe("club");
  });

  it("maps the other two product types to themselves", () => {
    expect(geduActivityTypeOf("camp")).toBe("camp");
    expect(geduActivityTypeOf("event")).toBe("event");
  });

  it("covers every product type the schema can produce", () => {
    // Derived from the generated enum rather than a hand-kept list, so a fifth
    // product type fails here instead of silently falling out of the dashboard.
    for (const type of Constants.public.Enums.product_type) {
      expect(GEDU_ACTIVITY_TYPE_ORDER, type).toContain(geduActivityTypeOf(type));
    }
  });
});

describe("groupAssignmentsByType", () => {
  const typed = (id: string, productType: ProductType) => ({ id, productType });
  const typeOf = (item: { productType: ProductType }) => item.productType;

  it("emits clubs, then camps, then events", () => {
    const groups = groupAssignmentsByType(
      [typed("e", "event"), typed("c", "camp"), typed("k", "consumer_club")],
      typeOf,
    );
    expect(groups.map((g) => g.type)).toEqual(["club", "camp", "event"]);
  });

  it("skips the nouns a gedu does not run rather than emitting empties", () => {
    // An empty heading on a personal dashboard reads as something missing; a
    // club gedu should never learn that events exist.
    const groups = groupAssignmentsByType(
      [typed("k1", "consumer_club"), typed("k2", "municipality_club")],
      typeOf,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("club");
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
  });

  it("preserves the caller's order inside each group", () => {
    // The roll-up already sorted soonest-first; regrouping must not reshuffle.
    const groups = groupAssignmentsByType(
      [
        typed("k1", "consumer_club"),
        typed("c1", "camp"),
        typed("k2", "consumer_club"),
        typed("c2", "camp"),
      ],
      typeOf,
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("returns nothing at all for a gedu with no assignments", () => {
    expect(groupAssignmentsByType([], typeOf)).toEqual([]);
  });
});
