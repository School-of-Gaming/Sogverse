import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { type SupportedCurrency } from "@/lib/constants/currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Narrow an arbitrary string to a key of `obj`. The predicate is backed by a real Object.hasOwn check. */
export function isKeyOf<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.hasOwn(obj, key);
}

/**
 * Narrow a raw string (typically a `<select>` value) to one of its known
 * options. Returns undefined when the value isn't in the list — for a select
 * rendered from the same options array that's unreachable, but the type is
 * earned by the lookup rather than asserted.
 */
export function findOption<T extends string>(
  options: readonly T[],
  raw: string
): T | undefined {
  return options.find((option) => option === raw);
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

/**
 * Convert a decimal-string price (e.g. "10.99", "0.5", "100") to integer
 * cents. Returns null for blank / non-numeric / negative input.
 *
 * Used by both the admin pricing preview and the RPC payload builder so
 * that *the number the parent sees and the number Stripe charges agree by
 * construction* — they go through the same conversion.
 *
 * Float precision: `Number("X.XX5") * 100` doesn't round consistently in
 * JS (e.g. `1.005 * 100 = 100.4999…` → 100, but `10.005 * 100 = 1000.5000…1`
 * → 1001). That's acceptable here because every consumer of the cents
 * value runs through this same function, so display and storage agree.
 */
export function decimalToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// `locale` and `timeZone` are both required: a time-of-day always renders in
// an explicit viewer zone, never the runtime default (CLAUDE.md viewer-zone
// rule). The required `timeZone` is the type-level enforcement of that rule —
// the compiler rejects a call that omits it, no lint heuristic needed.
export function formatTime(date: Date | string, locale: string, timeZone: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(d);
}

// `options` is required and must carry a `timeZone`: an instant always renders
// in an explicit viewer zone (CLAUDE.md viewer-zone rule), enforced by the
// type so a call can't silently fall back to the runtime default. A genuinely
// zoneless calendar date uses `formatDateOnly` instead (which UTC-pins it).
export function formatDate(
  date: Date | string,
  locale: string,
  options: Intl.DateTimeFormatOptions & { timeZone: string },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Format a date-only string ("YYYY-MM-DD") — a calendar date carrying no time
 * or zone (a product start/end date, a weekday label, etc.).
 *
 * Use this, not `formatDate`, whenever the input is a bare date. The whole job
 * here is to render that date as itself, identically, everywhere — so it is
 * pinned to UTC at both ends: parsed as UTC midnight and rendered with
 * `timeZone: "UTC"`. That removes three failure modes we've been bitten by:
 *   - **Hydration mismatch** — the server renders in UTC and the client in the
 *     browser's zone; without a fixed zone the date portion can differ between
 *     the two passes. UTC on both sides makes them byte-identical.
 *   - **Offset tipping** — `formatDate` parses the string as UTC midnight and
 *     renders in the runtime zone, slipping a day for negative-offset viewers;
 *     a noon anchor instead slips for extreme positive offsets (UTC+13/+14).
 *     Rendering in UTC can't tip in either direction.
 *   - **DST** — UTC has no daylight saving, so no boundary surprises.
 * `timeZone: "UTC"` is forced last so a caller can't reintroduce zone drift for
 * what is, by definition, a zoneless date. Pass `options` for a non-default
 * render (e.g. `{ weekday: "long" }` for the weekday name).
 */
export function formatDateOnly(date: string, locale: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, {
    ...(options ?? { dateStyle: "medium" }),
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
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


/**
 * Compute age in whole years from a date-of-birth string (YYYY-MM-DD).
 *
 * `timeZone` is required: "today" is the viewer's calendar date in their
 * IANA zone (e.g. `Europe/Helsinki`), not the runtime's. Passing the
 * server's local zone — or worse, parsing the DOB string with `new Date()`
 * and calling `.getFullYear()` — gives wrong answers across midnight
 * boundaries. Client callers pass `useTimezone()`; server callers pass
 * `await getServerTimezone()` (see `src/lib/timezone.server.ts`).
 */
export function computeAge(dateOfBirth: string, timeZone: string): number {
  const [dobY, dobM, dobD] = dateOfBirth.split("-").map(Number);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayY = Number(parts.find((p) => p.type === "year")!.value);
  const todayM = Number(parts.find((p) => p.type === "month")!.value);
  const todayD = Number(parts.find((p) => p.type === "day")!.value);

  let age = todayY - dobY;
  if (todayM < dobM || (todayM === dobM && todayD < dobD)) age--;
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
