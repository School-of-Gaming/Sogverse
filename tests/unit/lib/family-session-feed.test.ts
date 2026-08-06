import { describe, it, expect } from "vitest";
import { buildFamilySessionFeed } from "@/lib/family-session-feed";
import {
  OPEN_ENDED_OCCURRENCE_CAP,
  productLocalDate,
  sessionEntryId,
  UNDATED_PRODUCT_PAST_HORIZON_DAYS,
} from "@/lib/session-occurrence";
import type { FamilyFeedSession } from "@/services/family-product-feed";
import type { FamilySessionEntry } from "@/components/family/product-page";

/**
 * The merge that makes a family's feed: the schedule walked both ways, stored
 * rows laid over the projections, and two entry kinds derived from nothing but
 * which side of `now` a session falls on.
 *
 * It shares its arithmetic with the gedu builder and deliberately not its
 * output, so what is worth testing here is the divergence: two kinds instead of
 * three, one child's mark instead of a roster, and the cancellation clamp the
 * staff feed has no reason to know about.
 *
 * Everything is pinned to a fixed `now` well inside a term so the arithmetic is
 * reproducible. The club meets Mondays at 16:30 Helsinki time; `NOW` is a
 * Wednesday, so "last Monday" is two days back and "next Monday" five days on.
 */
const GROUP = "22222222-2222-4222-8222-222222222222";
const TZ = "Europe/Helsinki";
/** Wednesday 18 March 2026, 12:00 Helsinki. */
const NOW = new Date("2026-03-18T10:00:00.000Z");
/** 0 = Monday, matching the schedule_slots convention. */
const MONDAY_SLOT = { weekday: 0, startTime: "16:30", durationMinutes: 90 };

function build(
  overrides: Partial<Parameters<typeof buildFamilySessionFeed>[0]> = {},
) {
  return buildFamilySessionFeed({
    groupId: GROUP,
    timezone: TZ,
    slots: [MONDAY_SLOT],
    startDate: "2026-01-05",
    endDate: null,
    sessions: [],
    now: NOW,
    ...overrides,
  });
}

function row(
  sessionDate: string,
  fields: Partial<FamilyFeedSession> = {},
): FamilyFeedSession {
  return {
    id: `row-${sessionDate}`,
    session_date: sessionDate,
    starts_at: `${sessionDate}T14:30:00.000Z`,
    ends_at: `${sessionDate}T16:00:00.000Z`,
    report: null,
    attendance: null,
    ...fields,
  };
}

/** Every entry's product-local date, in the order the feed emits them. */
function dates(entries: readonly FamilySessionEntry[]): string[] {
  return entries.map((entry) => productLocalDate(entry.startsAt, TZ));
}

function futureDates(entries: readonly FamilySessionEntry[]): string[] {
  return dates(entries.filter((entry) => entry.kind === "future"));
}

function byDate(
  entries: readonly FamilySessionEntry[],
  date: string,
): FamilySessionEntry | undefined {
  return entries.find((entry) => entry.id === sessionEntryId(GROUP, date));
}

describe("buildFamilySessionFeed — ordering and horizon", () => {
  it("emits one descending run: the future first, then the term backwards", () => {
    const emitted = dates(build());
    const sorted = [...emitted].sort().reverse();
    expect(emitted).toEqual(sorted);
    expect(emitted).toContain("2026-03-23"); // next Monday
    expect(emitted).toContain("2026-03-16"); // last Monday
  });

  it("caps an open-ended product's future at the shared occurrence cap", () => {
    // The same horizon every other list in the app shows, so a family's view of
    // a club reaches exactly as far ahead as the gedu's does.
    expect(futureDates(build())).toHaveLength(OPEN_ENDED_OCCURRENCE_CAP);
  });

  it("runs an end-dated product to its end date instead of the cap", () => {
    const future = futureDates(build({ endDate: "2026-06-29" }));
    expect(future.length).toBeGreaterThan(OPEN_ENDED_OCCURRENCE_CAP);
    expect(future.at(0)).toBe("2026-06-29");
  });

  it("floors the past at the product's start date", () => {
    const emitted = dates(build({ startDate: "2026-03-02" }));
    expect(emitted.at(-1)).toBe("2026-03-02");
    expect(emitted).not.toContain("2026-02-23");
  });

  it("bounds an undated product's past at the documented horizon", () => {
    const oldest = dates(build({ startDate: null })).at(-1);
    const floor = new Date(
      NOW.getTime() - UNDATED_PRODUCT_PAST_HORIZON_DAYS * 86_400_000,
    );
    expect(oldest?.localeCompare(productLocalDate(floor, TZ))).toBeGreaterThan(
      -1,
    );
  });

  it("emits nothing at all for a product with no slots and no rows", () => {
    expect(build({ slots: [] })).toEqual([]);
  });

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

/**
 * Two kinds, and the third one's absence.
 *
 * The gedu's `no_record` exists to carry the enforcement epoch — a fact about
 * what *staff* are owed. A family is owed nothing and asks one question of a
 * session: has it happened. So an unwritten session from before the platform
 * started asking and an unwritten one from last week are the same entry here,
 * and the epoch never reaches this builder at all — it is not even an argument.
 */
describe("buildFamilySessionFeed — entry kinds", () => {
  it("splits future from past on `now`, and emits no other kind", () => {
    const entries = build({ startDate: "2024-01-01" });
    expect(byDate(entries, "2026-03-23")?.kind).toBe("future");
    expect(byDate(entries, "2026-03-16")?.kind).toBe("past");
    expect(new Set(entries.map((entry) => entry.kind))).toEqual(
      new Set(["future", "past"]),
    );
  });

  it("renders an ancient unwritten session as an ordinary past entry", () => {
    // Two years before any epoch the platform has ever had. A gedu would see a
    // muted `no_record` gap here; a family sees a session that ran with nothing
    // written down, which is the same sentence for every unwritten session.
    const entries = build({ startDate: "2024-01-01" });
    expect(byDate(entries, "2024-01-08")).toMatchObject({
      kind: "past",
      report: null,
      attendance: null,
    });
  });

  it("carries a future row's report without ever carrying attendance", () => {
    const entries = build({
      sessions: [row("2026-03-23", { report: "# Lighthouse week" })],
    });
    const next = byDate(entries, "2026-03-23");
    expect(next).toMatchObject({ kind: "future", report: "# Lighthouse week" });
    // A session that has not happened cannot have been attended, so there is no
    // field for a mark to arrive in.
    expect(next).not.toHaveProperty("attendance");
  });
});

/**
 * The three attendance states, and why the third one is not a boolean.
 *
 * `null` is *unmarked* — nobody answered for this child on this date. It is a
 * gap in the gedu's paperwork rather than a claim about the child, which is why
 * it must never collapse into "absent".
 */
describe("buildFamilySessionFeed — one child's mark, three states", () => {
  it("passes a recorded mark through", () => {
    expect(
      byDate(build({ sessions: [row("2026-03-16", { attendance: "present" })] }), "2026-03-16"),
    ).toMatchObject({ kind: "past", attendance: "present" });
    expect(
      byDate(build({ sessions: [row("2026-03-16", { attendance: "absent" })] }), "2026-03-16"),
    ).toMatchObject({ kind: "past", attendance: "absent" });
  });

  it("keeps unmarked as null on a row that exists but says nothing", () => {
    // A written-up session nobody took the register for. The report renders;
    // the mark does not, because there is no mark.
    const entries = build({
      sessions: [row("2026-03-16", { report: "# We built a lighthouse" })],
    });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      kind: "past",
      report: "# We built a lighthouse",
      attendance: null,
    });
  });

  it("keeps unmarked as null on a projection with no row behind it", () => {
    expect(byDate(build(), "2026-03-16")).toMatchObject({
      kind: "past",
      report: null,
      attendance: null,
    });
  });
});

/**
 * A report is passed through exactly as stored, `null` included. Whether one
 * *exists* is a trimmed test made where the entry is rendered — the same trimmed
 * test the gedu feed and the dashboard's SQL count make — so a report of one
 * newline is "no write-up" to every surface at once rather than to two of three.
 */
describe("buildFamilySessionFeed — no write-up versus a write-up", () => {
  it("gives an unrecorded past occurrence a null report", () => {
    expect(byDate(build(), "2026-03-16")).toMatchObject({ report: null });
  });

  it("hands whitespace on to the renderer rather than deciding for it", () => {
    expect(
      byDate(build({ sessions: [row("2026-03-16", { report: "\n" })] }), "2026-03-16"),
    ).toMatchObject({ report: "\n" });
  });
});

describe("buildFamilySessionFeed — records beat projections", () => {
  it("lays a row over the occurrence it shares a date with", () => {
    const entries = build({
      sessions: [
        row("2026-03-16", { report: "# Redstone", attendance: "present" }),
      ],
    });
    expect(byDate(entries, "2026-03-16")).toMatchObject({
      kind: "past",
      report: "# Redstone",
      attendance: "present",
    });
    // One entry for the date, not two: the projection and the row are the same
    // session, met on the key they share.
    expect(dates(entries).filter((d) => d === "2026-03-16")).toHaveLength(1);
  });

  it("uses the row's snapshotted instants rather than the current schedule", () => {
    // History does not change because the plan was edited: a session written up
    // at 16:30 keeps saying 16:30 after an admin moves the club to 17:00.
    const entries = build({
      sessions: [row("2026-03-16", { starts_at: "2026-03-16T12:00:00.000Z" })],
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

  it("renders a row older than the projection floor", () => {
    // The full-history decision: a family placed in a group reads the group's
    // whole story, including sessions from before their child enrolled. A row is
    // a fact, so the backward walk's floor never suppresses one.
    const entries = build({
      startDate: "2026-03-02",
      sessions: [row("2025-09-15", { report: "# The first term" })],
    });
    expect(byDate(entries, "2025-09-15")).toMatchObject({
      kind: "past",
      report: "# The first term",
      // Nobody marked a child who had not joined yet, and that reads as the
      // unmarked state rather than as an absence.
      attendance: null,
    });
    expect(dates(entries).at(-1)).toBe("2025-09-15");
  });
});

describe("buildFamilySessionFeed — the in-progress session", () => {
  /** Monday 16 March, mid-session (the slot runs 14:30–16:00 UTC). */
  const DURING = new Date("2026-03-16T15:00:00.000Z");

  it("appears exactly once, on the past side of the divider", () => {
    // The forward walk surfaces a session still inside its voice window and the
    // backward walk emits anything already started, so the same occurrence
    // reaches the merge twice. It shares one date key, so it lands once.
    const entries = build({ now: DURING });
    expect(dates(entries).filter((d) => d === "2026-03-16")).toHaveLength(1);
    expect(byDate(entries, "2026-03-16")?.kind).toBe("past");
  });
});

/**
 * The cancellation clamp — the family builder's one extra input.
 *
 * A parent who has cancelled keeps what they paid for and sees nothing beyond
 * it. The card's next session, the dashboard's sort and this feed's future block
 * all stop at the same instant, so the page can never list an evening nobody may
 * turn up to.
 */
describe("buildFamilySessionFeed — clamping at the paid window", () => {
  /** Paid through the end of March; the club runs on past it. */
  const ACCESS_UNTIL = new Date("2026-04-01T00:00:00.000Z");

  it("stops the future at the instant paid access ends", () => {
    expect(futureDates(build({ accessUntil: ACCESS_UNTIL }))).toEqual([
      "2026-03-30",
      "2026-03-23",
    ]);
    // Without the clamp the same open-ended club runs to the shared horizon,
    // which reaches well past the end of March.
    expect(futureDates(build())).toContain("2026-04-06");
  });

  it("takes whichever of the two windows closes first", () => {
    // The product ends before the money runs out.
    expect(
      futureDates(build({ endDate: "2026-03-25", accessUntil: ACCESS_UNTIL })),
    ).toEqual(["2026-03-23"]);
    // And the other way round.
    expect(
      futureDates(build({ endDate: "2026-04-30", accessUntil: ACCESS_UNTIL })),
    ).toEqual(["2026-03-30", "2026-03-23"]);
  });

  it("drops a stored row that falls past the paid window", () => {
    // The case the walks cannot catch on their own: a gedu writing a plan for a
    // session beyond the window materializes a row, and a row exists whether or
    // not anything projected it.
    const sessions = [row("2026-04-06", { report: "# After they leave" })];
    expect(byDate(build({ accessUntil: ACCESS_UNTIL, sessions }), "2026-04-06"))
      .toBeUndefined();
    // Same row, no cancellation: nothing to clamp, so it renders.
    expect(byDate(build({ sessions }), "2026-04-06")).toMatchObject({
      kind: "future",
      report: "# After they leave",
    });
  });

  it("leaves the history alone — the clamp is forward-looking", () => {
    const emitted = dates(build({ accessUntil: ACCESS_UNTIL }));
    expect(emitted).toContain("2026-03-16");
    expect(emitted.at(-1)).toBe("2026-01-05");
  });
});
