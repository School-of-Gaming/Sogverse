import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { ROUTES } from "@/lib/constants";
import { getNextSessionStart } from "@/lib/enrollment";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { NextSessionCardProps } from "@/components/parent/NextSessionCard";
import type { MyUpcomingSessionRow } from "@/services/participations";

/**
 * Per-participation cap when a product has no `end_date`. Ongoing clubs run
 * indefinitely, so we surface a finite horizon of the next N occurrences
 * (across all of the product's weekly slots) rather than an unbounded list.
 * For end-dated products (camps, events, dated club runs), the date range
 * is the natural bound and we ignore this cap.
 */
const OPEN_ENDED_OCCURRENCE_CAP = 8;

/**
 * Expand the viewer's placed participations into a flat, time-sorted list of
 * concrete upcoming sessions for the dashboard Sessions section (drives both
 * `/parent` and `/gamer`).
 *
 * One emitted entry per (participation, slot, future occurrence). Sessions
 * whose voice window has already closed (`end + SESSION_WINDOW_AFTER` < now)
 * are dropped so finished sessions don't linger — but in-progress sessions
 * stay because their start is still the soonest meaningful moment for the
 * card to reference. Sort is ascending by `sessionStart`, so an in-progress
 * session ends up at the top exactly as a "starts in 5 min" one would.
 *
 * `voiceIsOpen` is populated only for the first entry: `NextSessionCard` is
 * the only card that consumes it (`UpcomingSessionCard` is info-only), so
 * computing windows for every entry would be wasted work.
 */
export function expandUpcomingSessions(
  rows: MyUpcomingSessionRow[],
  now: Date,
  locale: SupportedLocale,
): NextSessionCardProps[] {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } = VOICE_CONFIG;
  const beforeMs = SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const windowCloseMs = SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const sessions: NextSessionCardProps[] = [];

  for (const row of rows) {
    if (row.slots.length === 0) continue;

    const productName =
      resolveTranslation(row.product.translations, locale)?.name ?? "";
    // Per the task brief: Padlet link is the reports button even when the
    // product has no Padlet URL set. The button still renders; clicking is
    // a no-op via `#`. A null-Padlet product is the unexpected case in
    // practice — surfacing the button keeps the card layout stable rather
    // than reflowing for an edge case.
    const reportsHref = row.product.padletUrl ?? "#";
    // The voice room route is keyed by `product_groups_v2.id` (UUID) and
    // only exists for remote products. Unassigned participations
    // (group_id IS NULL, redesign §4.10) get no voice access either —
    // both cases collapse to a `"#"` no-op so the locked/Live UX still
    // renders honestly off `voiceIsOpen` while the button stays inert.
    const voiceHref =
      row.product.isRemote && row.groupId
        ? ROUTES.gamer.voiceSession(row.groupId)
        : "#";
    const startBoundary = startDateToCutoff(
      row.product.startDate,
      row.product.timezone,
    );
    const endBoundary = endDateToCutoff(row.product.endDate, row.product.timezone);
    const cap = row.product.endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Infinity;

    const occurrences = enumerateOccurrences({
      slots: row.slots,
      timezone: row.product.timezone,
      now,
      startBoundary,
      endBoundary,
      cap,
      windowCloseMs,
    });

    for (const occ of occurrences) {
      sessions.push({
        gamerFirstName: row.gamer.firstName,
        gamerSeed: row.gamer.id,
        productName,
        sessionStart: occ.start,
        sessionEnd: occ.end,
        // Filled in for the soonest session below; UpcomingSessionCard
        // ignores it.
        voiceIsOpen: false,
        voiceHref,
        reportsHref,
      });
    }
  }

  sessions.sort(
    (a, b) => a.sessionStart.getTime() - b.sessionStart.getTime(),
  );

  if (sessions.length > 0) {
    const first = sessions[0];
    const opensAt = first.sessionStart.getTime() - beforeMs;
    const closesAt = first.sessionEnd.getTime() + windowCloseMs;
    const nowMs = now.getTime();
    first.voiceIsOpen = nowMs >= opensAt && nowMs < closesAt;
  }

  return sessions;
}

/**
 * Walk every slot forward in time, emitting concrete (start, end) pairs in
 * UTC. Per-slot iteration stops at the end-of-product-day boundary (when
 * end-dated) or after the cap is reached (when open-ended); the merge sorts
 * and trims to the cap one more time so the soonest N across all slots win.
 */
function enumerateOccurrences(args: {
  slots: MyUpcomingSessionRow["slots"];
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

  // If the product hasn't started yet (start_date is in the future), pin all
  // iteration to "the day before start_date" so the prev-week and future
  // searches both land on or after start_date. Otherwise both branches must
  // honour real `now`.
  const futureCursorBase =
    startBoundary !== null && startBoundary.getTime() > now.getTime()
      ? new Date(startBoundary.getTime() - 1)
      : now;
  const beforeStart = futureCursorBase !== now;

  for (const slot of slots) {
    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;

    let emitted = 0;

    // `getNextSessionStart` always returns a *future* occurrence — once
    // today's start has passed, it skips to next week. That hides
    // currently-in-progress sessions from the list. Mirror
    // `computeSessionWindow` and check the previous-week candidate
    // explicitly: if its voice window is still open right now AND it falls
    // within the product's start_date / end_date range, emit it as the
    // first occurrence for this slot. Both bounds are load-bearing —
    // without `afterStart`, a camp shows a phantom in-progress session on
    // a slot weekday before the camp actually starts; without `beforeEnd`,
    // it shows one for the same reason in the days *after* end_date when
    // today still matches a slot weekday (e.g. camp ending Wed, viewer
    // loading on Fri inside the would-have-been window).
    if (!beforeStart) {
      // Back-step in *wall-clock* days, not UTC milliseconds. A flat
      // `now - 7×24h` lands one hour off on the DST-transition Wednesday
      // (Helsinki EET→EEST is the live example): the back-stepped point
      // sits *after* last week's slot start in local time, so
      // `getNextSessionStart` returns last week's already-finished session
      // and the in-window check fails — today's in-progress session
      // disappears from the dashboard. `toZonedTime` returns a Date whose
      // LOCAL methods read the wall-clock in `timezone`, so manipulating
      // via `setDate(... - 7)` subtracts 7 calendar days in tz; the
      // `fromZonedTime` round-trip back gives the correct UTC instant
      // regardless of system tz.
      const zonedWeekAgo = toZonedTime(now, timezone);
      zonedWeekAgo.setDate(zonedWeekAgo.getDate() - 7);
      const prevSearchPoint = fromZonedTime(zonedWeekAgo, timezone);
      const prevStart = getNextSessionStart(schedule, {
        now: prevSearchPoint,
      });
      const prevEnd = new Date(prevStart.getTime() + durationMs);
      const withinWindow = prevEnd.getTime() + windowCloseMs > now.getTime();
      const afterStart =
        startBoundary === null || prevStart.getTime() >= startBoundary.getTime();
      const beforeEnd =
        endBoundary === null || prevStart.getTime() <= endBoundary.getTime();
      if (withinWindow && afterStart && beforeEnd) {
        out.push({ start: prevStart, end: prevEnd });
        emitted += 1;
      }
    }

    let cursor = futureCursorBase;
    while (emitted < perSlotCap) {
      const start = getNextSessionStart(schedule, { now: cursor });
      if (endBoundary !== null && start.getTime() > endBoundary.getTime()) break;
      const end = new Date(start.getTime() + durationMs);
      out.push({ start, end });
      // Step past this start so the next iteration finds the following
      // occurrence rather than re-emitting this one.
      cursor = new Date(start.getTime() + 60_000);
      emitted += 1;
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return Number.isFinite(cap) ? out.slice(0, cap) : out;
}

/**
 * Turn a product's wall-clock start_date (YYYY-MM-DD in `timezone`) into the
 * UTC instant of that local day's midnight. Sessions whose start is at or
 * after this instant qualify; anything earlier is before the product
 * actually begins running.
 */
function startDateToCutoff(
  startDate: string | null,
  timezone: string,
): Date | null {
  if (startDate === null) return null;
  return fromZonedTime(`${startDate}T00:00:00.000`, timezone);
}

/**
 * Turn a product's wall-clock end_date (YYYY-MM-DD in `timezone`) into an
 * inclusive UTC cutoff: any session whose start is on or before the end of
 * that local day counts. End-of-day rather than start-of-day keeps a slot
 * whose session falls on `end_date` itself in the list.
 */
function endDateToCutoff(
  endDate: string | null,
  timezone: string,
): Date | null {
  if (endDate === null) return null;
  return fromZonedTime(`${endDate}T23:59:59.999`, timezone);
}
