import { describe, it, expect } from "vitest";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { partitionFeedEntries } from "@/components/session-feed";
import {
  OPEN_ENDED_OCCURRENCE_CAP,
  productLocalDate,
  sessionEntryId,
  UNDATED_PRODUCT_PAST_HORIZON_DAYS,
} from "@/lib/session-occurrence";
import type { GeduFeedSession } from "@/services/gedu-sessions";
import type { SessionFeedEntry } from "@/components/gedu/session-feed";

/**
 * The merge that makes the workspace's feed: schedule walked both ways, stored
 * rows laid over the projections, entry kind derived from now / the epoch / the
 * product start.
 *
 * Everything is pinned to a fixed `now` well inside a term so the arithmetic is
 * reproducible. The club meets Mondays at 16:30 Helsinki time; `NOW` is a
 * Wednesday, so "last Monday" is two days back and "next Monday" five days on.
 */
const GROUP = "11111111-1111-4111-8111-111111111111";
const TZ = "Europe/Helsinki";
/** Wednesday 18 March 2026, 12:00 Helsinki. */
const NOW = new Date("2026-03-18T10:00:00.000Z");
/** 0 = Monday, matching the schedule_slots convention. */
const MONDAY_SLOT = { weekday: 0, startTime: "16:30", durationMinutes: 90 };
/** Comfortably before every date these tests care about. */
const EPOCH = "2026-01-01";

function build(overrides: Partial<Parameters<typeof buildGeduSessionFeed>[0]> = {}) {
  return buildGeduSessionFeed({
    groupId: GROUP,
    timezone: TZ,
    slots: [MONDAY_SLOT],
    startDate: "2026-01-05",
    endDate: null,
    sessions: [],
    now: NOW,
    epoch: EPOCH,
    ...overrides,
  });
}

function row(
  sessionDate: string,
  fields: Partial<GeduFeedSession> = {},
): GeduFeedSession {
  return {
    id: `row-${sessionDate}`,
    session_date: sessionDate,
    starts_at: `${sessionDate}T14:30:00.000Z`,
    ends_at: `${sessionDate}T16:00:00.000Z`,
    report: null,
    gedu_note: null,
    created_at: `${sessionDate}T16:05:00.000Z`,
    updated_at: `${sessionDate}T16:05:00.000Z`,
    created_by: null,
    // The last-editor pair. Null together by default: this builder is about the
    // calendar math, and every case here is indifferent to who touched the row.
    updated_by: null,
    updated_by_first_name: null,
    attendance: {},
    ...fields,
  };
}

/** Every entry's product-local date, in the order the feed emits them. */
function dates(entries: readonly SessionFeedEntry[]): string[] {
  return entries.map((entry) => productLocalDate(entry.startsAt, TZ));
}

function byDate(
  entries: readonly SessionFeedEntry[],
  date: string,
): SessionFeedEntry | undefined {
  return entries.find((entry) => entry.id === sessionEntryId(GROUP, date));
}

describe("sessionEntryId", () => {
  it("is the group and the product-local date, and nothing else", () => {
    // Deliberately not the row's primary key: most entries have no row, and the
    // ones that do acquire one mid-edit — which would change the id of the card
    // being typed into.
    expect(sessionEntryId(GROUP, "2026-03-16")).toBe(`${GROUP}:2026-03-16`);
  });
});

describe("buildGeduSessionFeed — ordering and horizon", () => {
  it("emits one descending run: the future first, then the term backwards", () => {
    const emitted = dates(build());
    const sorted = [...emitted].sort().reverse();
    expect(emitted).toEqual(sorted);
    expect(emitted).toContain("2026-03-23"); // next Monday
    expect(emitted).toContain("2026-03-16"); // last Monday
  });

  it("caps an open-ended product's future at the shared occurrence cap", () => {
    const future = build().filter(
      (entry) => entry.startsAt.getTime() > NOW.getTime(),
    );
    // The same horizon every other list in the app shows, so a gedu's view of a
    // club reaches exactly as far ahead as a parent's.
    expect(future).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
  });

  it("runs an end-dated product to its end date instead of the cap", () => {
    const future = build({ endDate: "2026-06-29" }).filter(
      (entry) => entry.startsAt.getTime() > NOW.getTime(),
    );
    expect(future.length).toBeGreaterThan(OPEN_ENDED_OCCURRENCE_CAP);
    expect(dates(future).at(0)).toBe("2026-06-29");
  });

  it("floors the past at the product's start date", () => {
    const emitted = dates(build({ startDate: "2026-03-02" }));
    expect(emitted.at(-1)).toBe("2026-03-02");
    expect(emitted).not.toContain("2026-02-23");
  });

  it("bounds an undated product's past at the documented horizon", () => {
    // `start_date` is nullable, and a missing one cannot mean "walk to the
    // beginning of time" — that would hand the feed a decade of placeholder
    // lines for a club nobody claims ran that long.
    const oldest = dates(build({ startDate: null })).at(-1);
    const floor = new Date(
      NOW.getTime() - UNDATED_PRODUCT_PAST_HORIZON_DAYS * 86_400_000,
    );
    expect(oldest?.localeCompare(productLocalDate(floor, TZ))).toBeGreaterThan(-1);
  });

  it("emits nothing at all for a product with no slots and no rows", () => {
    expect(build({ slots: [] })).toEqual([]);
  });
});

describe("buildGeduSessionFeed — entry kinds", () => {
  it("splits future from past on `now`", () => {
    const entries = build();
    expect(byDate(entries, "2026-03-23")?.kind).toBe("future");
    expect(byDate(entries, "2026-03-16")?.kind).toBe("past");
  });

  it("carries a future row's notes, with an empty sheet until it starts", () => {
    const entries = build({
      sessions: [row("2026-03-23", { report: "# Lighthouse week" })],
    });
    const next = byDate(entries, "2026-03-23");
    expect(next).toMatchObject({ kind: "future", report: "# Lighthouse week" });
    // A future entry does carry a sheet, because one of them can be the session
    // in progress — but a session that has not started has nothing on it, and
    // the server refuses a mark before the start instant, so there is no path
    // that fills it.
    expect(next).toMatchObject({ attendance: {} });
  });

  it("marks a finished session owed from the epoch onward, and never before it", () => {
    const entries = build({ epoch: "2026-03-10", startDate: "2026-01-05" });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      kind: "past",
      owed: true,
    });
    // Before the epoch and untouched: a muted gap, not owed work.
    expect(byDate(entries, "2026-03-02")?.kind).toBe("no_record");
  });

  it("turns a recorded pre-epoch session into a past entry that owes nothing", () => {
    // The distinction the epoch actually draws: the moment anything is written
    // on an old session it stops being a gap and renders as an ordinary entry —
    // it simply never turns amber.
    const entries = build({
      epoch: "2026-03-10",
      sessions: [row("2026-03-02", { report: "# From memory" })],
    });
    expect(byDate(entries, "2026-03-02")).toMatchObject({
      kind: "past",
      owed: false,
      report: "# From memory",
    });
  });
});

/**
 * The last-editor pair, and the one rule over it: **both halves or nobody.**
 *
 * The id seeds an identicon and the name is what the chip says, so half a pair
 * is not an attribution anyone can read — it is a face with no name or a name
 * with a degenerate face. The builder answers `null` for any row missing either
 * half, and for every occurrence with no row behind it at all — which includes
 * the pre-epoch gap kind, whose shape has no field to put an editor in, because
 * a session nothing has ever touched has nobody to name.
 *
 * Nothing here is about *who* the editor is. The column is the session's last
 * editor rather than the report's author, which is a documented product
 * decision the builder has no opinion about: it maps the pair through, and the
 * card decides whether there is a write-up worth signing.
 */
describe("buildGeduSessionFeed — the last editor", () => {
  const EDITOR = {
    updated_by: "9f1c1a3f-1d4c-4a0b-9c6e-7f2a5f0e11aa",
    updated_by_first_name: "Sanna",
  };

  it("maps the pair through when both halves are present", () => {
    const entries = build({ sessions: [row("2026-03-16", EDITOR)] });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      kind: "past",
      lastEditedBy: { id: EDITOR.updated_by, firstName: "Sanna" },
    });
  });

  it("carries it on a future entry too — a plan is the same field earlier", () => {
    const entries = build({ sessions: [row("2026-03-23", EDITOR)] });
    expect(byDate(entries, "2026-03-23")).toMatchObject({
      kind: "future",
      lastEditedBy: { id: EDITOR.updated_by, firstName: "Sanna" },
    });
  });

  it("answers null when the id is there and the name is not", () => {
    const entries = build({
      sessions: [
        row("2026-03-16", { ...EDITOR, updated_by_first_name: null }),
      ],
    });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      lastEditedBy: null,
    });
  });

  it("answers null when the name is there and the id is not", () => {
    const entries = build({
      sessions: [row("2026-03-16", { ...EDITOR, updated_by: null })],
    });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      lastEditedBy: null,
    });
  });

  it("answers null on an occurrence with no stored row behind it", () => {
    expect(byDate(build(), "2026-03-16")).toMatchObject({
      lastEditedBy: null,
    });
  });

  it("gives a pre-epoch gap no editor field at all", () => {
    const entries = build({ epoch: "2026-03-10", startDate: "2026-01-05" });
    const gap = byDate(entries, "2026-03-02");
    expect(gap?.kind).toBe("no_record");
    expect(gap).not.toHaveProperty("lastEditedBy");
  });
});

describe("buildGeduSessionFeed — records beat projections", () => {
  it("lays a row over the occurrence it shares a date with", () => {
    const entries = build({
      sessions: [
        row("2026-03-16", {
          report: "# Redstone",
          gedu_note: "Watch Siiri.",
          attendance: { "gamer-a": "present" },
        }),
      ],
    });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      kind: "past",
      report: "# Redstone",
      staffNote: "Watch Siiri.",
      attendance: { "gamer-a": "present" },
    });
    // One entry for the date, not two: the projection and the row are the same
    // session, met on the key they share.
    expect(dates(entries).filter((d) => d === "2026-03-16")).toHaveLength(1);
  });

  it("uses the row's snapshotted instants rather than the current schedule", () => {
    // History does not change because the plan was edited: a session written up
    // at 16:30 keeps saying 16:30 after an admin moves the club to 17:00.
    const entries = build({
      sessions: [
        row("2026-03-16", { starts_at: "2026-03-16T12:00:00.000Z" }),
      ],
    });
    expect(byDate(entries, "2026-03-16")?.startsAt.toISOString()).toBe(
      "2026-03-16T12:00:00.000Z",
    );
  });

  it("still renders a row the schedule no longer projects", () => {
    // The orphan rule: an admin moving the club from Monday to Tuesday must not
    // delete last term from the page.
    const entries = build({
      sessions: [row("2026-03-11", { report: "# The Wednesday we ran once" })],
    });
    expect(byDate(entries, "2026-03-11")).toMatchObject({
      kind: "past",
      report: "# The Wednesday we ran once",
    });
  });

  it("keeps an orphaned row in date order with everything around it", () => {
    const emitted = dates(build({ sessions: [row("2026-03-11")] }));
    expect(emitted.indexOf("2026-03-16")).toBeLessThan(
      emitted.indexOf("2026-03-11"),
    );
    expect(emitted.indexOf("2026-03-11")).toBeLessThan(
      emitted.indexOf("2026-03-09"),
    );
  });
});

/**
 * The two boundaries, and the gap between them.
 *
 * **The kind flips at the session's END**, which is the same rule the family
 * feed uses, so a session under way is still a `future` entry — the *current*
 * one, at the top of the feed where the gedu is looking. It becomes **owed**
 * only at that same end instant, which is the line the dashboard's SQL count
 * draws too.
 *
 * Editability is the question that no longer rides on the kind: it turns on the
 * session's *start*, so the running session takes the record editor while
 * sitting on the future side. That is asserted over in the entry-state suite,
 * where the predicates live.
 */
describe("buildGeduSessionFeed — the in-progress session", () => {
  /** Monday 16 March, mid-session (the slot runs 14:30–16:00 UTC). */
  const DURING = new Date("2026-03-16T15:00:00.000Z");
  /** The same Monday, one minute after the session ended. */
  const JUST_AFTER = new Date("2026-03-16T16:01:00.000Z");

  function at(now: Date) {
    return buildGeduSessionFeed({
      groupId: GROUP,
      timezone: TZ,
      slots: [MONDAY_SLOT],
      startDate: "2026-01-05",
      endDate: null,
      sessions: [],
      now,
      epoch: EPOCH,
    });
  }

  it("appears exactly once, and is the current session rather than history", () => {
    // The forward walk surfaces a session still inside its voice window and the
    // backward walk emits anything already started, so the same occurrence
    // reaches the merge twice. It shares one date key, so it lands once.
    const entries = at(DURING);
    expect(dates(entries).filter((d) => d === "2026-03-16")).toHaveLength(1);
    // Future, because the kind flips at the END. The gedu is standing in this
    // session; filing it under history while they teach it is what this
    // convergence fixed.
    expect(byDate(entries, "2026-03-16")?.kind).toBe("future");
  });

  it("owes nothing while it is still running", () => {
    // Nothing is outstanding about a session whose hour has not run out. A
    // future entry has no `owed` field at all, which says the same thing in the
    // type: being on this side of the end instant *is* owing nothing.
    const entry = byDate(at(DURING), "2026-03-16");
    expect(entry?.kind).toBe("future");
    expect(entry).not.toHaveProperty("owed");
  });

  /*
   * ------------------------------------------------------------------
   * The scenario that forced this: a daily camp running 8:00 to 23:00.
   * ------------------------------------------------------------------
   *
   * The gedu feed used to split on the session's START. On a ninety-minute club
   * that is nearly invisible - the session is "past" for the hour and a half the
   * gedu is in it, and nobody much notices. On a fifteen-hour camp day it is the
   * whole day: from 8:00 the workspace called the session the gedu was standing
   * in "last time", filed it below the divider with the history, and named
   * TOMORROW as the next session. Meanwhile the family feed, which has always
   * split on the END, correctly called the same session today's and tagged it
   * live. One timeline, two audiences, two different answers.
   *
   * Both feeds now split on the end. The assertions below pin the three things
   * that have to hold simultaneously at 14:00 on such a day, which is the exact
   * combination that was impossible before:
   *
   *   1. the running session is `future` (so it sits at the top as current),
   *   2. the live tag is satisfiable on it (kind future AND started AND not
   *      ended - a conjunction a start-based split makes unsatisfiable), and
   *   3. it still owes nothing, because owed keys on the end and always did.
   *
   * MUTATION CHECK: revert the builder's split to `startsAt > now` and case (1)
   * fails - the entry comes back `past`. Case (2) fails with it, since the live
   * tag requires `kind === "future"`.
   */
  it("classifies a long camp day as current, live-taggable, and not yet owed", () => {
    const CAMP_TZ = "Europe/Helsinki";
    // 8:00-23:00 Helsinki on Monday 16 March: a 15-hour day.
    const campDay = buildGeduSessionFeed({
      groupId: GROUP,
      timezone: CAMP_TZ,
      // Weekday 0 is Monday in this codebase, matching MONDAY_SLOT above.
      slots: [{ weekday: 0, startTime: "08:00", durationMinutes: 15 * 60 }],
      startDate: "2026-03-02",
      endDate: null,
      sessions: [],
      // 14:00 Helsinki - six hours in, nine hours to go.
      now: new Date("2026-03-16T12:00:00.000Z"),
      epoch: EPOCH,
    });

    const entry = byDate(campDay, "2026-03-16");
    const now = new Date("2026-03-16T12:00:00.000Z");

    // (1) The current session, not history.
    expect(entry?.kind).toBe("future");

    // (2) The live tag is satisfiable: the family feed's exact conjunction.
    const live =
      entry !== undefined &&
      entry.kind === "future" &&
      entry.startsAt.getTime() <= now.getTime() &&
      now.getTime() < entry.endsAt.getTime();
    expect(live).toBe(true);

    // (3) Nothing owed yet - the gedu has nine hours of camp left to run.
    expect(entry).not.toHaveProperty("owed");

    // And the workspace genuinely treats it as the current one. The feed runs
    // newest-first, so the "next session" is the LAST of the leading future run
    // - the one sitting directly above the divider - and that is the entry the
    // page renders prominently. Under the old split this was tomorrow while the
    // gedu was mid-session; now it is the session they are actually in.
    const partition = partitionFeedEntries(campDay);
    expect(partition.nextSession?.id).toBe(entry?.id);
    expect(
      partition.nextSession?.startsAt.getTime(),
    ).toBeLessThanOrEqual(now.getTime());
  });

  it("becomes owed the moment it ends", () => {
    expect(byDate(at(JUST_AFTER), "2026-03-16")).toMatchObject({
      kind: "past",
      owed: true,
    });
  });

  it("stays a real past entry rather than collapsing into a muted gap", () => {
    // `no_record` is the *pre-epoch* answer, and it must not be reached by way
    // of "owes nothing". Collapsing a live session into a gap would take its
    // editor away at exactly the minute the gedu wants it.
    expect(byDate(at(DURING), "2026-03-16")?.kind).not.toBe("no_record");
  });
});

describe("buildGeduSessionFeed — multi-slot products", () => {
  it("interleaves a camp's weekday slots into one descending run", () => {
    const entries = build({
      slots: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 180,
      })),
      startDate: "2026-03-09",
      endDate: "2026-03-20",
    });
    expect(dates(entries)).toEqual([
      "2026-03-20",
      "2026-03-19",
      "2026-03-18",
      "2026-03-17",
      "2026-03-16",
      "2026-03-13",
      "2026-03-12",
      "2026-03-11",
      "2026-03-10",
      "2026-03-09",
    ]);
  });
});
