import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type {
  AttendanceMark,
  AttendanceMarks,
  SessionFeedEntry,
  SessionFeedGamer,
} from "./types";

/**
 * Fixture feeds for the `/admin/ui-components` style guide and the full-page
 * preview scenes: realistic groups, deep enough to cover every entry state the
 * feed can render.
 *
 * Everything is computed from a `now` handed in by the caller (callers pass
 * `useNow()`), so a demo always shows a plausible past and future whenever it
 * is opened, and SSR and the first client render agree. There are no absolute
 * dates anywhere in here on purpose.
 *
 * The default club meets on Mondays, which is what its name says, so the most
 * recent past session is "last Monday" — anywhere from yesterday to six days
 * ago depending on which day the page is opened. That is the honest shape of a
 * weekly club; the alternative (deriving the weekday from `now` so the last
 * session is always yesterday) would make the club's own name a lie half the
 * week.
 *
 * The note copy below is mock *data*, not UI copy — it stands in for what a
 * gedu would have typed, so it is not translated, exactly like the product
 * descriptions in the other fixture files.
 */

const TIMEZONE = "Europe/Helsinki";
/** 0 = Monday, matching DAYS_OF_WEEK / the schedule_slots convention. */
const WEEKDAY = 0;
const START_TIME = "16:30";
const DURATION_MS = 90 * 60 * 1000;

export const SESSION_FEED_CLUB_NAME = "Minecraft Monday Club";
export const SESSION_FEED_TIMEZONE = TIMEZONE;

/**
 * Roster ids, named so a spec can say who was away without repeating a UUID.
 *
 * They are real generated UUIDv4s and hardcoded as literals. Both halves matter:
 * an identicon is a pattern hashed out of the id's hex bytes, so a readable id
 * like `"mock-gamer-aino"` parses to nothing and renders an empty square; and
 * generating them at module load would hand every reload a different avatar for
 * the same child, which is exactly the drift a fixture exists to avoid.
 */
export const SESSION_FEED_GAMER_IDS = {
  aino: "e1dd1bcd-1b1b-408a-adab-bacb876d4bb2",
  vaino: "606abb0b-52fa-4de4-9b63-be5903ba08d8",
  elias: "a6681627-f470-4327-af87-8cc6d61f52ac",
  linnea: "ae6c92e3-7438-4d43-92a2-4e6d4bc99cb3",
  oskar: "7022016c-a95d-437c-8c62-1fcea6649e7f",
  siiri: "d3f30b1b-c7aa-4cfc-b02b-fb79547c4710",
  emil: "fccd4964-e55a-4f75-8fc1-ec559d80e0d8",
  hilda: "0d470b0a-08dd-4d53-99ae-322bf8e326e1",
} as const;

/**
 * Eight regulars with plausible Finnish and Swedish first names — enough that
 * "6 of 8 present" reads like a real group and the attendance checklist has to
 * wrap.
 */
export const SESSION_FEED_ROSTER: readonly SessionFeedGamer[] = [
  { id: SESSION_FEED_GAMER_IDS.aino, firstName: "Aino" },
  { id: SESSION_FEED_GAMER_IDS.vaino, firstName: "Väinö" },
  { id: SESSION_FEED_GAMER_IDS.elias, firstName: "Elias" },
  { id: SESSION_FEED_GAMER_IDS.linnea, firstName: "Linnéa" },
  { id: SESSION_FEED_GAMER_IDS.oskar, firstName: "Oskar" },
  { id: SESSION_FEED_GAMER_IDS.siiri, firstName: "Siiri" },
  { id: SESSION_FEED_GAMER_IDS.emil, firstName: "Emil" },
  { id: SESSION_FEED_GAMER_IDS.hilda, firstName: "Hilda" },
];

/**
 * How often the group meets.
 *
 * `weekly` is a club: the same weekday every week. `daily` is a camp: back to
 * back weekdays, which packs the feed's dates far tighter than a club ever
 * does and is the layout stress a weekly fixture never shows. Weekends are
 * skipped in both directions — a camp runs Mon–Fri, and stepping back over a
 * Sunday would invent a session that never existed.
 */
export type SessionFeedCadence = "weekly" | "daily";

/**
 * What each session is, newest first. Index 0 is the furthest-away future
 * session; the leading run of `future` specs is the feed's future horizon, the
 * last of them is the next session, and everything after that is the past.
 *
 * In the default club run the enforcement epoch sits just above the two closing
 * `no_record` lines: everything newer either has its attendance finished or is
 * flagged as owed, and everything older is a quiet "no record" line. That
 * boundary is the whole reason the two gap states look nothing alike — one is
 * work, the other is history.
 */
export type EntrySpec =
  | {
      kind: "future";
      /** Note families read. */
      publicNote?: string;
      /** Gedu note — a reminder for whoever runs it. */
      staffNote?: string;
    }
  | {
      kind: "past";
      publicNote?: string;
      staffNote?: string;
      /**
       * Roster ids marked absent; everyone else is marked present. Omit every
       * attendance field and the sheet stays **wholly unmarked** — which is what
       * makes the entry need attention, whether or not it carries a note.
       */
      absent?: readonly string[];
      /** Attendance marked with the whole roster present. */
      allPresent?: boolean;
      /**
       * A **part-marked** sheet: only the ids listed here get a mark, everyone
       * else on the roster stays unmarked. This is the state a save can now
       * land in — a gedu interrupted three children into a roster of eight —
       * and the entry it produces still needs attention, renders its notes, and
       * reports its own progress.
       */
      partial?: { present?: readonly string[]; absent?: readonly string[] };
    }
  | { kind: "skipped"; reason?: string }
  | { kind: "no_record" };

/**
 * The future horizon an open-ended weekly club shows: as many entries as the
 * shared open-ended occurrence cap allows, so the feed reaches exactly as far
 * ahead as the live upcoming-session lists do. A unit test pins the length to
 * that cap, so raising it can't quietly leave this list behind.
 */
export const CLUB_FUTURE_SPECS: readonly EntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    staffNote:
      "Parents' evening runs late this week — the room may not be free until quarter past. Padlet is up to date if anyone needs to see where the group is.",
  },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    publicNote:
      "Redstone follow-up: we'll wire the item sorters into the storage room and see whether the overflow fix survives eight people using it at once.",
  },
  {
    kind: "future",
    publicNote:
      "We're finishing the harbour road and starting on the lighthouse at the end of it. Bring ideas for what should be inside it.",
    staffNote:
      "Ask Siiri's group to pair her with Aino this week rather than leaving her to pick — she goes quiet when she has to choose.",
  },
];

export const SESSION_FEED_WEEK_SPECS: readonly EntrySpec[] = [
  ...CLUB_FUTURE_SPECS,

  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.oskar],
    publicNote:
      "We finished the village square this week. Aino's clock tower finally chimes on the hour after three goes at the redstone, and half the group split off to dig a proper road down to the harbour. We ended with a tour where everyone showed one thing they had made — nobody wanted to log off.",
  },

  // Written up on the night and never marked off — the case the whole model
  // exists for: the notes render in full and the entry is still flagged,
  // because attendance is the mandatory half and it is missing.
  {
    kind: "past",
    publicNote:
      "Command blocks. We made teleport pads that fire you across the map, then spent twenty minutes working out why one of them dropped you inside a mountain. Väinö found it: the coordinates were a block off and the pad was aiming at solid stone.",
  },

  // Started and abandoned: three children marked, five still unanswered. The
  // state a partial save leaves behind — the entry keeps its alert, reports "3
  // of 8 marked", and reopens on the three marks rather than on a blank sheet.
  {
    kind: "past",
    partial: {
      present: [SESSION_FEED_GAMER_IDS.aino, SESSION_FEED_GAMER_IDS.vaino],
      absent: [SESSION_FEED_GAMER_IDS.oskar],
    },
    publicNote:
      "Mob-proofing night: we lit the paths, walled the gaps and got through a whole session without losing anybody to a creeper.",
  },

  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.siiri, SESSION_FEED_GAMER_IDS.hilda],
    publicNote:
      "Redstone week. We built item sorters from scratch — hoppers, comparators, the lot — and then broke them on purpose to work out what each part was actually doing. Elias solved the overflow problem on his own and spent the rest of the session teaching it to the table. The sorters go into the storage room next time.",
    staffNote:
      "Siiri was quiet again and dropped out of the call twice without saying anything. Worth a word with her parents if it carries on. Two laptops also couldn't hear shared audio for the first ten minutes — check the room setup before next week.",
  },

  {
    kind: "skipped",
    reason: "Winter break — school closed, no session this week.",
  },

  {
    kind: "past",
    allPresent: true,
    publicNote:
      "Build battle night: two teams, forty minutes, theme drawn out of a hat — \"somewhere you'd hide\". We got a hollowed-out mountain with a hidden lift, and a very convincing haystack with a basement under it. The vote ended in a tie, which everyone agreed was the correct result.",
    staffNote:
      "Emil and Oskar are better on separate teams next time. It got competitive and there was some sniping in chat before I stepped in.",
  },

  // Nothing at all on this one — the plain gap.
  { kind: "past" },

  {
    kind: "past",
    absent: [
      SESSION_FEED_GAMER_IDS.vaino,
      SESSION_FEED_GAMER_IDS.linnea,
      SESSION_FEED_GAMER_IDS.emil,
    ],
    publicNote:
      "A quieter week with a few away, so we used it for housekeeping: tidied up the spawn area, fixed the paths people kept falling off, and agreed some ground rules about building on each other's plots. Hilda started a shared library that anyone can add books to.",
  },

  // Before the epoch: nothing was ever expected here, so nothing is owed.
  { kind: "no_record" },
  { kind: "no_record" },
];

export interface SessionFeedFixture {
  clubName: string;
  /** The zone the club is scheduled in — the feed's `sourceTimeZone`. */
  timeZone: string;
  roster: readonly SessionFeedGamer[];
  entries: SessionFeedEntry[];
}

export interface SessionFeedFixtureOptions {
  /** Defaults to `weekly` — the club shape the style guide demos. */
  cadence?: SessionFeedCadence;
  /** Overrides the run of sessions; defaults to the ten-week club term. */
  specs?: readonly EntrySpec[];
  /** Overrides the group's display name (a camp isn't a Monday club). */
  clubName?: string;
  /** Wall-clock start in the source zone, e.g. `"10:00"`. */
  startTime?: string;
  durationMinutes?: number;
}

/**
 * Build a fixture feed against a reference instant.
 *
 * Defaults reproduce the Monday club the style guide demos; the options let a
 * preview scene ask for a different run of states, a camp's daily cadence, or a
 * different clock face.
 */
export function buildSessionFeedFixture(
  now: Date,
  opts: SessionFeedFixtureOptions = {},
): SessionFeedFixture {
  const {
    cadence = "weekly",
    specs = SESSION_FEED_WEEK_SPECS,
    clubName = SESSION_FEED_CLUB_NAME,
    startTime = START_TIME,
    durationMinutes,
  } = opts;

  const durationMs =
    durationMinutes === undefined ? DURATION_MS : durationMinutes * 60 * 1000;

  const starts = sessionStartsForCadence({
    now,
    count: specs.length,
    cadence,
    weekday: WEEKDAY,
    startTime,
    timeZone: TIMEZONE,
    futureCount: countLeadingFutureSpecs(specs),
  });

  const entries = specs.map((spec, sessionsBack) => {
    const startsAt = starts[sessionsBack];
    const endsAt = new Date(startsAt.getTime() + durationMs);
    // Index-keyed rather than date-keyed so an entry keeps its identity across
    // the `useNow()` tick — callers hold edits in local state against these ids.
    const id = `mock-session-${sessionsBack}`;
    return toEntry(spec, { id, startsAt, endsAt });
  });

  return {
    clubName,
    timeZone: TIMEZONE,
    roster: SESSION_FEED_ROSTER,
    entries,
  };
}

/**
 * How many of a spec list's leading entries are future sessions.
 *
 * The feed is strictly descending, so the future block can only ever be the
 * head of the list. Deriving the count instead of asking the caller for it keeps
 * a spec list self-describing — the dates follow whatever states were authored.
 */
export function countLeadingFutureSpecs(specs: readonly EntrySpec[]): number {
  let count = 0;
  while (count < specs.length && specs[count].kind === "future") count += 1;
  return count;
}

/**
 * The session starts for a cadence, newest first: index 0 is the furthest-away
 * session in the feed and the last index the oldest.
 *
 * `futureCount` says how many of them are still ahead of `now`. The next session
 * lands at `futureCount - 1`, the further-future ones step forward above it, and
 * the past runs backwards beneath it — which is exactly the order the feed
 * renders, so no caller ever has to reverse a slice.
 *
 * Pure and exported so the cadence arithmetic can be unit-tested without
 * rendering anything. Every step walks the calendar **in the source zone**
 * rather than adding a flat number of milliseconds: across a DST boundary a flat
 * step drifts an hour, which would show up in the feed as a club that
 * mysteriously met at 15:30 for half the term.
 */
export function sessionStartsForCadence(opts: {
  now: Date;
  count: number;
  cadence: SessionFeedCadence;
  /** 0 = Monday. Only the weekly cadence uses it. */
  weekday: number;
  startTime: string;
  timeZone: string;
  /** Defaults to 1 — just the next session ahead of `now`. */
  futureCount?: number;
}): Date[] {
  const {
    now,
    count,
    cadence,
    weekday,
    startTime,
    timeZone,
    futureCount = 1,
  } = opts;
  if (count <= 0) return [];

  const next =
    cadence === "weekly"
      ? getNextSessionStart(
          { dayOfWeek: weekday, startTime, timezone: timeZone },
          { now },
        )
      : nextWeekdayStart(now, startTime, timeZone);

  const forward = (from: Date) =>
    cadence === "weekly"
      ? shiftZonedDays(from, 7, timeZone)
      : nextWeekdayStartAfter(from, timeZone);
  const backward = (from: Date) =>
    cadence === "weekly"
      ? shiftZonedDays(from, -7, timeZone)
      : previousWeekdayStart(from, timeZone);

  const futureLength = Math.min(Math.max(futureCount, 1), count);
  const starts: Date[] = new Array<Date>(count);
  starts[futureLength - 1] = next;
  for (let i = futureLength - 2; i >= 0; i--) starts[i] = forward(starts[i + 1]);
  for (let i = futureLength; i < count; i++) starts[i] = backward(starts[i - 1]);
  return starts;
}

/**
 * The next Mon–Fri occurrence of a wall-clock time, at or after `now`.
 *
 * A camp has no single weekday to aim at, so this walks forward a day at a
 * time from today in the camp's own zone, skipping the weekend, and takes the
 * first slot that hasn't already started.
 */
function nextWeekdayStart(now: Date, startTime: string, timeZone: string): Date {
  const zonedNow = toZonedTime(now, timeZone);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(zonedNow.getTime());
    candidate.setDate(candidate.getDate() + offset);
    if (isWeekendDay(candidate.getDay())) continue;

    const start = fromZonedTime(
      `${wallDate(candidate)}T${startTime}:00`,
      timeZone,
    );
    if (start.getTime() > now.getTime()) return start;
  }
  // Unreachable: at most three consecutive days are skipped (a Friday evening
  // start plus the weekend), so a match always lands inside the eight-day walk.
  throw new Error("no weekday session start found within eight days");
}

/** One weekday later, same wall clock, weekend skipped. */
function nextWeekdayStartAfter(instant: Date, timeZone: string): Date {
  let candidate = shiftZonedDays(instant, 1, timeZone);
  while (isWeekendDay(toZonedTime(candidate, timeZone).getDay())) {
    candidate = shiftZonedDays(candidate, 1, timeZone);
  }
  return candidate;
}

/** One weekday earlier, same wall clock, weekend skipped. */
function previousWeekdayStart(instant: Date, timeZone: string): Date {
  let candidate = shiftZonedDays(instant, -1, timeZone);
  while (isWeekendDay(toZonedTime(candidate, timeZone).getDay())) {
    candidate = shiftZonedDays(candidate, -1, timeZone);
  }
  return candidate;
}

/** JS `getDay()`: 0 = Sunday, 6 = Saturday. */
function isWeekendDay(jsDay: number): boolean {
  return jsDay === 0 || jsDay === 6;
}

/**
 * Shift by whole calendar days in `timeZone`, keeping the wall clock.
 *
 * `toZonedTime` hands back a Date whose *local* fields read the wall clock in
 * the zone, so `setDate` moves calendar days there and the `fromZonedTime`
 * round-trip returns the right instant.
 */
function shiftZonedDays(instant: Date, days: number, timeZone: string): Date {
  if (days === 0) return instant;
  const zoned = toZonedTime(instant, timeZone);
  zoned.setDate(zoned.getDate() + days);
  return fromZonedTime(zoned, timeZone);
}

/** `YYYY-MM-DD` from a Date whose local fields already read the target zone. */
function wallDate(zoned: Date): string {
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  const day = String(zoned.getDate()).padStart(2, "0");
  return `${zoned.getFullYear()}-${month}-${day}`;
}

function toEntry(
  spec: EntrySpec,
  base: { id: string; startsAt: Date; endsAt: Date },
): SessionFeedEntry {
  const { id, startsAt, endsAt } = base;
  switch (spec.kind) {
    case "future":
      return {
        kind: "future",
        id,
        startsAt,
        endsAt,
        publicNote: spec.publicNote ?? null,
        staffNote: spec.staffNote ?? null,
      };
    case "past":
      return {
        kind: "past",
        id,
        startsAt,
        endsAt,
        publicNote: spec.publicNote ?? null,
        staffNote: spec.staffNote ?? null,
        attendance: marksForSpec(spec),
      };
    case "skipped":
      return { kind: "skipped", id, startsAt, endsAt, reason: spec.reason ?? null };
    case "no_record":
      return { kind: "no_record", id, startsAt, endsAt };
  }
}

/**
 * Turn a past spec's shorthand into the sparse mark map the entry stores.
 *
 * The three shorthands map onto the three shapes a real sheet can be in: a
 * `partial` names only the children somebody got to, `absent`/`allPresent`
 * cover the whole roster, and a spec with none of them is a session nobody has
 * touched — an empty map, not a roster of invented absences.
 */
function marksForSpec(
  spec: Extract<EntrySpec, { kind: "past" }>,
): AttendanceMarks {
  if (spec.partial !== undefined) {
    const marks: Record<string, AttendanceMark> = {};
    for (const id of spec.partial.present ?? []) marks[id] = "present";
    for (const id of spec.partial.absent ?? []) marks[id] = "absent";
    return marks;
  }
  if (spec.absent === undefined && spec.allPresent !== true) return {};
  const absent = new Set(spec.absent ?? []);
  return Object.fromEntries(
    SESSION_FEED_ROSTER.map(
      (g) => [g.id, absent.has(g.id) ? "absent" : "present"] as const,
    ),
  );
}
