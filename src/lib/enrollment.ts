import { ENROLLMENT_CHARGE_WINDOW_HOURS } from "@/lib/constants/enrollment";

/**
 * Compute the next occurrence of a weekly session in UTC.
 *
 * @param dayOfWeek  0 (Monday) – 6 (Sunday), matching DAYS_OF_WEEK in utils.ts
 * @param startTime  "HH:MM" wall-clock time in the source timezone
 * @param timezone   IANA timezone (e.g. "Europe/Helsinki")
 * @param now        Reference "now" (defaults to Date.now); pass explicitly for testing
 * @returns Date of the next session start in UTC
 */
export function getNextSessionStart(
  dayOfWeek: number,
  startTime: string,
  timezone: string,
  now: Date = new Date(),
): Date {
  const [hours, minutes] = startTime.split(":").map(Number);

  // Our dayOfWeek: Monday=0 … Sunday=6
  // JS getDay(): Sunday=0 … Saturday=6
  // Convert: jsDay = (dayOfWeek + 1) % 7
  const targetJsDay = (dayOfWeek + 1) % 7;

  // Try days 0..6 ahead of "today in the source timezone" to find the next occurrence
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);

    // Build a wall-clock string in the source timezone for this candidate date
    const year = getWallClockPart(candidate, timezone, "year");
    const month = getWallClockPart(candidate, timezone, "month");
    const day = getWallClockPart(candidate, timezone, "day");
    const jsDay = getWallClockDayOfWeek(candidate, timezone);

    if (jsDay !== targetJsDay && offset < 7) continue;
    // On day 7 we must match (full week cycle)
    if (jsDay !== targetJsDay) continue;

    // Found the right weekday — build the wall-clock datetime
    const wallStr = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;
    const utcDate = wallClockToUtc(wallStr, timezone);

    // If it's the same day and the session is already past, skip to next week
    if (offset === 0 && utcDate.getTime() <= now.getTime()) continue;

    return utcDate;
  }

  // Fallback: shouldn't reach here, but try next week
  return getNextSessionStart(
    dayOfWeek,
    startTime,
    timezone,
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
}

/**
 * Whether the current time is within the charge window before a session.
 */
export function isWithinChargeWindow(
  nextSession: Date,
  windowHours: number = ENROLLMENT_CHARGE_WINDOW_HOURS,
  now: Date = new Date(),
): boolean {
  const windowStart = new Date(nextSession.getTime() - windowHours * 60 * 60 * 1000);
  return now.getTime() >= windowStart.getTime();
}

/**
 * Determine whether an unenrollment qualifies for a token refund.
 */
export function getRefundEligibility(
  product: { day_of_week: number; start_time: string; timezone: string; token_cost: number },
  windowHours: number = ENROLLMENT_CHARGE_WINDOW_HOURS,
  now: Date = new Date(),
): { eligible: boolean; nextSession: Date; refundAmount: number } {
  const nextSession = getNextSessionStart(
    product.day_of_week,
    product.start_time,
    product.timezone,
    now,
  );
  const withinWindow = isWithinChargeWindow(nextSession, windowHours, now);
  return {
    eligible: !withinWindow,
    nextSession,
    refundAmount: withinWindow ? 0 : product.token_cost,
  };
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

/**
 * Convert a wall-clock datetime string (no TZ offset) in a given IANA timezone to UTC.
 * Uses the same iterative approach as formatScheduleLocal in utils.ts.
 */
function wallClockToUtc(wallStr: string, timezone: string): Date {
  // Parse the target wall-clock values
  const [datePart, timePart] = wallStr.split("T");
  const [, , dayStr] = datePart.split("-");
  const [hourStr, minuteStr] = timePart.split(":");
  const targetDay = Number(dayStr);
  const targetHour = Number(hourStr);
  const targetMinute = Number(minuteStr);

  // Start with the naive UTC interpretation
  const utcGuess = new Date(wallStr + "Z");

  // See what the source timezone shows for this UTC instant
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcGuess);
  const srcHour = Number(parts.find((p) => p.type === "hour")?.value);
  const srcMin = Number(parts.find((p) => p.type === "minute")?.value);
  const srcDay = Number(parts.find((p) => p.type === "day")?.value);

  // Compute offset: how far ahead the timezone is from UTC
  let offsetMinutes = (srcHour - targetHour) * 60 + (srcMin - targetMinute);
  if (srcDay !== targetDay) {
    offsetMinutes += srcDay > targetDay ? 24 * 60 : -24 * 60;
  }

  // Subtract the offset to get the true UTC time
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}
