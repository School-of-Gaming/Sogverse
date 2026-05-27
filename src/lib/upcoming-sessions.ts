import { ROUTES } from "@/lib/constants";
import { getNextSessionStart } from "@/lib/enrollment";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  getCurrentInProgressOccurrence,
  startDateToCutoff,
} from "@/lib/session-occurrence";
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

  // If the product hasn't started yet (start_date is in the future), pin
  // the future-iteration cursor to "the day before start_date" so the
  // search lands on or after start_date. Otherwise iterate from real
  // `now`. The prev-week-in-window check returns null in the
  // not-started-yet case all on its own (no occurrence can be in
  // progress before the product opens), so no separate guard is needed
  // here.
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

    // First slot emission: if a previous-week occurrence is still in its
    // voice window right now (and within the product's date bounds),
    // surface it so an in-progress session shows up as the soonest. The
    // DST-safe back-step + both date-bound checks live in
    // `getCurrentInProgressOccurrence` — see its doc for the gotchas.
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
