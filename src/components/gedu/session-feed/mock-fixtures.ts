import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type { AttendanceMark } from "@/components/session-feed";
import type {
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
 * The report and note copy below is mock *data*, not UI copy — it stands in for
 * what a gedu would have typed, so it is not translated, exactly like the
 * product descriptions in the other fixture files. **Both** session fields are
 * markdown now — the family-facing report and the gedu note — so a few of the
 * notes carry the light structure a handover actually takes, and the rest stay
 * one plain paragraph, which is also what a real one usually is.
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
export const SESSION_FEED_ADULT_ID = "07981ead-c695-4cac-be1e-d88d5c13306f";

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
 * Eight child regulars with plausible Finnish and Swedish first names, plus one
 * adult holding a seat of her own — enough that "6 of 9 present" reads like a
 * real group and the attendance checklist has to wrap.
 *
 * Marja is last and is not in SESSION_FEED_GAMER_IDS, because she is not a
 * gamer: she is a parent on a for-parents club. She is on this list because a
 * gedu marks her present exactly as they mark a child — the attendance table is
 * participant-keyed and has no branch for her — so a fixture that left her off
 * the checklist while showing her on the rail roster would be rehearsing a
 * split the product does not have.
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
  { id: SESSION_FEED_ADULT_ID, firstName: "Marja" },
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
 * In the default club run the enforcement epoch sits above the closing tail:
 * everything newer is either finished on both halves — register complete and a
 * report written — or flagged as owed, and everything older is either a quiet
 * "no record" line or — for the one somebody went back and wrote up — an
 * ordinary past entry that never turns amber however unfinished it is. That
 * boundary is the whole reason the gap states look nothing alike: one is work,
 * the other is history, and both are editable.
 *
 * **There is no "skipped" spec**, because there is no skipped entry kind: a
 * session that did not run is a real thing the schema will record one day and
 * is inseparable from the cancellation and billing decisions nobody has made
 * yet, so the mock renders and authors nothing of it.
 */
export type EntrySpec =
  | {
      kind: "future";
      /** The session report families read, as markdown. */
      report?: string;
      /** Gedu note — a reminder for whoever runs it. Plain text. */
      staffNote?: string;
      /**
       * Roster ids already marked present — only meaningful on the **live**
       * entry, the session in progress whose register is already open.
       *
       * A future session that has not started can never carry a mark (the
       * server refuses one before the start instant), so omitting this is the
       * ordinary case and produces an empty sheet.
       */
      present?: readonly string[];
    }
  | {
      kind: "past";
      /**
       * The session report, as **markdown** — a title line, a section or two,
       * usually a list. Real ones run 500–1500 characters, and several here are
       * that long on purpose: the feed clamps a report to a few lines and offers
       * to expand it, and a fixture full of one-liners would never exercise that.
       */
      report?: string;
      staffNote?: string;
      /**
       * Roster ids marked absent; everyone else is marked present. Omit every
       * attendance field and the sheet stays **wholly unmarked** — which is what
       * makes the entry need attention, whether or not it carries a report.
       */
      absent?: readonly string[];
      /** Attendance marked with the whole roster present. */
      allPresent?: boolean;
      /**
       * A **part-marked** sheet: only the ids listed here get a mark, everyone
       * else on the roster stays unmarked. This is the state a save can now
       * land in — a gedu interrupted three names into a roster of nine —
       * and the entry it produces still needs attention, renders its report, and
       * reports its own progress.
       */
      partial?: { present?: readonly string[]; absent?: readonly string[] };
      /**
       * Whether a write-up is **owed** for this session. Defaults to `true`,
       * which is what a session inside the enforcement window is.
       *
       * `false` is the pre-epoch session somebody went back and recorded
       * anyway: it renders as an ordinary past entry, it can still reach the
       * green check, and its unfinished states stay neutral because nothing was
       * ever asked of it. A fixture needs at least one, or the epoch's effect is
       * invisible on a page where it is only ever expressed as an *absence* of
       * amber.
       */
      owed?: boolean;
    }
  | { kind: "no_record" };

/* ------------------------------------------------------------------ */
/*  Long-form reports                                                  */
/* ------------------------------------------------------------------ */

/**
 * Three full-length reports, written the way a gedu who has been given a rich
 * editor actually writes: a title, a section or two, a list of what got built,
 * and a sign-off aimed at the parent reading it on a phone.
 *
 * They are long — 700 to 1200 characters — because that is the length the
 * feature was specified at, and because the feed's clamp only means anything
 * against a report that overflows it. A fixture of tidy one-liners would render
 * a "Read more" nowhere and quietly leave the whole interaction untested by eye.
 *
 * They stay inside the subset the editor's toolbar can produce — headings,
 * paragraphs, bold, lists — so a reviewer can open one in the editor, look at
 * it, save it unchanged, and get the same markdown back. Nothing here needs a
 * table, and putting one in would only demonstrate the degrade path.
 */
const VILLAGE_SQUARE_REPORT = `# The village square is finished

We finished the village square this week, and it finally looks like somewhere people live rather than a pile of blocks around a well.

## What the group built

- Aino's clock tower, which chimes on the hour after three goes at the redstone
- A market row of four stalls, one per team, all of them roofed differently
- The first hundred blocks of a proper road down towards the harbour

The road was meant to be next week's job. Half the group split off and started it anyway, and got further than I expected — Oskar organised them into diggers and pavers without being asked to, which is the most useful thing that happened all evening.

We ended with a tour where everyone showed one thing they had made. Nobody wanted to log off.

**Next week:** the harbour itself. We will need a great deal of stone, so anyone who wants to mine ahead of time is very welcome to.`;

const COMMAND_BLOCKS_REPORT = `# Command blocks and teleport pads

A first look at command blocks this week. We built teleport pads that fire you across the map, which is exactly as popular as it sounds.

## How it went

Everyone got a working pad by the end. The interesting twenty minutes were the ones spent working out why one of them dropped you *inside* a mountain rather than on top of it — Väinö found it in the end: the coordinates were one block off, so the pad was aiming at solid stone.

We talked about why that matters more than it looks. A command block does exactly what you tell it, and "exactly" is a much stricter word than most of the group is used to.

**At home:** the pads are still in the world and safe to play with. If one of them stops working, the fix is almost always the coordinates rather than the block.`;

const REDSTONE_WEEK_REPORT = `# Redstone week: item sorters

We built item sorters from scratch this week — hoppers, comparators, the lot — and then broke them on purpose to work out what each part was actually doing.

## The build

- A hopper line feeding four labelled chests
- Comparators reading the filter chests, which is the bit that does the sorting
- An overflow chest at the end, so nothing is ever lost when a filter fills up

The overflow was the hard part and Elias solved it on his own. He then spent the rest of the session teaching it to the rest of the table, which was better than anything I would have said about it.

**Next week:** the sorters go into the storage room, and we find out whether they survive eight people using them at once.`;

const BUILD_BATTLE_REPORT = `# Build battle: "somewhere you'd hide"

Two teams, forty minutes, theme drawn out of a hat.

## What we got

- A hollowed-out mountain with a hidden lift running up the middle of it
- A very convincing haystack with a full basement underneath

Both teams spent the first five minutes arguing and the last five panicking, which is the correct shape for a build battle. The vote ended in a tie, and everyone agreed that this was the correct result.

Worth saying that the mountain team split the work without being asked — two on the shell, one on the lift, one on the lighting — and finished with time to spare. That is a real skill and it is not one we have taught them.`;

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
      "Parents' evening runs late this week — the room may not be free until quarter past. Last week's write-up is in if anyone needs to see where the group is.",
  },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    report:
      "# Redstone follow-up\n\nWe are wiring the item sorters into the storage room and finding out whether the overflow fix survives eight people using it at once.",
  },
  {
    kind: "future",
    report:
      "# The lighthouse\n\nWe are finishing the harbour road and starting on the lighthouse at the end of it.\n\n**Bring:** ideas for what should be inside it. A library, a beacon room and a slide have all been suggested, and only one of those is structurally sensible.",
    staffNote:
      "Ask Siiri's group to pair her with Aino this week rather than leaving her to pick — she goes quiet when she has to choose.",
  },
];

export const SESSION_FEED_WEEK_SPECS: readonly EntrySpec[] = [
  ...CLUB_FUTURE_SPECS,

  // Marked off and reported — the top of the ladder, and the state the green
  // check is for.
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.oskar],
    report: VILLAGE_SQUARE_REPORT,
  },

  // Written up on the night and never marked off — the case the whole model
  // exists for: the report renders in full and the entry is still flagged,
  // because attendance is the mandatory half and it is missing.
  {
    kind: "past",
    report: COMMAND_BLOCKS_REPORT,
  },

  // Started and abandoned: three marked, six still unanswered. The state a
  // partial save leaves behind — the entry keeps its alert, reports "3 of 9
  // marked", and reopens on the three marks rather than on a blank sheet.
  {
    kind: "past",
    partial: {
      present: [SESSION_FEED_GAMER_IDS.aino, SESSION_FEED_GAMER_IDS.vaino],
      absent: [SESSION_FEED_GAMER_IDS.oskar],
    },
    report:
      "# Mob-proofing night\n\nWe lit the paths, walled the gaps and got through a whole session without losing anybody to a creeper — which has not happened before.",
  },

  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.siiri, SESSION_FEED_GAMER_IDS.hilda],
    report: REDSTONE_WEEK_REPORT,
    // Light structure, because the gedu note is markdown too now and a
    // handover to whoever runs the room next is naturally a short list.
    staffNote:
      "**Two things for next week:**\n\n- Siiri was quiet again and dropped out of the call twice without saying anything. Worth a word with her parents if it carries on.\n- Laptops 3 and 5 couldn't hear shared audio for the first ten minutes. Check the room setup before the group arrives.",
  },

  // Marked off to the last child and never written up — and **flagged for it**.
  // This is the state the change to the rules is about: the register is
  // finished, so the old model called this session done, but the families whose
  // page renders the report see a blank week. The gedu note here is not a
  // substitute, because nobody outside staff can read it.
  {
    kind: "past",
    allPresent: true,
    staffNote:
      "Ran short — the school hall overran and we lost the first fifteen minutes. Still owe the write-up for this one.",
  },

  {
    kind: "past",
    allPresent: true,
    report: BUILD_BATTLE_REPORT,
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
    report:
      "# A housekeeping week\n\nA few were away, so we used the session to tidy up rather than start anything new.\n\n- Cleared and replanted the spawn area\n- Fixed the paths people kept falling off\n- Agreed some ground rules about building on each other's plots\n\nHilda started a shared library that anyone can add books to. It already has four, two of which are just the word \"hello\" repeated.",
  },

  // Before the epoch, and recorded anyway: a gedu went back over an old
  // session. It renders as a normal past entry and wears no alert, because the
  // platform never asked for it — the one state that proves the epoch gates
  // what is *owed* rather than what is editable.
  {
    kind: "past",
    owed: false,
    partial: { present: [SESSION_FEED_GAMER_IDS.aino] },
    report: `# Before we kept records

Written up long after the fact, from memory and the world save. Half the register is guesswork, so it stays half-marked.`,
  },

  // Before the epoch and untouched: nothing was ever expected here, so nothing
  // is owed — and it still opens the same editor as any other past session.
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
 * **A spec list with no future entries at all is dated entirely behind `now`.**
 * It used to be floored at one, which quietly dated the newest of a purely
 * historical run *in the future* — so a fixture asking for six past camp days
 * got five past days and a sixth that had not happened, wearing past styling and
 * an attendance sheet. Zero means zero: the run starts at the occurrence before
 * the next one and walks back from there.
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

  const futureLength = Math.min(Math.max(futureCount, 0), count);
  const starts: Date[] = new Array<Date>(count);
  if (futureLength === 0) {
    // Nothing ahead of us: the head of the list is the occurrence *before* the
    // next one, which is the most recent session that has actually happened.
    starts[0] = backward(next);
  } else {
    starts[futureLength - 1] = next;
    for (let i = futureLength - 2; i >= 0; i--) starts[i] = forward(starts[i + 1]);
  }
  for (let i = Math.max(futureLength, 1); i < count; i++) {
    starts[i] = backward(starts[i - 1]);
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

/**
 * The placeholder a fixture report writes where its own session's date goes.
 *
 * Real reports open with a dated title line, and a fixture that hardcoded one
 * would print a date next to a session card showing a different one — which
 * looks like a bug rather than like sample copy. The specs are written before
 * any date is known, so they leave a slot and the builder fills it in from the
 * occurrence the report actually lands on.
 */
export const REPORT_DATE_PLACEHOLDER = "{date}";

/** `d.M.yyyy` in the club's own zone — how a Finnish gedu writes a date. */
function resolveReportDate(report: string | undefined, startsAt: Date): string | null {
  if (report === undefined) return null;
  return report.replaceAll(
    REPORT_DATE_PLACEHOLDER,
    formatInTimeZone(startsAt, TIMEZONE, "d.M.yyyy"),
  );
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
        report: resolveReportDate(spec.report, startsAt),
        staffNote: spec.staffNote ?? null,
        // Empty on every ordinary future session — nothing can be marked
        // before one starts. Populated only to build the live case, whose
        // register is open because the session is running.
        attendance: Object.fromEntries(
          (spec.present ?? []).map((id) => [id, "present" as const]),
        ),
      };
    case "past":
      return {
        kind: "past",
        id,
        startsAt,
        endsAt,
        owed: spec.owed ?? true,
        report: resolveReportDate(spec.report, startsAt),
        staffNote: spec.staffNote ?? null,
        attendance: marksForSpec(spec),
      };
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
