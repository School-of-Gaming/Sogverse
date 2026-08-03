import { describe, it, expect } from "vitest";
import {
  buildGeduSessionFeed,
  productLocalDate,
  sessionEntryId,
  UNDATED_PRODUCT_PAST_HORIZON_DAYS,
} from "@/lib/gedu-session-feed";
import { OPEN_ENDED_OCCURRENCE_CAP } from "@/lib/session-occurrence";
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
    did_not_run: false,
    needs_substitute: false,
    created_at: `${sessionDate}T16:05:00.000Z`,
    updated_at: `${sessionDate}T16:05:00.000Z`,
    created_by: null,
    updated_by: null,
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

  it("carries a future row's notes without ever carrying attendance", () => {
    const entries = build({
      sessions: [row("2026-03-23", { report: "# Lighthouse week" })],
    });
    const next = byDate(entries, "2026-03-23");
    expect(next).toMatchObject({ kind: "future", report: "# Lighthouse week" });
    expect(next).not.toHaveProperty("attendance");
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
 * A session becomes **editable** at its start — that is the roll-call case, and
 * it is why the entry sorts into the past the moment it begins. It becomes
 * **owed** only at its end, which is the same line the dashboard's SQL count
 * draws. So a session under way sits in between: a fully editable past entry
 * that no badge and no amber marker may claim yet.
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

  it("appears exactly once, on the past side of the divider", () => {
    // The forward walk surfaces a session still inside its voice window and the
    // backward walk emits anything already started, so the same occurrence
    // reaches the merge twice. It shares one date key, so it lands once.
    const entries = at(DURING);
    expect(dates(entries).filter((d) => d === "2026-03-16")).toHaveLength(1);
    expect(byDate(entries, "2026-03-16")?.kind).toBe("past");
  });

  it("is editable but owes nothing while it is still running", () => {
    // The gedu is standing in the room. They may take the register — that is the
    // whole point of the entry being past — but there is nothing outstanding
    // about a session whose hour has not run out.
    expect(byDate(at(DURING), "2026-03-16")).toMatchObject({
      kind: "past",
      owed: false,
    });
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
