import { clsx, type ClassValue } from "clsx";
import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
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
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCurrencyFromCents(
  cents: number,
  currency: SupportedCurrency,
  locale: string,
): string {
  return formatCurrency(cents / 100, currency, locale);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm");
}

export function formatDate(date: Date | string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  // dateStyle is mutually exclusive with component options (month, day, etc.)
  // in Intl.DateTimeFormat — only apply the default when no options are given.
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: "medium" }).format(d);
}

// TODO: i18n Phase 3 — replace with next-intl useFormatter().relativeTime()
export function formatRelativeTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(d, locale);
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

/** Strip the leading '+' from an E.164 phone number for DB storage, or return null if empty. */
export function toE164Digits(phone: string): string | null {
  return phone ? phone.replace(/^\+/, "") : null;
}

export function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Parse a comma-separated list of emails into a trimmed array. */
export function parseEmails(input: string): string[] {
  return input.split(",").map((e) => e.trim()).filter(Boolean);
}


/** Compute age in whole years from a date-of-birth string (YYYY-MM-DD). */
export function computeAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
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
  locale: string,
  opts: { now?: Date } = {},
): { localDay: string; localTime: string; tzAbbrev: string } {
  // Find the next occurrence of this weekday in the source timezone.
  const now = opts.now ?? new Date();
  const zonedNow = toZonedTime(now, timezone);
  // toZonedTime returns a Date whose UTC fields represent wall-clock in the
  // source TZ, so getUTCDay() gives the current weekday there.
  const todayIso = zonedNow.getUTCDay(); // 0=Sun..6=Sat
  const targetIso = dayOfWeek === 6 ? 0 : dayOfWeek + 1; // convert Mon=0..Sun=6 → Sun=0..Sat=6
  let daysAhead = (targetIso - todayIso + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;

  // Build a wall-clock date string in the source timezone
  const refDate = new Date(zonedNow.getTime() + daysAhead * 86_400_000);
  const { hours, minutes } = parseTime(startTime);
  const year = refDate.getUTCFullYear();
  const month = String(refDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(refDate.getUTCDate()).padStart(2, "0");
  const h = String(hours).padStart(2, "0");
  const m = String(minutes).padStart(2, "0");

  const utcDate = fromZonedTime(`${year}-${month}-${day}T${h}:${m}:00`, timezone);

  const localTimeFmt = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const localDayFmt = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const localTzFmt = new Intl.DateTimeFormat(locale, {
    timeZoneName: "short",
  });

  const localTime = localTimeFmt.format(utcDate);
  const localDay = localDayFmt.format(utcDate);
  const tzParts = localTzFmt.formatToParts(utcDate);
  const tzAbbrev = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";

  return { localDay, localTime, tzAbbrev };
}
