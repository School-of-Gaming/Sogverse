import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type { SessionFeedEntry, SessionFeedGamer } from "./types";

/**
 * Fixture feed for the `/admin/ui-components` style guide: one realistic weekly
 * club, ten weeks deep, covering every entry state the feed can render.
 *
 * Everything is computed from a `now` handed in by the caller (the style guide
 * passes `useNow()`), so the demo always shows a plausible past and future
 * whenever it is opened, and SSR and the first client render agree. There are
 * no absolute dates anywhere in here on purpose.
 *
 * The club meets on Mondays, which is what the name says, so the most recent
 * past session is "last Monday" — anywhere from yesterday to six days ago
 * depending on which day the page is opened. That is the honest shape of a
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
 * What each week is, newest first. Index 0 is the upcoming session; index N is
 * N weeks before it.
 *
 * The enforcement epoch sits between weeks 7 and 8: everything from week 7
 * forward is either written up or flagged as owed, and everything older is a
 * quiet "no record" line. That boundary is the whole reason the two gap states
 * look nothing alike — one is work, the other is history.
 */
type EntrySpec =
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

const WEEK_SPECS: readonly EntrySpec[] = [
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

/**
 * Build the fixture feed against a reference instant.
 *
 * `voiceIsOpen` flips the upcoming session's Join button between its open and
 * locked states so both can be eyeballed without waiting for a real window.
 */
export function buildSessionFeedFixture(
  now: Date,
  opts: { voiceIsOpen?: boolean } = {},
): SessionFeedFixture {
  const upcomingStart = getNextSessionStart(
    { dayOfWeek: WEEKDAY, startTime: START_TIME, timezone: TIMEZONE },
    { now },
  );

  const entries = WEEK_SPECS.map((spec, weeksBack) => {
    const startsAt = weeksBefore(upcomingStart, weeksBack);
    const endsAt = new Date(startsAt.getTime() + DURATION_MS);
    // Index-keyed rather than date-keyed so an entry keeps its identity across
    // the `useNow()` tick — the style guide holds edits in local state against
    // these ids.
    const id = `mock-session-${weeksBack}`;
    return toEntry(spec, { id, startsAt, endsAt, voiceIsOpen: opts.voiceIsOpen ?? false });
  });

  return {
    clubName: SESSION_FEED_CLUB_NAME,
    timeZone: TIMEZONE,
    roster: SESSION_FEED_ROSTER,
    entries,
  };
}

function toEntry(
  spec: EntrySpec,
  base: { id: string; startsAt: Date; endsAt: Date; voiceIsOpen: boolean },
): SessionFeedEntry {
  const { id, startsAt, endsAt, voiceIsOpen } = base;
  switch (spec.kind) {
    case "upcoming":
      // `"#"` keeps the Join button inert — the style guide has no room to
      // join, and the button renders its real open state either way.
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

/**
 * Step back whole weeks in the club's own zone, not by a flat 7×24h.
 *
 * `toZonedTime` hands back a Date whose *local* fields read the wall clock in
 * `TIMEZONE`, so `setDate(-7n)` subtracts calendar weeks there and the
 * `fromZonedTime` round-trip returns the right instant. A flat millisecond
 * subtraction drifts an hour across a DST boundary, which would show up in the
 * feed as a club that mysteriously met at 15:30 for half the term.
 */
function weeksBefore(instant: Date, weeks: number): Date {
  if (weeks === 0) return instant;
  const zoned = toZonedTime(instant, TIMEZONE);
  zoned.setDate(zoned.getDate() - weeks * 7);
  return fromZonedTime(zoned, TIMEZONE);
}
