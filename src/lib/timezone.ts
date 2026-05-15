import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";

export const TIMEZONE_COOKIE_NAME = "timezone";

/**
 * Whether `value` is a string that `Intl.DateTimeFormat` will accept as a
 * `timeZone` option. We don't enumerate the IANA list ourselves — letting
 * `Intl` reject is the same check `formatDate` / `formatTime` would do
 * downstream, so a value that passes here is guaranteed to flow through
 * those helpers without throwing.
 *
 * Used on both ends: server-side to validate the `timezone` cookie before
 * trusting it (cookies are user-controllable), and client-side to validate
 * the browser-detected zone before writing it back.
 */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick a timezone for the server-side render given a cookie candidate.
 * Falls back to `DEFAULT_TIMEZONE` (Europe/Helsinki) when the cookie is
 * missing or malformed — on a first-ever visit the post-mount detection
 * in `TimezoneProvider` will catch the disagreement, write the real zone
 * to the cookie, and re-render. Every subsequent visit SSRs in the
 * correct zone.
 */
export function resolveTimezone(cookieValue: string | undefined): string {
  return isValidTimezone(cookieValue) ? cookieValue : DEFAULT_TIMEZONE;
}
