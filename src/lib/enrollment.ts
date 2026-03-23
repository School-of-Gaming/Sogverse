import { ENROLLMENT_CHARGE_WINDOW_HOURS } from "@/lib/constants/enrollment";
import { parseTime, wallClockToUtc } from "@/lib/utils";

interface Schedule {
  dayOfWeek: number;
  startTime: string;
  timezone: string;
}

/**
 * Compute the next occurrence of a weekly session in UTC.
 *
 * @param schedule.dayOfWeek  0 (Monday) – 6 (Sunday), matching DAYS_OF_WEEK in utils.ts
 * @param schedule.startTime  "HH:MM" wall-clock time in the source timezone
 * @param schedule.timezone   IANA timezone (e.g. "Europe/Helsinki")
 * @param opts.now            Reference "now" (defaults to Date.now); pass explicitly for testing
 * @returns Date of the next session start in UTC
 */
export function getNextSessionStart(
  schedule: Schedule,
  opts: { now?: Date } = {},
): Date {
  const now = opts.now ?? new Date();
  const { hours, minutes } = parseTime(schedule.startTime);

  // Our dayOfWeek: Monday=0 … Sunday=6
  // JS getDay(): Sunday=0 … Saturday=6
  // Convert: jsDay = (dayOfWeek + 1) % 7
  const targetJsDay = (schedule.dayOfWeek + 1) % 7;

  // Try days 0..6 ahead of "today in the source timezone" to find the next occurrence
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);

    // Build a wall-clock string in the source timezone for this candidate date
    const year = getWallClockPart(candidate, schedule.timezone, "year");
    const month = getWallClockPart(candidate, schedule.timezone, "month");
    const day = getWallClockPart(candidate, schedule.timezone, "day");
    const jsDay = getWallClockDayOfWeek(candidate, schedule.timezone);

    if (jsDay !== targetJsDay && offset < 7) continue;
    // On day 7 we must match (full week cycle)
    if (jsDay !== targetJsDay) continue;

    // Found the right weekday — build the wall-clock datetime
    const wallStr = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;
    const utcDate = wallClockToUtc(wallStr, schedule.timezone);

    // If it's the same day and the session is already past, skip to next week
    if (offset === 0 && utcDate.getTime() <= now.getTime()) continue;

    return utcDate;
  }

  // Fallback: shouldn't reach here, but try next week
  return getNextSessionStart(schedule, {
    now: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  });
}

/**
 * Whether the current time is within the charge window before a session.
 */
export function isWithinChargeWindow(
  nextSession: Date,
  opts: { windowHours?: number; now?: Date } = {},
): boolean {
  const windowHours = opts.windowHours ?? ENROLLMENT_CHARGE_WINDOW_HOURS;
  const now = opts.now ?? new Date();
  const windowStart = new Date(nextSession.getTime() - windowHours * 60 * 60 * 1000);
  return now.getTime() >= windowStart.getTime();
}

/**
 * Determine whether an unenrollment qualifies for a token refund.
 *
 * Two-stage check:
 * 1. If the charged session has already started → no refund ("session_past")
 * 2. If the charged session hasn't started but is within the cancellation window → no refund ("within_window")
 * 3. Otherwise → eligible for refund
 */
export function getRefundEligibility(opts: {
  product: { day_of_week: number; start_time: string; timezone: string; token_cost: number };
  lastChargeSessionDate: string | null;
  windowHours?: number;
  now?: Date;
}): { eligible: boolean; nextSession: Date; refundAmount: number; reason?: "within_window" | "session_past" } {
  const { product, lastChargeSessionDate } = opts;
  const windowHours = opts.windowHours ?? ENROLLMENT_CHARGE_WINDOW_HOURS;
  const now = opts.now ?? new Date();

  const nextSession = getNextSessionStart(
    { dayOfWeek: product.day_of_week, startTime: product.start_time, timezone: product.timezone },
    { now },
  );

  // Stage 1: Check if the charged session has already started.
  // If no charge exists or the charged session already happened, no refund is possible —
  // the customer either attended the session or was never charged.
  if (!lastChargeSessionDate) {
    return { eligible: false, nextSession, refundAmount: 0, reason: "session_past" };
  }

  const { hours: h, minutes: m } = parseTime(product.start_time);
  const sessionTimestamp = wallClockToUtc(
    `${lastChargeSessionDate}T${pad(h)}:${pad(m)}:00`,
    product.timezone,
  );

  if (now.getTime() > sessionTimestamp.getTime()) {
    return { eligible: false, nextSession, refundAmount: 0, reason: "session_past" };
  }

  // Stage 2: Session hasn't started yet — apply the cancellation window check.
  const withinWindow = isWithinChargeWindow(nextSession, { windowHours, now });
  if (withinWindow) {
    return { eligible: false, nextSession, refundAmount: 0, reason: "within_window" };
  }

  return { eligible: true, nextSession, refundAmount: product.token_cost };
}

/**
 * Format a millisecond duration as a human-friendly countdown string.
 *
 * - 1+ days  → "3 days"
 * - 2–23 hours → "5 hours"
 * - 1–2 hours → "1 hour and 30 minutes"
 * - <1 hour → "45 minutes"
 */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) return `${days} ${days === 1 ? "day" : "days"}`;
  if (totalMinutes < 60) return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  if (totalMinutes < 120)
    return `${hours} hour${mins > 0 ? ` and ${mins} ${mins === 1 ? "minute" : "minutes"}` : ""}`;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getWallClockPart(
  date: Date,
  timezone: string,
  part: "year" | "month" | "day",
): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const val = parts.find((p) => p.type === part)?.value;
  return Number(val);
}

function getWallClockDayOfWeek(date: Date, timezone: string): number {
  // Returns JS day-of-week (0=Sunday..6=Saturday) for the wall-clock date in the timezone
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const weekday = fmt.format(date);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekday] ?? 0;
}
