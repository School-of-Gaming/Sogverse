import { formatInTimeZone } from "date-fns-tz";
import { addCalendarDays, mondayOf } from "@/lib/calendar-date";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { occurrenceOnDate } from "@/lib/session-date-occurrence";
import {
  OPEN_ENDED_OCCURRENCE_CAP,
  endDateToCutoff,
  enumerateRowOccurrences,
  productLocalDate,
  sessionEntryId,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { GeduAssignmentRow } from "@/lib/gedu-assignment-rollup";
import type { ProductType } from "@/types";

/**
 * **The sessions a gedu is expected at and could file an absence for**, built
 * from the seats they already hold.
 *
 * The Substitutions page offers a second way into "I can't make this session" —
 * a picker, for a gedu who knows the date they cannot make and does not want to
 * go and find its card — and this is the list that picker is over. It is the
 * *same* schedule expansion every other surface uses (`session-occurrence`),
 * handed the *same* assignment rows the dashboard's roll-up consumes, so the
 * picker cannot offer a session the group's own feed does not have: the client
 * owns the calendar math here as it does everywhere, and a second expansion is
 * exactly what this module exists not to be.
 *
 * Pure, and the clock enters as an argument.
 */

/** One session the viewer holds a seat at, in the shape a picker row renders. */
export interface GeduUpcomingSession {
  /**
   * `${group}:${date}` — the session's own identity everywhere in the app, and
   * the key the write is made on.
   */
  key: string;
  groupId: string;
  /** Product-local `YYYY-MM-DD`, which is what the write is keyed by. */
  sessionDate: string;
  /** When it runs. Never null: a session with no instant is not offered. */
  startsAt: Date;
  endsAt: Date;
  /** The product's own zone, which `sessionDate` is a date in. */
  timezone: string;
  productId: string;
  /** Translated, in the viewer's locale, exactly as a card resolves one. */
  productName: string;
  productType: ProductType;
  /** The viewer's group on this product, or `null` while it is unknown. */
  groupName: string | null;
  isRemote: boolean;
  /** The building, on an in-person product; `null` on a remote one. */
  siteName: string | null;
}

/**
 * The viewer's own upcoming sessions, **soonest first**.
 *
 * **How far ahead is not this module's decision.** It is the app's one
 * forward-looking rule, the one every list of what is coming already uses: an
 * open-ended product projects its next {@link OPEN_ENDED_OCCURRENCE_CAP}
 * occurrences and a dated one projects everything up to its end date. The cap
 * is imported rather than restated, so the picker cannot drift from the feed
 * whose cards carry the same action.
 *
 * Both kinds of seat are walked, because both are seats the viewer is expected
 * at and can file against: a standing **assignment** contributes the
 * occurrences that rule projects, and a live **substitution** contributes the
 * one afternoon it covers. That is the same pair the card's own condition
 * admits — a sub asking for a sub is the case — so the picker and the cards
 * offer the same set.
 *
 * A session already finished is not in the list: the walk carries no window
 * past an occurrence's end (`windowCloseMs: 0`), which is the card's rule too —
 * the entry's kind flips at the session's end, and a finished card offers
 * nothing. A session **in progress** is still offered, on both surfaces, for
 * the same reason the write accepts it: the database's test is the date.
 *
 * One entry per (group, date). Two slots landing on one calendar day are one
 * session as far as Postgres is concerned — that pair is the row's unique key —
 * so the earlier instant wins and the later is dropped rather than offering two
 * rows whose write is the same write.
 */
export function buildGeduUpcomingSessions({
  rows,
  locale,
  now,
}: {
  rows: readonly GeduAssignmentRow[];
  locale: SupportedLocale;
  now: Date;
}): GeduUpcomingSession[] {
  const bySession = new Map<string, GeduUpcomingSession>();

  for (const row of rows) {
    const timezone = row.product.timezone;
    const occurrences =
      row.kind === "substitution"
        ? substitutionOccurrence(row, now)
        : enumerateRowOccurrences({
            slots: row.slots,
            timezone,
            now,
            startBoundary: startDateToCutoff(row.product.startDate, timezone),
            endBoundary: endDateToCutoff(row.product.endDate, timezone),
            // The app's forward-looking rule, both halves of it: a run with a
            // last day is walked to that day, and an open-ended one stops at
            // the cap — which is also what stops the uncapped walk from being
            // an unbounded one.
            cap:
              row.product.endDate === null
                ? OPEN_ENDED_OCCURRENCE_CAP
                : Number.POSITIVE_INFINITY,
            // No grace after the end: a session that has finished is not one
            // anybody can be absent from, and the card stops offering at the
            // same instant.
            windowCloseMs: 0,
          });

    for (const occurrence of occurrences) {
      const sessionDate = productLocalDate(occurrence.start, timezone);
      const key = sessionEntryId(row.groupId, sessionDate);
      const existing = bySession.get(key);
      if (
        existing !== undefined &&
        existing.startsAt.getTime() <= occurrence.start.getTime()
      ) {
        continue;
      }
      bySession.set(key, {
        key,
        groupId: row.groupId,
        sessionDate,
        startsAt: occurrence.start,
        endsAt: occurrence.end,
        timezone,
        productId: row.product.id,
        productName:
          resolveTranslation(row.product.translations, locale)?.name ?? "",
        productType: row.product.productType,
        groupName: row.groupName,
        isRemote: row.product.isRemote,
        // Never carried by a remote product, whatever the row says: a product
        // with a voice room has no building, and a row showing both would be
        // claiming the group meets in two places.
        siteName: row.product.isRemote ? null : row.siteName,
      });
    }
  }

  return [...bySession.values()].sort(bySoonest);
}

/**
 * The one afternoon a substitution seat covers, if it is still ahead —
 * otherwise nothing.
 *
 * It is one dated seat rather than a schedule, so the forward rule above has
 * nothing to say about it: what bounds it is the substitution's own date, and
 * the database stopped returning the seat once it expired.
 *
 * A date the schedule no longer projects resolves to no occurrence at all, and
 * such a seat is left out rather than offered dateless: the write is refused
 * for a session the schedule does not name, so a row for it could only ever
 * fail.
 */
function substitutionOccurrence(
  row: GeduAssignmentRow,
  now: Date,
): Array<{ start: Date; end: Date }> {
  if (row.substitutionDate === null) return [];
  const occurrence = occurrenceOnDate({
    sessionDate: row.substitutionDate,
    slots: row.slots,
    timezone: row.product.timezone,
  });
  if (occurrence === null) return [];
  if (occurrence.end.getTime() <= now.getTime()) return [];
  return [occurrence];
}

/** Soonest first, then by product name, then by group — a total order. */
function bySoonest(a: GeduUpcomingSession, b: GeduUpcomingSession): number {
  const byStart = a.startsAt.getTime() - b.startsAt.getTime();
  if (byStart !== 0) return byStart;
  const byName = a.productName.localeCompare(b.productName);
  if (byName !== 0) return byName;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/**
 * ============================================================================
 * Weeks
 * ============================================================================
 *
 * Five weekly clubs over a term is sixty-odd rows, and a reader who is ill
 * tomorrow should not scroll a term to say so. So the list is grouped by the
 * week each session falls in **in the viewer's own zone**, and the surface
 * opens on the two weeks almost every absence is in.
 */

/** One week's worth of the list, in the order the sessions run. */
export interface GeduUpcomingSessionWeek {
  /** The Monday the week starts on, as a bare `YYYY-MM-DD`. */
  weekStart: string;
  sessions: GeduUpcomingSession[];
}

/**
 * The Monday of the week an instant falls in, **for a reader in `timeZone`**.
 *
 * Two steps, and the split is the point: the instant becomes a calendar date in
 * the *viewer's* zone (which is what decides whether a 23:30 Sunday session is
 * this week or next for them), and the Monday is then found by bare-date
 * arithmetic, which is UTC-pinned and therefore exact across a DST week. Doing
 * the week step on a zoned clock instead is the arithmetic the date rules ban:
 * a local week is 168 hours except twice a year.
 */
export function viewerWeekStart(instant: Date, timeZone: string): string {
  return mondayOf(formatInTimeZone(instant, timeZone, "yyyy-MM-dd"));
}

/**
 * The sessions grouped into weeks, ascending, **with empty weeks absent**.
 *
 * A gap between two weeks is a gap in the schedule, and a heading over nothing
 * is furniture claiming there is something under it. The sessions arrive
 * ordered, so each week's own order is inherited rather than re-sorted.
 */
export function groupSessionsByWeek(
  sessions: readonly GeduUpcomingSession[],
  timeZone: string,
): GeduUpcomingSessionWeek[] {
  const weeks = new Map<string, GeduUpcomingSession[]>();
  for (const session of sessions) {
    const weekStart = viewerWeekStart(session.startsAt, timeZone);
    const bucket = weeks.get(weekStart);
    if (bucket === undefined) weeks.set(weekStart, [session]);
    else bucket.push(session);
  }
  return [...weeks.entries()]
    .map(([weekStart, weekSessions]) => ({ weekStart, sessions: weekSessions }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

/**
 * Which weeks the picker opens on: **this one and the next**.
 *
 * That is where an absence almost always is — somebody is ill tomorrow, or has
 * something on next Tuesday — and it is the shortest list that answers the
 * common case without a scroll. A holiday six weeks out is the other case and
 * it is one press away.
 *
 * **A term that has not started yet would otherwise open on nothing**, so where
 * neither of those two weeks carries a session the first two weeks that do are
 * shown instead. The answer is always a prefix of the list: weeks are
 * ascending, and revealing the rest appends below what is already on screen.
 */
export function initiallyShownWeeks(
  weeks: readonly GeduUpcomingSessionWeek[],
  now: Date,
  timeZone: string,
): string[] {
  const thisWeek = viewerWeekStart(now, timeZone);
  const nextWeek = addCalendarDays(thisWeek, 7);
  const near = weeks
    .filter((week) => week.weekStart === thisWeek || week.weekStart === nextWeek)
    .map((week) => week.weekStart);
  if (near.length > 0) return near;
  return weeks.slice(0, 2).map((week) => week.weekStart);
}

/**
 * Which of the three headings a week takes, so the component names it and this
 * module never holds a translated word.
 */
export function weekHeadingKind(
  weekStart: string,
  now: Date,
  timeZone: string,
): "this" | "next" | "later" {
  const thisWeek = viewerWeekStart(now, timeZone);
  if (weekStart === thisWeek) return "this";
  if (weekStart === addCalendarDays(thisWeek, 7)) return "next";
  return "later";
}
