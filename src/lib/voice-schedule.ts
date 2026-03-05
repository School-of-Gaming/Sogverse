import { getNextSessionStart } from "@/lib/enrollment";
import { VOICE_CONFIG } from "@/lib/constants/voice";

export interface SessionWindow {
  isOpen: boolean;
  nextSessionStart: Date;
  windowOpensAt: Date;
  windowClosesAt: Date;
}

interface ScheduleInput {
  day_of_week: number;
  start_time: string;
  timezone: string;
  duration_minutes: number;
}

/**
 * Compute the session window for a scheduled voice room.
 *
 * Checks both the upcoming session and the previous session (7 days earlier)
 * to handle "currently in a session" state. The room is open if `now` falls
 * within [sessionStart - BEFORE, sessionEnd + AFTER] for either occurrence.
 */
export function computeSessionWindow(
  schedule: ScheduleInput,
  now: Date = new Date(),
): SessionWindow {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } = VOICE_CONFIG;
  const beforeMs = SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const afterMs = SESSION_WINDOW_AFTER_MINUTES * 60_000;
  const durationMs = schedule.duration_minutes * 60_000;

  const nextStart = getNextSessionStart(
    schedule.day_of_week,
    schedule.start_time,
    schedule.timezone,
    now,
  );

  // Check the previous occurrence (one week before the next)
  const prevStart = new Date(nextStart.getTime() - 7 * 24 * 60 * 60_000);

  const prevWindowOpens = new Date(prevStart.getTime() - beforeMs);
  const prevWindowCloses = new Date(prevStart.getTime() + durationMs + afterMs);

  const nextWindowOpens = new Date(nextStart.getTime() - beforeMs);
  const nextWindowCloses = new Date(nextStart.getTime() + durationMs + afterMs);

  const nowMs = now.getTime();

  // Check if we're currently in the previous session's window
  if (nowMs >= prevWindowOpens.getTime() && nowMs < prevWindowCloses.getTime()) {
    return {
      isOpen: true,
      nextSessionStart: prevStart,
      windowOpensAt: prevWindowOpens,
      windowClosesAt: prevWindowCloses,
    };
  }

  // Check if we're currently in the next session's window
  if (nowMs >= nextWindowOpens.getTime() && nowMs < nextWindowCloses.getTime()) {
    return {
      isOpen: true,
      nextSessionStart: nextStart,
      windowOpensAt: nextWindowOpens,
      windowClosesAt: nextWindowCloses,
    };
  }

  // Not open — return the upcoming session info
  return {
    isOpen: false,
    nextSessionStart: nextStart,
    windowOpensAt: nextWindowOpens,
    windowClosesAt: nextWindowCloses,
  };
}
