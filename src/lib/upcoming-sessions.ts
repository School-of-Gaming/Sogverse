import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import { isVoiceWindowOpen } from "@/lib/voice-window";
import type { NextSessionCardProps } from "@/components/parent/NextSessionCard";
import type { MyUpcomingSessionRow } from "@/services/participations";

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
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

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
    // The voice room route is keyed by `product_groups.id` (UUID) and
    // only exists for remote products. Unassigned participations
    // (group_id IS NULL, redesign §4.10) get no voice access either —
    // both cases collapse to a `"#"` no-op so the locked/Live UX still
    // renders honestly off `voiceIsOpen` while the button stays inert.
    const voiceHref =
      row.product.isRemote && row.groupId
        ? ROUTES.voice.groupSession(row.groupId)
        : "#";
    const startBoundary = startDateToCutoff(
      row.product.startDate,
      row.product.timezone,
    );
    const endBoundary = endDateToCutoff(row.product.endDate, row.product.timezone);
    const cap = row.product.endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Infinity;

    const occurrences = enumerateRowOccurrences({
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
    first.voiceIsOpen = isVoiceWindowOpen(first.sessionStart, first.sessionEnd, now);
  }

  return sessions;
}
