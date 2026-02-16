import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
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

  // Parse HH:MM
  const [hours, minutes] = startTime.split(":").map(Number);

  // Create a date string that represents the wall-clock time in the source timezone.
  // Format as ISO-like string and let the Intl API handle the conversion.
  const year = refDate.getFullYear();
  const month = String(refDate.getMonth() + 1).padStart(2, "0");
  const day = String(refDate.getDate()).padStart(2, "0");
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");

  // Get the UTC offset for the source timezone on this date
  const sourceDateStr = `${year}-${month}-${day}T${h}:${m}:00`;

  // Use Intl to find the offset of the source timezone at this datetime
  const sourceFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Create a UTC date and iteratively find what UTC time corresponds to the wall-clock time
  // in the source timezone. We use a simple approach: create a date assuming UTC,
  // then check what the source TZ shows, and adjust.
  let utcDate = new Date(sourceDateStr + "Z");
  const parts = sourceFormatter.formatToParts(utcDate);
  const srcHour = Number(parts.find((p) => p.type === "hour")?.value);
  const srcMin = Number(parts.find((p) => p.type === "minute")?.value);
  const srcDay = Number(parts.find((p) => p.type === "day")?.value);

  // Offset in minutes: how far ahead the source TZ is from UTC
  let offsetMinutes = (srcHour - hours) * 60 + (srcMin - minutes);
  // Handle day boundary
  if (srcDay !== refDate.getDate()) {
    offsetMinutes += srcDay > refDate.getDate() ? 24 * 60 : -24 * 60;
  }

  // The actual UTC time for the wall-clock time in the source timezone
  utcDate = new Date(utcDate.getTime() - offsetMinutes * 60 * 1000);

  // Format in the viewer's local timezone
  const localTimeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const localDayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long" });
  const localTzFmt = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
  });

  const localTime = localTimeFmt.format(utcDate);
  const localDay = localDayFmt.format(utcDate);
  const tzParts = localTzFmt.formatToParts(utcDate);
  const tzAbbrev = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";

  return { localDay, localTime, tzAbbrev };
}
