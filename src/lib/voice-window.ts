import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  nextRunning,
  OPEN_ENDED_OCCURRENCE_CAP,
  trimOpenEndedFuture,
  type PlannedSession,
} from "@/lib/planned-sessions";
import { formatDate, formatTime } from "@/lib/date-format";

/**
 * Whether a session's group voice room is joinable *right now*. The window
 * opens `SESSION_WINDOW_BEFORE_MINUTES` before the session start and closes
 * `SESSION_WINDOW_AFTER_MINUTES` after its end.
 *
 * Single source of truth for the locked-vs-Live boundary shared by the
 * parent/gamer dashboards and family club pages, the gedu dashboard and
 * workspace, and the per-group join surfaces that call `computeVoiceState`
 * (the gedu session-details page and the admin product-details page). Keeping
 * the arithmetic here means the boundary can never drift between those
 * surfaces.
 *
 * Note this only answers "is the window open"; callers still use
 * `SESSION_WINDOW_AFTER_MINUTES` separately as the margin that drops
 * already-closed sessions from their lists.
 */
export function isVoiceWindowOpen(start: Date, end: Date, now: Date): boolean {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } =
    VOICE_CONFIG;
  const opensAt = start.getTime() - SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const closesAt = end.getTime() + SESSION_WINDOW_AFTER_MINUTES * 60_000;
  const nowMs = now.getTime();
  return nowMs >= opensAt && nowMs < closesAt;
}

/**
 * Resolve the next session + voice-window state from a product's planned
 * sessions. Every group on a product shares the same plan, so a page computes
 * this once and threads the same `(voiceIsOpen, opensDate, opensTime)` triple
 * into every group card. It answers from the shared `isVoiceWindowOpen`
 * helper, so the lock-state windows can never drift between the dashboard
 * cards, the gedu session-details page, and the admin product page.
 *
 * An open-ended plan is first cut to the horizon every session list shows —
 * the next eight sessions still open — and only then are cancelled sessions
 * dropped, so the room looks exactly as far ahead as the feed beside it: eight
 * cancelled sessions in a row leave no upcoming session, as they leave no
 * running one on the feed.
 *
 * When the plan has no session still open (camp ended, no remaining slots)
 * `hasUpcomingSession` is false and the labels are empty — there's no room to
 * join ever again, so callers should hide the Join affordance entirely rather
 * than render a label-less "Opens  at " button. Surfaces that only ever show
 * this for a *future* session (the parent/gamer and gedu dashboard cards) never
 * hit that branch; the admin product page can, since it lists groups for
 * completed products too.
 *
 * Answers "is the *window* open" from the plan alone, independent of
 * `is_remote`. In-person products have no voice room, so callers gate the
 * Join affordance on `is_remote` themselves rather than relying on this.
 *
 * A session marked `cancelled` is one group's cancelled date, and a surface
 * that knows them marks them: a cancelled session opens no room — the voice
 * token route refuses its token and the database refuses its chat — so the next
 * session is the soonest one that is not cancelled.
 */
export function computeVoiceState(args: {
  /** The product's planned sessions, soonest first, cancellations marked. */
  plan: readonly PlannedSession[];
  /** The product has no end date, so its plan is cut to the shared horizon. */
  openEnded: boolean;
  now: Date;
  locale: string;
  timeZone: string;
}): {
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  hasUpcomingSession: boolean;
} {
  const { plan, openEnded, now, locale, timeZone } = args;
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const inView = openEnded
    ? trimOpenEndedFuture(plan, now, OPEN_ENDED_OCCURRENCE_CAP, windowCloseMs)
    : plan;
  const { next } = nextRunning(inView, now, windowCloseMs);

  if (next === null) {
    return {
      voiceIsOpen: false,
      opensDate: "",
      opensTime: "",
      hasUpcomingSession: false,
    };
  }

  return {
    voiceIsOpen: isVoiceWindowOpen(next.startsAt, next.endsAt, now),
    opensDate: formatDate(next.startsAt, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }),
    opensTime: formatTime(next.startsAt, locale, timeZone),
    hasUpcomingSession: true,
  };
}

/**
 * A plan with one group's cancelled dates marked, for `computeVoiceState`.
 * The plan rows documents carry are unmarked; each surface overlays the
 * cancellations it holds.
 */
export function markCancelled<T extends PlannedSession>(
  plan: readonly T[],
  cancelledDates: ReadonlySet<string>,
): T[] {
  return plan.map((session) =>
    cancelledDates.has(session.date) ? { ...session, cancelled: true } : session,
  );
}
