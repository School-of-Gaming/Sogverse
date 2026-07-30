/**
 * Date/time labels for a feed entry.
 *
 * A session is a date *plus a clock face*, so it converts: every label renders
 * in the **viewer's** zone, never the runtime default and never the product's
 * authoring zone. When those two differ the viewer's short zone abbreviation is
 * surfaced next to the clock so the adjustment is visible rather than silent
 * (the abbreviation comes out of `Intl`, already locale-formatted, so it is not
 * a translated string).
 */

import { formatDate, formatTime } from "@/lib/utils";

export interface SessionLabels {
  /** e.g. "Mon 12 Jan" — or "Mon 12 Jan 2025" once the year stops being obvious. */
  date: string;
  /** e.g. "16:30–18:00", already in the viewer's zone. */
  timeRange: string;
  /** Just the start, e.g. "16:30" — for callers that want the two apart. */
  startTime: string;
  /** Viewer's short zone abbrev, or `null` when it matches the source zone. */
  timeZoneAbbrev: string | null;
}

export function formatSessionLabels(
  session: { startsAt: Date; endsAt: Date },
  opts: {
    locale: string;
    /** Viewer's IANA zone — every label is rendered in this. */
    timeZone: string;
    /** The zone the schedule was authored in (products are authored locally). */
    sourceTimeZone: string;
    /** Request-stable "now"; only decides whether the year needs spelling out. */
    now: Date;
  },
): SessionLabels {
  const { locale, timeZone, sourceTimeZone, now } = opts;

  // A weekly feed scrolls back through a term, and eventually across New Year.
  // Showing the year on every row would be noise, so it appears only once the
  // entry is no longer in the viewer's current year.
  const sameYear =
    yearIn(session.startsAt, locale, timeZone) === yearIn(now, locale, timeZone);

  const startTime = formatTime(session.startsAt, locale, timeZone);

  return {
    date: formatDate(session.startsAt, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
      timeZone,
    }),
    startTime,
    // En dash, matching the date-range separator used elsewhere in the app.
    timeRange: `${startTime}–${formatTime(session.endsAt, locale, timeZone)}`,
    timeZoneAbbrev:
      timeZone === sourceTimeZone
        ? null
        : shortTimeZoneName(session.startsAt, locale, timeZone),
  };
}

/**
 * "March 2026" for a feed month divider, in the viewer's zone.
 *
 * The year is always spelled out: a divider exists precisely because the reader
 * is scrolling far enough back to lose track, and "March" alone is ambiguous the
 * moment a club has run for more than a year. Built through `Intl` rather than
 * concatenated, so the month word and its order follow the locale.
 */
export function formatMonthLabel(
  instant: Date,
  locale: string,
  timeZone: string,
): string {
  return formatDate(instant, locale, {
    month: "long",
    year: "numeric",
    timeZone,
  });
}

function yearIn(date: Date, locale: string, timeZone: string): string {
  return formatDate(date, locale, { year: "numeric", timeZone });
}

function shortTimeZoneName(
  date: Date,
  locale: string,
  timeZone: string,
): string | null {
  const part = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? null;
}
