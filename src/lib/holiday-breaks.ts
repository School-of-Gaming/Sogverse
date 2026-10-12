import { z } from "zod";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { plannedSessionRow, type PlannedSession } from "@/lib/planned-sessions";

/**
 * The app's side of a club's holiday breaks.
 *
 * A holiday is never planned, so a document's `planned_sessions` simply lacks
 * those dates; `holiday_breaks` beside it says why. Each entry is one break of
 * a holiday calendar the product follows that touches the document's span,
 * with its name in every locale the admin wrote and the plan rows it withdrew
 * inside that span. The database never picks a locale: `breakName` does, the
 * way every other authored per-locale name is resolved.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One break as `holiday_breaks_document` emits it. */
export const holidayBreakRow = z
  .object({
    id: z.string(),
    /** Bare calendar dates, both inclusive — UTC-pinned, never re-anchored. */
    start_date: isoDate,
    end_date: isoDate,
    /** Every locale written, in no particular order; never empty for real data. */
    names: z.array(z.object({ locale: z.string(), name: z.string() }).strict()),
    /**
     * The plan rows inside the document's span that this break removed,
     * soonest first. Empty when the term or the schedule never reaches the
     * break; where two calendars' breaks overlap, a date is withdrawn by the
     * earlier break alone.
     */
    withdrawn_sessions: z.array(plannedSessionRow),
  })
  // Strict, because the family document is strict at every level.
  .strict()
  .transform((row) => ({
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    names: row.names,
    withdrawnSessions: row.withdrawn_sessions,
  }));

export type HolidayBreak = z.output<typeof holidayBreakRow>;

export const holidayBreakRows = z.array(holidayBreakRow);

/**
 * The break's name for a reader of `locale`: theirs, else English, else the
 * first one written. Empty only for a break with no name at all, which the
 * calendar writers refuse.
 */
export function breakName(
  row: { names: readonly { locale: string; name: string }[] },
  locale: SupportedLocale,
): string {
  return resolveTranslation(row.names, locale)?.name ?? "";
}

/**
 * The break a product-local `YYYY-MM-DD` falls in, or `null`. The earliest,
 * when two overlap on it — the one `planned_session_dates` tags the date with.
 * `rows` are in the documents' order, by first day.
 */
export function breakContaining<T extends Pick<HolidayBreak, "startDate" | "endDate">>(
  rows: readonly T[],
  date: string,
): T | null {
  return rows.find((row) => row.startDate <= date && date <= row.endDate) ?? null;
}

/**
 * One break as a session feed draws it: the break, and the instants of the
 * first and last session it withdrew that the feed would otherwise have shown.
 */
export interface HolidayFeedBreak {
  row: HolidayBreak;
  /** The start of the first withdrawn session the feed keeps. */
  startsAt: Date;
  /** The end of the last withdrawn session the feed keeps. */
  endsAt: Date;
}

/**
 * The breaks a feed shows, each placed by the sessions it withdrew.
 *
 * A break is drawn only where it took away a session the reader would have
 * seen, so `inSpan` is asked of every withdrawn session — the feed's own
 * horizon (an open-ended product's cut, a cancelled membership's paid window)
 * — and a break left with none is dropped. Its instants are the first kept
 * session's start and the last kept one's end, which is what places it in
 * date order among the sessions and on one side of the present.
 */
export function breaksInFeed(
  rows: readonly HolidayBreak[],
  inSpan: (session: PlannedSession) => boolean,
): HolidayFeedBreak[] {
  const shown: HolidayFeedBreak[] = [];
  for (const row of rows) {
    const kept = row.withdrawnSessions.filter(inSpan);
    if (kept.length === 0) continue;
    shown.push({
      row,
      startsAt: new Date(Math.min(...kept.map((session) => session.startsAt.getTime()))),
      endsAt: new Date(Math.max(...kept.map((session) => session.endsAt.getTime()))),
    });
  }
  return shown;
}
