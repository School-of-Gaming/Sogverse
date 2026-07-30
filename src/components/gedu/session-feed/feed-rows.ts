/**
 * Turning a run of feed entries into the rows the feed actually renders.
 *
 * A term of weekly sessions is a readable scroll; a year of them is a wall of
 * near-identical dates. Month dividers are what make the long version
 * scannable — they give the eye a place to land and a way to say "that was
 * around March" without reading a single date. Deriving them here (rather than
 * inside the component) keeps the boundary arithmetic testable and keeps the
 * feed presentational.
 *
 * Pure: no React, no clock, no locale. The month *key* is computed in the
 * viewer's zone — a session at 00:30 local on 1 March belongs to March for the
 * person reading it, not to whatever month it was in UTC — and the row carries
 * the entry's own instant so the component can render the label through the
 * shared `Intl` label helpers.
 */

import { formatInTimeZone } from "date-fns-tz";

export type SessionFeedRow<T extends { startsAt: Date }> =
  | { kind: "entry"; key: string; entry: T }
  | {
      kind: "month";
      key: string;
      /**
       * An instant inside the month being labelled — the first entry of it.
       * The component formats this in the viewer's zone.
       */
      startsAt: Date;
    };

/**
 * Interleave month dividers into a descending run of entries.
 *
 * A divider is emitted whenever two consecutive entries fall in different
 * months, labelled with the month the reader is scrolling *into*. There is
 * deliberately no divider above the first entry: the top of the feed is the
 * current month, which the dates right there already say, and a leading divider
 * would push the newest session — the whole point of the surface — down a row.
 */
export function withMonthDividers<T extends { id: string; startsAt: Date }>(
  entries: readonly T[],
  timeZone: string,
): SessionFeedRow<T>[] {
  const rows: SessionFeedRow<T>[] = [];
  let previousMonth: string | null = null;

  for (const entry of entries) {
    const month = monthKey(entry.startsAt, timeZone);
    if (previousMonth !== null && month !== previousMonth) {
      rows.push({ kind: "month", key: `month-${month}`, startsAt: entry.startsAt });
    }
    rows.push({ kind: "entry", key: entry.id, entry });
    previousMonth = month;
  }

  return rows;
}

/** `YYYY-MM` as the instant falls in `timeZone`. */
export function monthKey(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM");
}
