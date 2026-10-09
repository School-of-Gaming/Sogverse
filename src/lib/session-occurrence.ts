import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * A session's identity, and the instant a product's term ends.
 *
 * Every feed lays stored rows over the plan the database hands it, and both
 * sides of that merge have to name the same session the same way; these are
 * the helpers they name it with. None of them expands a schedule — the plan is
 * expanded once, in the database (`src/lib/planned-sessions.ts`).
 */

/**
 * `YYYY-MM-DD` as the instant falls in the **product's own zone**.
 *
 * The zone is the product's rather than the viewer's because this is an
 * identity, not a rendering: it is the key a stored row and a planned session
 * meet on, and both sides of that merge have to name the same day whoever is
 * looking. Anything shown to a reader converts to the viewer's zone later, from
 * the instant.
 */
export function productLocalDate(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/**
 * A feed entry's stable id: the group, and the product-local date it
 * happened on.
 *
 * **A session is a (group, product-local date)** — that is the row's
 * unique key in Postgres and it is the entry's identity here, so a
 * planned session and a row for the same day are the same thing and meet on
 * the same map key. Deliberately not the row's primary key, because most
 * entries have no row, and the ones that do acquire one the moment
 * anything is written against them — which would change the id of the
 * card being typed into. `${group}:${date}` is the same string before and
 * after materialization, which is what lets a scroll anchor, an open
 * editor and React's own reconciliation survive a save.
 *
 * The date also survives the most common schedule edit there is —
 * somebody fixing the time of day — which keying by instant or by slot
 * start would not.
 */
export function sessionEntryId(groupId: string, sessionDate: string): string {
  return `${groupId}:${sessionDate}`;
}

/**
 * Inclusive UTC cutoff for `endDate`'s local end-of-day in `timezone`: the
 * last moment of a product's term. End-of-day rather than start-of-day keeps a
 * session that falls on `end_date` itself inside the term.
 */
export function endDateToCutoff(
  endDate: string | null,
  timezone: string,
): Date | null {
  if (endDate === null) return null;
  return fromZonedTime(`${endDate}T23:59:59.999`, timezone);
}
