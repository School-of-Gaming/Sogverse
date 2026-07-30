import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type { SessionFeedEntry, SessionFeedGamer } from "./types";

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
 * Eight regulars with plausible Finnish and Swedish first names — enough that
 * "6 of 8 present" reads like a real group and the attendance checklist has to
 * wrap.
 */
export const SESSION_FEED_ROSTER: readonly SessionFeedGamer[] = [
  { id: "mock-gamer-aino", firstName: "Aino" },
  { id: "mock-gamer-vaino", firstName: "Väinö" },
  { id: "mock-gamer-elias", firstName: "Elias" },
  { id: "mock-gamer-linnea", firstName: "Linnéa" },
  { id: "mock-gamer-oskar", firstName: "Oskar" },
  { id: "mock-gamer-siiri", firstName: "Siiri" },
  { id: "mock-gamer-emil", firstName: "Emil" },
  { id: "mock-gamer-hilda", firstName: "Hilda" },
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
 * What each session is, newest first. Index 0 is the upcoming session; index N
 * is N sessions before it.
 *
 * In the default club run the enforcement epoch sits between weeks 7 and 8:
 * everything from week 7 forward is either written up or flagged as owed, and
 * everything older is a quiet "no record" line. That boundary is the whole
 * reason the two gap states look nothing alike — one is work, the other is
 * history.
 */
export type EntrySpec =
  | { kind: "upcoming" }
  | {
      kind: "recorded";
      publicNote: string;
      staffNote?: string;
      /** Roster ids who were away; everyone else counts as present. */
      absent?: readonly string[];
    }
  | { kind: "skipped"; reason?: string }
  | { kind: "needs_record" }
  | { kind: "no_record" };

export const SESSION_FEED_WEEK_SPECS: readonly EntrySpec[] = [
  { kind: "upcoming" },

  {
    kind: "recorded",
    absent: ["mock-gamer-oskar"],
    publicNote:
      "We finished the village square this week. Aino's clock tower finally chimes on the hour after three goes at the redstone, and half the group split off to dig a proper road down to the harbour. We ended with a tour where everyone showed one thing they had made — nobody wanted to log off.",
  },

  // The recent one still owed — this is what the alert badge is counting.
  { kind: "needs_record" },

  {
    kind: "recorded",
    absent: ["mock-gamer-siiri", "mock-gamer-hilda"],
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
    kind: "recorded",
    publicNote:
      "Build battle night: two teams, forty minutes, theme drawn out of a hat — \"somewhere you'd hide\". We got a hollowed-out mountain with a hidden lift, and a very convincing haystack with a basement under it. The vote ended in a tie, which everyone agreed was the correct result.",
    staffNote:
      "Emil and Oskar are better on separate teams next time. It got competitive and there was some sniping in chat before I stepped in.",
  },

  { kind: "needs_record" },

  {
    kind: "recorded",
    absent: [
      "mock-gamer-vaino",
      "mock-gamer-linnea",
      "mock-gamer-emil",
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
  /**
   * Flips the upcoming session's Join button between its open and locked
   * states so both can be eyeballed without waiting for a real window.
   */
  voiceIsOpen?: boolean;
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
 * Defaults reproduce the ten-week Monday club the style guide demos; the
 * options let a preview scene ask for a different run of states, a camp's
 * daily cadence, or a different clock face.
 */
export function buildSessionFeedFixture(
  now: Date,
  opts: SessionFeedFixtureOptions = {},
): SessionFeedFixture {
  const {
    voiceIsOpen = false,
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
  });

  const entries = specs.map((spec, sessionsBack) => {
    const startsAt = starts[sessionsBack];
    const endsAt = new Date(startsAt.getTime() + durationMs);
    // Index-keyed rather than date-keyed so an entry keeps its identity across
    // the `useNow()` tick — callers hold edits in local state against these ids.
    const id = `mock-session-${sessionsBack}`;
    return toEntry(spec, { id, startsAt, endsAt, voiceIsOpen });
  });

  return {
    clubName,
    timeZone: TIMEZONE,
    roster: SESSION_FEED_ROSTER,
    entries,
  };
}

/**
 * The `count` most recent session starts for a cadence, newest first: index 0
 * is the next session still ahead of us, index N the one N sessions before it.
 *
 * Pure and exported so the cadence arithmetic can be unit-tested without
 * rendering anything. Every step walks the calendar **in the source zone**
 * rather than subtracting a flat number of milliseconds: across a DST boundary
 * a flat subtraction drifts an hour, which would show up in the feed as a club
 * that mysteriously met at 15:30 for half the term.
 */
export function sessionStartsForCadence(opts: {
  now: Date;
  count: number;
  cadence: SessionFeedCadence;
  /** 0 = Monday. Only the weekly cadence uses it. */
  weekday: number;
  startTime: string;
  timeZone: string;
}): Date[] {
  const { now, count, cadence, weekday, startTime, timeZone } = opts;
  if (count <= 0) return [];

  const first =
    cadence === "weekly"
      ? getNextSessionStart(
          { dayOfWeek: weekday, startTime, timezone: timeZone },
          { now },
        )
      : nextWeekdayStart(now, startTime, timeZone);

  const starts = [first];
  for (let i = 1; i < count; i++) {
    starts.push(
      cadence === "weekly"
        ? shiftZonedDays(starts[i - 1], -7, timeZone)
        : previousWeekdayStart(starts[i - 1], timeZone),
    );
  }
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
  base: { id: string; startsAt: Date; endsAt: Date; voiceIsOpen: boolean },
): SessionFeedEntry {
  const { id, startsAt, endsAt, voiceIsOpen } = base;
  switch (spec.kind) {
    case "upcoming":
      // `"#"` keeps the Join button inert — a fixture has no room to join, and
      // the button renders its real open state either way.
      return { kind: "upcoming", id, startsAt, endsAt, voiceIsOpen, voiceHref: "#" };
    case "recorded": {
      const absent = new Set(spec.absent ?? []);
      return {
        kind: "recorded",
        id,
        startsAt,
        endsAt,
        publicNote: spec.publicNote,
        staffNote: spec.staffNote ?? null,
        presentGamerIds: SESSION_FEED_ROSTER.filter(
          (g) => !absent.has(g.id),
        ).map((g) => g.id),
      };
    }
    case "skipped":
      return { kind: "skipped", id, startsAt, endsAt, reason: spec.reason ?? null };
    case "needs_record":
      return { kind: "needs_record", id, startsAt, endsAt };
    case "no_record":
      return { kind: "no_record", id, startsAt, endsAt };
  }
}
