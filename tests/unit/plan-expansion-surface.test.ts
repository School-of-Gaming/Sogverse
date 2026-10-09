import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **A product's sessions are expanded in one place, the database's
 * `planned_session_dates`, and nothing under `src/` walks a schedule again.**
 *
 * Every reader of the plan is handed its dates; a second expansion in
 * TypeScript is how two surfaces come to disagree about which days a club
 * meets — and how a date the database leaves out of the plan (a holiday) would
 * come back on one page and not another. The database half of this guard is
 * the catalog check in `tests/db/planned-sessions.test.ts`; this is the
 * TypeScript half.
 *
 * **What it looks for is the one ingredient every walk needs: turning a date
 * into a weekday.** A schedule is weekdays and clock faces, so a walk has to ask
 * of each date it steps over which weekday that is — through `getDay()`,
 * `getUTCDay()`, date-fns' `getDay`/`getISODay` or a weekday format token,
 * the calendar-date helper `weekdayOf`, or the schedule
 * resolvers in `src/lib/schedule-occurrence.ts`. Not every such read is a walk,
 * so the check classifies rather than bans: every file that reads one either
 * carries a written reason here, or fails. The enumeration is a filesystem
 * walk, never a list, so a new file is found the day it appears.
 *
 * The retired expanders themselves are banned outright, with no allowlist:
 * there is no reason left for any file to name them.
 */

const SRC = join(process.cwd(), "src");

/** Extensions the walk reads: code, since a weekday read in prose walks nothing. */
const EXTENSIONS = [".ts", ".tsx"];

/** Reads that turn a date into a weekday — the ingredient of every walk. */
const WEEKDAY_READS: readonly RegExp[] = [
  /\.get(?:UTC)?Day\(\)/,
  // date-fns' `getDay(date)` and `getISODay(date)`.
  /\bget(?:ISO)?Day\(/,
  // A date-fns format string carrying a weekday token (`E`, `e`, `c`, `i`
  // runs), as a string argument of `format` or `formatInTimeZone`. The token
  // must stand alone between non-alphanumerics, so a zone name or a
  // `yyyy-MM-dd` pattern never matches.
  /\bformat(?:InTimeZone)?\((?:(?:[^();]|\([^();]*\))*?,\s*)?["'`][^"'`\n]*(?<![A-Za-z0-9#])(?:E{1,5}|e{1,5}|c{1,5}|i{1,5})(?![A-Za-z0-9])[^"'`\n]*["'`]/,
  /\bweekdayOf\(/,
  /\bnextOccurrenceInstant\(/,
  /\bviewerWeekdayIndex\(/,
];

/** The expanders the plan replaced, and the modules that held them. */
const RETIRED: readonly RegExp[] = [
  /\bgetNextSessionStart\b/,
  /\bstepBackOneWeek\b/,
  /\benumerateRowOccurrences\b/,
  /\benumeratePastRowOccurrences\b/,
  /\bgetCurrentInProgressOccurrence\b/,
  /\bfinalSessionDate\b/,
  /\bcapPastCancellations\b/,
  /\bsplitAtNextRunning\b/,
  /\boccurrenceOnDate\b/,
  /\bcomputeSessionWindow\b/,
  /\bprojectMonthDates\b/,
  /\bweekdayOccurrences\b/,
  /\btopicPrepWindowEndFromSchedule\b/,
  /["']@\/lib\/enrollment["']/,
  /["']@\/lib\/session-schedule["']/,
  /["']@\/lib\/session-date-occurrence["']/,
];

const FIXTURE =
  "Preview fixtures: a fixture has no database to ask, so it builds the slots and the plan a scene renders from `now`. Nothing a user reads comes from here.";

/**
 * **Files that read a weekday off a date and are not a plan expansion**, each
 * with the reason. Write the sentence you would want to read in a review: "not
 * an expansion" is not a reason; *why* it is not one is.
 *
 * A `Map` rather than an object literal, because the keys are paths a walk
 * produced: an object answers `constructor` off its prototype chain.
 */
const NOT_AN_EXPANSION = new Map<string, string>([
  [
    "lib/calendar-date.ts",
    "Defines `weekdayOf` and `mondayOf`, the calendar primitives: a weekday of one bare date, and the Monday of its week. They walk nothing on their own; every caller is classified here in its own right.",
  ],
  [
    "lib/session-dates.ts",
    "The admin product form's date snapping: the first and last session day of a term an admin is still typing, and whether a typed date falls on a slot. The product is unsaved, so there is no plan in the database to read yet, and the walk is at most six days.",
  ],
  [
    "components/admin/products/product-build.ts",
    "The admin form's single-date product: its one slot takes the weekday of the date the admin picked. That writes a slot, it does not expand one.",
  ],
  [
    "lib/calendar-invitations/invitation.ts",
    "Evaluates the RRULE the mailed invitation states — what a calendar client will expand it to — and compares that with the plan it was handed, so every date the rule produces and the plan does not hold becomes an EXDATE. Expanding the RRULE format is the point; the sessions themselves come from the plan.",
  ],
  [
    "lib/email-templates/calendar-invitation.ts",
    "The calendar invite explorer in the admin's email testing page: a laboratory for iCalendar properties with no product behind it. It checks a typed override against the typed rule's weekdays and suggests an upcoming Monday as a placeholder date.",
  ],
  [
    "lib/email-templates/registry.ts",
    "The admin's test send of the product confirmation mail: the form has no product row, so it stands in for the database's plan with the typed slots over the composer's window. A live send reads the real plan.",
  ],
  [
    "lib/products/format-product-schedule.ts",
    "Display: a weekly schedule line converted into the viewer's zone needs a concrete date per slot to resolve the offset, and re-groups the converted weekdays. It names the pattern; it lists no sessions.",
  ],
  [
    "lib/schedule-occurrence.ts",
    "The zone conversion primitives behind the schedule display: one slot's next instant, a single known date's instant, and an instant's weekday in the viewer's zone. None of them lists sessions.",
  ],
  [
    "lib/products/product-json-ld.ts",
    "Counts the dates the plan handed it per weekday, to state how many sessions each weekly slot holds. The dates are the plan's; it only asks which weekday each one is.",
  ],
  [
    "components/admin/dashboard/build-admin-dashboard-data.ts",
    "Places each planned session the dashboard document carries in its weekday column of the viewer's calendar. The sessions are the plan's; it only asks which weekday each one falls on for the viewer.",
  ],
  ["components/preview/fixture-clock.ts", FIXTURE],
  ["components/admin/dashboard/mock-dashboard-fixtures.ts", FIXTURE],
  ["components/family/product-page/mock-fixtures.ts", FIXTURE],
  ["components/gedu/mock-substitutions-fixtures.ts", FIXTURE],
  ["components/gedu/session-feed/mock-fixtures.ts", FIXTURE],
  [
    "lib/substitution-notifications/slack-preview.ts",
    "The Slack message preview's sample request: a fixture product whose one slot sits on the sample session's weekday. Nothing a gedu or an admin receives comes from here.",
  ],
]);

interface Scanned {
  readsWeekday: boolean;
  namesRetired: boolean;
}

/** Every code file under `src/`, with what its bytes do of the two. */
function scanSource(): Map<string, Scanned> {
  const scanned = new Map<string, Scanned>();

  const walk = (dir: string): void => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks a fixed in-repo directory (src/) from a path built out of cwd and a literal, no external input; the walk IS the regeneration command this check is built on
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file the fixed in-repo walk above discovered
      const source = readFileSync(full, "utf8");
      scanned.set(relative(SRC, full).split(sep).join("/"), {
        readsWeekday: WEEKDAY_READS.some((pattern) => pattern.test(source)),
        namesRetired: RETIRED.some((pattern) => pattern.test(source)),
      });
    }
  };

  walk(SRC);
  return scanned;
}

describe("the plan is expanded in one place, never in TypeScript", () => {
  // Walked once, while the suite is collected: a test's time limit is for its
  // assertion, and a walk of the whole tree under a loaded run can outlast it.
  const scanned = scanSource();
  const weekdayReaders = [...scanned]
    .filter(([, file]) => file.readsWeekday)
    .map(([path]) => path);

  it("finds the surface at all", () => {
    // A walk that matched nothing would make every assertion below vacuous.
    expect(weekdayReaders.length).toBeGreaterThan(5);
  });

  it("names none of the retired expanders anywhere", () => {
    const offenders = [...scanned]
      .filter(([, file]) => file.namesRetired)
      .map(([path]) => path)
      .sort();

    expect(
      offenders,
      "These files name an expander the database's plan replaced. Read the planned dates the\n" +
        "database hands over instead (src/lib/planned-sessions.ts):\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  it("classifies every file that reads a weekday off a date", () => {
    const unclassified = weekdayReaders
      .filter((path) => !NOT_AN_EXPANSION.has(path))
      .sort();

    expect(
      unclassified,
      "These files turn a date into a weekday without an annotation. If they walk a schedule into\n" +
        "dates, read the plan the database hands over instead; if they do not, add an entry to\n" +
        "NOT_AN_EXPANSION in this file saying why:\n  " +
        unclassified.join("\n  "),
    ).toEqual([]);
  });

  it("keeps the annotated list honest — no entry outlives its file", () => {
    const stale = [...NOT_AN_EXPANSION.keys()].filter(
      (path) => scanned.get(path)?.readsWeekday !== true,
    );

    expect(
      stale,
      "These NOT_AN_EXPANSION entries no longer describe anything — the file is gone, or it " +
        "no longer reads a weekday off a date. Delete them:\n  " +
        stale.join("\n  "),
    ).toEqual([]);
  });

  it("gives every annotation a real reason", () => {
    const thin = [...NOT_AN_EXPANSION.entries()]
      .filter(([, reason]) => reason.trim().length < 40)
      .map(([path]) => path);

    expect(thin).toEqual([]);
  });
});
