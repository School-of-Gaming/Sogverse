import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";

/**
 * Shared building blocks for resolving "what session does this slot
 * point to right now?" — the bit of expansion logic both
 * `expandUpcomingSessions` (parent/gamer) and
 * `expandAssignedProductsToCards` (gedu) need.
 *
 * Each consumer handles iteration differently (parent/gamer emits N
 * future occurrences per slot, gedu collapses to the soonest), so we
 * share the awkward pieces — the prev-week-in-window check and the
 * date-to-cutoff conversions — and let the callers iterate.
 */

export interface SlotShape {
  weekday: number;
  startTime: string;
  durationMinutes: number;
}

/**
 * If the slot's *previous* occurrence is still inside its voice window
 * right now (and within the product's start/end-date bounds), return
 * it. Otherwise null — callers fall through to `getNextSessionStart`
 * for the soonest future occurrence.
 *
 * Why this exists at all: `getNextSessionStart` always returns a
 * *future* occurrence — once today's start has passed, it skips to next
 * week. That hides currently-in-progress sessions from upcoming lists.
 * Mirroring `computeSessionWindow`, we check the prev-week candidate
 * explicitly.
 *
 * Why the DST-safe back-step: a flat `now - 7×24h` lands one hour off
 * on the DST-transition Wednesday (Helsinki EET→EEST is the live
 * example) — the back-stepped point sits *after* last week's slot
 * start in local time, so `getNextSessionStart` returns last week's
 * already-finished session and the in-window check fails. Today's
 * in-progress session disappears from the dashboard. `toZonedTime`
 * returns a Date whose LOCAL methods read the wall-clock in
 * `timezone`, so manipulating via `setDate(... - 7)` subtracts 7
 * calendar days in tz; the `fromZonedTime` round-trip back gives the
 * correct UTC instant regardless of system tz. Regression coverage
 * lives in `tests/unit/lib/upcoming-sessions.test.ts`.
 *
 * Returns null when the product hasn't started yet
 * (`startBoundary > now`) — no prev-week occurrence can be in
 * progress in that case.
 */
export function getCurrentInProgressOccurrence(args: {
  slot: SlotShape;
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  windowCloseMs: number;
}): { start: Date; end: Date } | null {
  const { slot, timezone, now, startBoundary, endBoundary, windowCloseMs } = args;

  if (startBoundary !== null && startBoundary.getTime() > now.getTime()) {
    return null;
  }

  const schedule = {
    dayOfWeek: slot.weekday,
    startTime: slot.startTime,
    timezone,
  };
  const durationMs = slot.durationMinutes * 60_000;

  const zonedWeekAgo = toZonedTime(now, timezone);
  zonedWeekAgo.setDate(zonedWeekAgo.getDate() - 7);
  const prevSearchPoint = fromZonedTime(zonedWeekAgo, timezone);

  const prevStart = getNextSessionStart(schedule, { now: prevSearchPoint });
  const prevEnd = new Date(prevStart.getTime() + durationMs);

  const withinWindow = prevEnd.getTime() + windowCloseMs > now.getTime();
  const afterStart =
    startBoundary === null || prevStart.getTime() >= startBoundary.getTime();
  const beforeEnd =
    endBoundary === null || prevStart.getTime() <= endBoundary.getTime();

  if (withinWindow && afterStart && beforeEnd) {
    return { start: prevStart, end: prevEnd };
  }
  return null;
}

/**
 * Turn a product's wall-clock start_date (YYYY-MM-DD in `timezone`) into
 * the UTC instant of that local day's midnight. Sessions whose start is
 * at or after this instant qualify; anything earlier is before the
 * product actually begins running.
 */
export function startDateToCutoff(
  startDate: string | null,
  timezone: string,
): Date | null {
  if (startDate === null) return null;
  return fromZonedTime(`${startDate}T00:00:00.000`, timezone);
}

/**
 * Inclusive UTC cutoff for `endDate`'s local end-of-day in `timezone`.
 * Any session whose start is on or before this instant counts. End-of-
 * day rather than start-of-day keeps a slot whose session falls on
 * `end_date` itself in the list.
 */
export function endDateToCutoff(
  endDate: string | null,
  timezone: string,
): Date | null {
  if (endDate === null) return null;
  return fromZonedTime(`${endDate}T23:59:59.999`, timezone);
}
