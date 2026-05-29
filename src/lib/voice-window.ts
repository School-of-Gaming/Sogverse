import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * Whether a session's group voice room is joinable *right now*. The window
 * opens `SESSION_WINDOW_BEFORE_MINUTES` before the session start and closes
 * `SESSION_WINDOW_AFTER_MINUTES` after its end.
 *
 * Single source of truth for the locked-vs-Live boundary shared by the
 * parent/gamer dashboard (`expandUpcomingSessions`), the gedu dashboard
 * (`expandAssignedSessionsToCards`), and the gedu session-details page
 * (`computeVoiceState`). Keeping the arithmetic here means the boundary can
 * never drift between those surfaces.
 *
 * Note this only answers "is the window open"; callers still feed
 * `SESSION_WINDOW_AFTER_MINUTES` into `enumerateRowOccurrences` separately to
 * drop already-closed occurrences from their lists.
 */
export function isVoiceWindowOpen(start: Date, end: Date, now: Date): boolean {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } =
    VOICE_CONFIG;
  const opensAt = start.getTime() - SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const closesAt = end.getTime() + SESSION_WINDOW_AFTER_MINUTES * 60_000;
  const nowMs = now.getTime();
  return nowMs >= opensAt && nowMs < closesAt;
}
