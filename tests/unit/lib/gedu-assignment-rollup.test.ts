import { describe, expect, it } from "vitest";
import {
  geduAssignmentKey,
  geduSubstitutionKey,
  rollUpGeduAssignments,
  rollUpGeduSubstitutions,
  type GeduAssignmentRow,
} from "@/lib/gedu-assignment-rollup";
// The roll-up's output is what the card asks its run-state questions of, so the
// two are exercised together here — the derivations' own boundaries are pinned
// beside them, in the shared module's test.
import { runEndedOn, runLiveness } from "@/lib/product-run";
import { INERT_HREF } from "@/lib/constants/routes";

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
      isRemote: over.isRemote ?? true,
      productType: "consumer_club",
      translations: [{ locale: "en", name: over.name, description: "" }],
    },
    groupId: `${over.id}-group`,
    // A standing assignment: the rollup this suite is about is the recurring
    // card's, and a live substitution is its own small card keyed to one date.
    kind: "assignment",
    substitutionDate: null,
    groupCount: 2,
    participantCount: 14,
    groupName: `${over.name} A`,
    groupParticipantCount: 7,
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
    hrefByAssignment: Object.fromEntries(
      rows.map((r) => [
        geduAssignmentKey(r.product.id, r.groupId),
        {
          pathname: "/preview/[surface]/[scenario]",
          params: { surface: "gedu-product", scenario: r.product.id },
        },
      ]),
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
      groupParticipantCount: 7,
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
    expect(runLiveness(summaries[0], midSession)).toEqual({
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
    expect(runLiveness(summaries[0], now)).toEqual({
      inProgress: false,
      voiceIsOpen: false,
    });
    // …and that emptiness is explained rather than left as an anomaly: the card
    // reads the same last day back off the summary and says so.
    expect(runEndedOn(summaries[0], now)).toBe("2025-06-13");
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
    expect(runEndedOn(summaries[0], now)).toBeNull();
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
      { attentionByAssignment: { [geduAssignmentKey("p1", "p1-group")]: 3 } },
    );
    const byId = new Map(summaries.map((s) => [s.productId, s.attentionCount]));
    expect(byId.get("p1")).toBe(3);
    expect(byId.get("p2")).toBe(0);
  });

  it("hands a remote product the caller's own room href", () => {
    const summaries = rollUp(
      [row({ id: "p1", name: "Remote Club", isRemote: true })],
      now,
      {
        voiceHrefByAssignment: {
          [geduAssignmentKey("p1", "p1-group")]: {
            pathname: "/voice/group/[id]",
            params: { id: "p1-group" },
          },
        },
      },
    );
    expect(summaries[0].hasVoiceRoom).toBe(true);
    expect(summaries[0].voiceHref).toEqual({
      pathname: "/voice/group/[id]",
      params: { id: "p1-group" },
    });
  });

  it("gives an in-person product an inert Join href", () => {
    const summaries = rollUp(
      [row({ id: "onsite", name: "Onsite Club", isRemote: false })],
      now,
      {
        voiceHrefByAssignment: {
          [geduAssignmentKey("onsite", "onsite-group")]: {
            pathname: "/voice/group/[id]",
            params: { id: "onsite-group" },
          },
        },
      },
    );
    expect(summaries[0].voiceHref).toBe(INERT_HREF);
  });

  it("falls back to an inert Join href when the caller supplies none", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].voiceHref).toBe(INERT_HREF);
  });

  it("uses the caller's per-product open href", () => {
    const summaries = rollUp([row({ id: "p1", name: "A" })], now);
    expect(summaries[0].openHref).toEqual({
      pathname: "/preview/[surface]/[scenario]",
      params: { surface: "gedu-product", scenario: "p1" },
    });
  });

  /**
   * The footer's two answers to "where is this happening", and the invariant
   * that keeps a card from claiming both: a site is carried only by a product
   * with no room, whatever the row underneath says.
   */
  it("carries an in-person product's site through to the card", () => {
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

  it("drops a site from a remote product even when the row supplies one", () => {
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

  it("leaves a site null on an in-person product that has none recorded", () => {
    const summaries = rollUp(
      [row({ id: "onsite", name: "Onsite Camp", isRemote: false })],
      now,
    );
    expect(summaries[0].siteName).toBeNull();
  });

  /**
   * **The key moved from product to (product, group), and a substitution is why.**
   *
   * A gedu holds at most one assignment per product, which is what made a
   * product id look like a key. It stops being one the moment the same gedu can
   * also substitute on a *sibling* group of that product: under a product key the two
   * seats share a badge count, a workspace link and a voice room, and whichever
   * the caller wrote last wins.
   */
  it("keys per-seat facts by (product, group), not by product", () => {
    const mine = row({ id: "p1", name: "Club" });
    const sibling: GeduAssignmentRow = {
      ...row({ id: "p1", name: "Club" }),
      groupId: "p1-group-b",
    };

    const summaries = rollUpGeduAssignments({
      rows: [mine, sibling],
      now,
      locale: "en",
      attentionByAssignment: {
        [geduAssignmentKey("p1", "p1-group")]: 3,
        [geduAssignmentKey("p1", "p1-group-b")]: 0,
      },
      hrefByAssignment: {
        [geduAssignmentKey("p1", "p1-group")]: {
          pathname: "/gedu/clubs/[id]",
          params: { id: "p1" },
        },
        [geduAssignmentKey("p1", "p1-group-b")]: {
          pathname: "/gedu/clubs/[id]",
          params: { id: "p1" },
        },
      },
      voiceHrefByAssignment: {
        [geduAssignmentKey("p1", "p1-group")]: {
          pathname: "/voice/group/[id]",
          params: { id: "p1-group" },
        },
        [geduAssignmentKey("p1", "p1-group-b")]: {
          pathname: "/voice/group/[id]",
          params: { id: "p1-group-b" },
        },
      },
    });

    const byGroup = new Map(summaries.map((s) => [s.groupId, s]));
    expect(byGroup.get("p1-group")?.attentionCount).toBe(3);
    expect(byGroup.get("p1-group-b")?.attentionCount).toBe(0);
    // The room is the group's, so the two seats must never land in one.
    expect(byGroup.get("p1-group")?.voiceHref).toEqual({
      pathname: "/voice/group/[id]",
      params: { id: "p1-group" },
    });
    expect(byGroup.get("p1-group-b")?.voiceHref).toEqual({
      pathname: "/voice/group/[id]",
      params: { id: "p1-group-b" },
    });
  });

  it("ignores substitution rows — a substitution is one afternoon, not a run", () => {
    const summaries = rollUp(
      [
        row({ id: "p1", name: "Club" }),
        { ...row({ id: "p2", name: "Substituted Club" }), kind: "substitution" as const, substitutionDate: "2026-02-16" },
      ],
      now,
    );
    expect(summaries.map((s) => s.productId)).toEqual(["p1"]);
  });
});

/**
 * ============================================================================
 * The substitution roll-up
 * ============================================================================
 *
 * A substitution is one dated afternoon, so what has to hold is the opposite of the
 * assignment roll-up's contract: no schedule walk, no run state, one card per
 * substitution date, and a workspace link that names the group — because a sub has
 * no assignment row for one to be resolved from.
 */
describe("rollUpGeduSubstitutions", () => {
  // No clock: the database decides how long a substitution card lasts (the access
  // window), so this roll-up takes no `now` and there is none to pin here.

  function substitutionRow(over: {
    id: string;
    name: string;
    groupId?: string;
    substitutionDate: string;
    isRemote?: boolean;
    siteName?: string | null;
    weekday?: number;
    /** The PRODUCT's zone — every instant on the card is derived in it. */
    timezone?: string;
  }): GeduAssignmentRow {
    const base = row({
      id: over.id,
      name: over.name,
      weekday: over.weekday ?? 0,
      isRemote: over.isRemote ?? true,
      siteName: over.siteName ?? null,
    });
    return {
      ...base,
      product: { ...base.product, timezone: over.timezone ?? base.product.timezone },
      groupId: over.groupId ?? `${over.id}-group`,
      kind: "substitution",
      substitutionDate: over.substitutionDate,
    };
  }

  function rollUpSubstitutions(
    rows: GeduAssignmentRow[],
    extra: Partial<Parameters<typeof rollUpGeduSubstitutions>[0]> = {},
  ) {
    return rollUpGeduSubstitutions({
      rows,
      locale: "en",
      hrefByAssignment: Object.fromEntries(
        rows.map((r) => [
          geduAssignmentKey(r.product.id, r.groupId),
          { pathname: "/gedu/clubs/[id]", params: { id: r.product.id } },
        ]),
      ),
      ...extra,
    });
  }

  it("emits one card per substitution date and skips assignment rows", () => {
    const substitutions = rollUpSubstitutions([
      row({ id: "mine", name: "My Club" }),
      // 16 Feb 2026 is a Monday, which is the weekday `row` slots by default.
      substitutionRow({ id: "p1", name: "Substituted Club", substitutionDate: "2026-02-16" }),
      substitutionRow({
        id: "p1",
        name: "Substituted Club",
        groupId: "p1-group-b",
        substitutionDate: "2026-02-23",
      }),
    ]);
    expect(substitutions).toHaveLength(2);
    expect(substitutions.map((c) => c.substitutionDate)).toEqual([
      "2026-02-16",
      "2026-02-23",
    ]);
  });

  it("resolves the substituted session's instants from the date and the slots", () => {
    const [substitution] = rollUpSubstitutions([
      substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-16" }),
    ]);
    // 16:30 Helsinki on 16 Feb is 14:30 UTC; the slot runs 90 minutes.
    expect(substitution.startsAt?.toISOString()).toBe("2026-02-16T14:30:00.000Z");
    expect(substitution.endsAt?.toISOString()).toBe("2026-02-16T16:00:00.000Z");
  });

  it("opens the workspace 48 hours before the substituted session's own start", () => {
    // Not 48 hours before the substituted DAY: the card has to name the instant the
    // database's own gates open, and those count back from the session's start.
    const [substitution] = rollUpSubstitutions([
      substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-16" }),
    ]);
    expect(substitution.accessOpensAt.toISOString()).toBe("2026-02-14T14:30:00.000Z");
    expect(
      substitution.startsAt!.getTime() - substitution.accessOpensAt.getTime(),
    ).toBe(48 * 60 * 60 * 1000);
  });

  it("counts an orphaned date back from product-local midnight, as the SQL does", () => {
    // A Tuesday on a Monday club: there is no session start to count back from,
    // so the predicate's own COALESCE falls to product-local midnight of the
    // substitution date. 17 Feb 2026 00:00 Helsinki is 16 Feb 22:00 UTC, and 48
    // hours before that is 14 Feb 22:00 UTC. Reading the missing start as "no
    // lock at all" was the defect: it drew an unlocked, linked card for a
    // workspace every gate behind it still refuses.
    const [substitution] = rollUpSubstitutions([
      substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-17" }),
    ]);
    expect(substitution.startsAt).toBeNull();
    expect(substitution.accessOpensAt.toISOString()).toBe("2026-02-14T22:00:00.000Z");
  });

  it("takes that midnight in the PRODUCT's zone, not the runtime's", () => {
    // The same orphaned Tuesday on a Los Angeles club. Midnight there is ten
    // hours later than midnight in Helsinki, so a fallback resolved in the
    // wrong zone unlocks most of a day early — and the whole point of the lock
    // is that the card and the database agree to the minute.
    const [substitution] = rollUpSubstitutions([
      substitutionRow({
        id: "p1",
        name: "Club",
        substitutionDate: "2026-02-17",
        timezone: "America/Los_Angeles",
      }),
    ]);
    expect(substitution.accessOpensAt.toISOString()).toBe("2026-02-15T08:00:00.000Z");
  });

  it("subtracts the 48 hours on the instant across a DST transition", () => {
    // 30 March 2026 is the Monday after Europe's spring-forward, and the club
    // meets on Wednesdays — so the date is an orphan whose local midnight falls
    // in EEST (+3) while the instant 48 hours earlier is still in EET (+2).
    // Stepping the calendar two days and taking midnight again would land an
    // hour out; subtracting on the instant cannot.
    const [substitution] = rollUpSubstitutions([
      substitutionRow({
        id: "p1",
        name: "Club",
        substitutionDate: "2026-03-30",
        weekday: 2,
      }),
    ]);
    expect(substitution.startsAt).toBeNull();
    expect(substitution.accessOpensAt.toISOString()).toBe("2026-03-27T21:00:00.000Z");
  });

  it("carries a date the schedule no longer projects, with no instants", () => {
    // A Tuesday, on a club whose only slot is a Monday — an orphaned request,
    // which is history rather than a fault and must not take the card away.
    const [substitution] = rollUpSubstitutions([
      substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-17" }),
    ]);
    expect(substitution.substitutionDate).toBe("2026-02-17");
    expect(substitution.startsAt).toBeNull();
    expect(substitution.endsAt).toBeNull();
  });

  it("puts the group on the workspace link", () => {
    const [substitution] = rollUpSubstitutions([
      substitutionRow({
        id: "p1",
        name: "Club",
        groupId: "sibling-group",
        substitutionDate: "2026-02-16",
      }),
    ]);
    expect(substitution.openHref).toEqual({
      pathname: "/gedu/clubs/[id]",
      params: { id: "p1" },
      query: { groupId: "sibling-group" },
    });
  });

  it("keys the attention count by (group, substitution date)", () => {
    const substitutions = rollUpSubstitutions(
      [
        substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-16" }),
        substitutionRow({ id: "p1", name: "Club", substitutionDate: "2026-02-23" }),
      ],
      {
        attentionBySubstitution: {
          [geduSubstitutionKey("p1-group", "2026-02-16")]: 1,
        },
      },
    );
    const byDate = new Map(substitutions.map((c) => [c.substitutionDate, c.attentionCount]));
    expect(byDate.get("2026-02-16")).toBe(1);
    expect(byDate.get("2026-02-23")).toBe(0);
  });

  it("sorts soonest first and sinks an orphaned date to the foot", () => {
    const substitutions = rollUpSubstitutions([
      substitutionRow({ id: "c", name: "Later", substitutionDate: "2026-02-23" }),
      substitutionRow({ id: "b", name: "Orphan", substitutionDate: "2026-02-17" }),
      substitutionRow({ id: "a", name: "Sooner", substitutionDate: "2026-02-16" }),
    ]);
    expect(substitutions.map((c) => c.productName)).toEqual([
      "Sooner",
      "Later",
      "Orphan",
    ]);
  });

  it("gives an in-person substitution its site and no room", () => {
    const [substitution] = rollUpSubstitutions([
      substitutionRow({
        id: "p1",
        name: "Camp",
        substitutionDate: "2026-02-16",
        isRemote: false,
        siteName: "Sello Library, Espoo",
      }),
    ]);
    expect(substitution.hasVoiceRoom).toBe(false);
    expect(substitution.siteName).toBe("Sello Library, Espoo");
    expect(substitution.voiceHref).toBe(INERT_HREF);
  });
});
