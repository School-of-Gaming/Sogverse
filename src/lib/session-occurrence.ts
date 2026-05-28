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

/**
 * Default cap for open-ended products (no `end_date`) — the parent/gamer
 * Sessions list and the gedu My Groups list both surface the next N
 * occurrences across all of a product's weekly slots. End-dated products
 * (camps, events, dated runs) ignore the cap and emit every occurrence
 * up to and including `end_date`.
 *
 * Shared so the gedu's view of a club shows the same horizon as the
 * parent's.
 */
export const OPEN_ENDED_OCCURRENCE_CAP = 8;

/**
 * Expand one row's slots into the concrete (start, end) pairs the
 * dashboards consume. Shared between `expandUpcomingSessions`
 * (parent/gamer) and `expandAssignedSessionsToCards` (gedu) — the only
 * difference between the callers was the per-row card shaping, not the
 * iteration.
 *
 * Per-slot it first surfaces a still-in-its-window previous occurrence
 * (the bit `getNextSessionStart` hides because it only ever returns
 * *future* starts), then walks forward emitting future occurrences
 * until either `endBoundary` is crossed or `cap` is reached. Per-slot
 * lists are merged, sorted ascending, and trimmed to `cap` so the
 * soonest N across all slots win.
 *
 * `cap = Infinity` means "no cap" — used for end-dated products where
 * the date range is the natural bound.
 */
export function enumerateRowOccurrences(args: {
  slots: SlotShape[];
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  cap: number;
  windowCloseMs: number;
}): Array<{ start: Date; end: Date }> {
  const { slots, timezone, now, startBoundary, endBoundary, cap, windowCloseMs } =
    args;
  const out: Array<{ start: Date; end: Date }> = [];
  const perSlotCap = Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY;

  // If the product hasn't started yet (start_date is in the future), pin
  // the future-iteration cursor to "just before start_date" so the
  // search lands on or after start_date. Otherwise iterate from real
  // `now`. The prev-week-in-window check returns null in the
  // not-started-yet case on its own (no occurrence can be in progress
  // before the product opens), so no separate guard is needed here.
  const futureCursorBase =
    startBoundary !== null && startBoundary.getTime() > now.getTime()
      ? new Date(startBoundary.getTime() - 1)
      : now;

  for (const slot of slots) {
    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;

    let emitted = 0;

    const inProgress = getCurrentInProgressOccurrence({
      slot,
      timezone,
      now,
      startBoundary,
      endBoundary,
      windowCloseMs,
    });
    if (inProgress) {
      out.push(inProgress);
      emitted += 1;
    }

    let cursor = futureCursorBase;
    while (emitted < perSlotCap) {
      const start = getNextSessionStart(schedule, { now: cursor });
      if (endBoundary !== null && start.getTime() > endBoundary.getTime()) break;
      const end = new Date(start.getTime() + durationMs);
      out.push({ start, end });
      // Step past this start so the next iteration finds the following
      // occurrence rather than re-emitting this one. `getNextSessionStart`
      // is required to return a strictly future date relative to `now`;
      // see its TZ regression test — if that contract slips, this loop
      // never advances and the renderer pegs.
      cursor = new Date(start.getTime() + 60_000);
      emitted += 1;
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return Number.isFinite(cap) ? out.slice(0, cap) : out;
}
