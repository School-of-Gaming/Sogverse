import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Whether a session's group voice room is joinable *right now*. The window
 * opens `SESSION_WINDOW_BEFORE_MINUTES` before the session start and closes
 * `SESSION_WINDOW_AFTER_MINUTES` after its end.
 *
 * Single source of truth for the locked-vs-Live boundary shared by the
 * parent/gamer dashboard (`expandUpcomingSessions`), the gedu dashboard
 * (`expandAssignedSessionsToCards`), and the per-group join surfaces that
 * call `computeVoiceState` (the gedu session-details page and the admin
 * product-details page). Keeping the arithmetic here means the boundary can
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

/**
 * The minimal product shape `computeVoiceState` needs: the schedule slots
 * plus the boundaries used to clip them. Deliberately structural so both the
 * gedu `GeduAssignedProductShell` and the admin `ProductAdminDetailRow`
 * satisfy it without a shared nominal type.
 */
export interface VoiceWindowProduct {
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  schedule_slots: {
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }[];
}

/**
 * Resolve the next session occurrence + voice-window state for a product.
 * Every group on a product shares the same schedule, so callers compute this
 * once at the page level and thread the same `(voiceIsOpen, opensDate,
 * opensTime)` triple into every group card. Reuses the same primitive
 * (`enumerateRowOccurrences`) and the shared `isVoiceWindowOpen` helper the
 * dashboard expansions use, so the lock-state windows can never drift between
 * the dashboard cards, the gedu session-details page, and the admin product
 * page.
 *
 * When the product has no future occurrence in the iteration window (camp
 * ended, no remaining slots) `hasUpcomingSession` is false and the labels are
 * empty — there's no room to join ever again, so callers should hide the Join
 * affordance entirely rather than render a label-less "Opens  at " button.
 * Surfaces that only ever show this for a *future* session (the parent/gamer
 * and gedu dashboard cards) never hit that branch; the admin product page can,
 * since it lists groups for completed products too.
 *
 * Answers "is the *window* open" from the schedule alone, independent of
 * `is_remote`. In-person products have no voice room, so callers gate the
 * Join affordance on `is_remote` themselves rather than relying on this.
 */
export function computeVoiceState(args: {
  product: VoiceWindowProduct;
  now: Date;
  locale: string;
  timeZone: string;
}): {
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  hasUpcomingSession: boolean;
} {
  const { product, now, locale, timeZone } = args;
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const slots = product.schedule_slots.map((s) => ({
    weekday: s.weekday,
    startTime: s.start_time,
    durationMinutes: s.duration_minutes,
  }));

  const occurrences = enumerateRowOccurrences({
    slots,
    timezone: product.timezone,
    now,
    startBoundary: startDateToCutoff(product.start_date, product.timezone),
    endBoundary: endDateToCutoff(product.end_date, product.timezone),
    cap:
      product.end_date === null
        ? OPEN_ENDED_OCCURRENCE_CAP
        : Number.POSITIVE_INFINITY,
    windowCloseMs,
  });
  occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (occurrences.length === 0) {
    return {
      voiceIsOpen: false,
      opensDate: "",
      opensTime: "",
      hasUpcomingSession: false,
    };
  }

  const next = occurrences[0];

  return {
    voiceIsOpen: isVoiceWindowOpen(next.start, next.end, now),
    opensDate: formatDate(next.start, locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    }),
    opensTime: formatTime(next.start, locale, timeZone),
    hasUpcomingSession: true,
  };
}
