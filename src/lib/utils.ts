import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { type SupportedCurrency } from "@/lib/constants/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a time string into hours and minutes.
 * Accepts both "HH:MM" and Postgres TIME format "HH:MM:SS".
 */
export function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

export function formatCurrency(
  amount: number,
  currency: SupportedCurrency,
  locale?: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCurrencyFromCents(
  cents: number,
  currency: SupportedCurrency,
  locale?: string,
): string {
  return formatCurrency(cents / 100, currency, locale);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions, locale?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...options,
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(d);
}

export function generateGamerEmail(username: string): string {
  return `${username.toLowerCase()}@gamer.sogverse.internal`;
}

export function extractUsernameFromGamerEmail(email: string): string | null {
  const match = email.match(/^(.+)@gamer\.sogverse\.internal$/);
  return match ? match[1] : null;
}

export function isGamerEmail(email: string): boolean {
  return email.endsWith("@gamer.sogverse.internal");
}

export function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert a wall-clock datetime string (no TZ offset) in a given IANA timezone to UTC.
 *
 * Uses "en-US" locale with hour12:false to guarantee Arabic numerals when
 * extracting parts via Intl.DateTimeFormat — this is internal timezone math,
 * not user-facing formatting.
 */
export function wallClockToUtc(wallStr: string, timezone: string): Date {
  const [datePart, timePart] = wallStr.split("T");
  const [, , dayStr] = datePart.split("-");
  const [hourStr, minuteStr] = timePart.split(":");
  const targetDay = Number(dayStr);
  const targetHour = Number(hourStr);
  const targetMinute = Number(minuteStr);

  const utcGuess = new Date(wallStr + "Z");

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

  let offsetMinutes = (srcHour - targetHour) * 60 + (srcMin - targetMinute);
  if (srcDay !== targetDay) {
    offsetMinutes += srcDay > targetDay ? 24 * 60 : -24 * 60;
  }

  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

/** Monday = 0, Sunday = 6 (matches DB day_of_week column) */
export const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * Convert a recurring wall-clock schedule to the viewer's local timezone.
 *
 * @param dayOfWeek  0 (Monday) – 6 (Sunday) matching DAYS_OF_WEEK
 * @param startTime  "HH:MM" wall-clock time in the source timezone
 * @param timezone   IANA timezone of the source (e.g. "Europe/Helsinki")
 * @returns localDay, localTime (e.g. "3:00 PM"), and tzAbbrev (e.g. "EST")
 */
export function formatScheduleLocal(
  dayOfWeek: number,
  startTime: string,
  timezone: string,
): { localDay: string; localTime: string; tzAbbrev: string } {
  // Build a concrete Date for the next occurrence of this weekday in the source TZ.
  // JS getDay(): 0=Sun, 1=Mon … 6=Sat.  Our dayOfWeek: 0=Mon … 6=Sun.
  const jsDay = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const now = new Date();
  const todayJs = now.getDay(); // 0-6 Sun-Sat
  let daysAhead = jsDay - todayJs;
  if (daysAhead <= 0) daysAhead += 7;

  // Start from today in the source timezone to get a reference date
  const refDate = new Date(now);
  refDate.setDate(refDate.getDate() + daysAhead);

  const { hours, minutes } = parseTime(startTime);

  // Create a date string that represents the wall-clock time in the source timezone.
  // Format as ISO-like string and let the Intl API handle the conversion.
  const year = refDate.getFullYear();
  const month = String(refDate.getMonth() + 1).padStart(2, "0");
  const day = String(refDate.getDate()).padStart(2, "0");
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");

  const wallStr = `${year}-${month}-${day}T${h}:${m}:00`;
  const utcDate = wallClockToUtc(wallStr, timezone);

  // Format in the viewer's local timezone (undefined = browser locale)
  const localTimeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const localDayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
  const localTzFmt = new Intl.DateTimeFormat(undefined, {
    timeZoneName: "short",
  });

  const localTime = localTimeFmt.format(utcDate);
  const localDay = localDayFmt.format(utcDate);
  const tzParts = localTzFmt.formatToParts(utcDate);
  const tzAbbrev = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";

  return { localDay, localTime, tzAbbrev };
}
