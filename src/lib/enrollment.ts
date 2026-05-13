import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { parseTime } from "@/lib/utils";

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

  // Try days 0..6 ahead of "today in the source timezone" to find the next occurrence.
  // toZonedTime returns a Date whose UTC fields represent wall-clock in the source TZ.
  const zonedNow = toZonedTime(now, schedule.timezone);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(zonedNow.getTime() + offset * 86_400_000);

    const jsDay = candidate.getUTCDay();
    if (jsDay !== targetJsDay && offset < 7) continue;
    if (jsDay !== targetJsDay) continue;

    // Found the right weekday — build the wall-clock datetime and convert to UTC
    const year = candidate.getUTCFullYear();
    const month = pad(candidate.getUTCMonth() + 1);
    const day = pad(candidate.getUTCDate());
    const wallStr = `${year}-${month}-${day}T${pad(hours)}:${pad(minutes)}:00`;
    const utcDate = fromZonedTime(wallStr, schedule.timezone);

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
 * Format a millisecond duration as a human-friendly countdown string.
 *
 * - 1+ days  → "3 days"
 * - 2–23 hours → "5 hours"
 * - 1–2 hours → "1 hour and 30 minutes"
 * - <1 hour → "45 minutes"
 */
export function formatCountdown(ms: number, locale: string): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;

  const fmtUnit = (value: number, unit: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);

  if (days > 0) return fmtUnit(days, "day");
  if (totalMinutes < 60) return fmtUnit(totalMinutes, "minute");
  if (totalMinutes < 120) {
    const hourStr = fmtUnit(hours, "hour");
    return mins > 0
      ? new Intl.ListFormat(locale, { type: "unit", style: "long" }).format([hourStr, fmtUnit(mins, "minute")])
      : hourStr;
  }
  return fmtUnit(hours, "hour");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
