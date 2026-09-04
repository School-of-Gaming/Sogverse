import { getTimezoneOffset } from "date-fns-tz";

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

/**
 * A zone rendered the way a picker should show it: `(GMT+03:00) Helsinki`.
 *
 * Two halves, neither of which is a translated string, and neither of which
 * depends on the reader's locale — which is the point of computing the offset
 * here rather than reading one out of `Intl`. Asking `Intl` for a `longOffset`
 * part returns a *localized* string: several locales render it `UTC+02.00`
 * (a decimal point, and a different prefix), and every one of them abbreviates
 * a zero offset to a bare prefix with no digits at all. A list mixing those
 * shapes is ragged in exactly the way a picker of otherwise identical labels
 * must not be — a Finnish admin would read "(UTC) London" beside
 * "(UTC+02.00) Helsinki" — so the offset is derived arithmetically from the
 * zone's offset in milliseconds at the `now` you pass and formatted here, one
 * shape in every locale. `GMT` is the prefix because it is what Google Calendar
 * shows a picker in every language, so it is a fixed token rather than
 * translated copy.
 *
 * Reading the offset at `now` rather than baking it into a message file is what
 * makes a label say +03 in July and +02 in January for the same zone. The city
 * is the IANA id's last segment with its underscores opened out, which is why
 * no message key is needed for it either: `America/New_York` reads "New York"
 * in every locale, and translating a city list would be a per-locale
 * maintenance burden for names families already recognise.
 *
 * `now` is a caller's argument rather than a `new Date()` inside, so a React
 * caller can pass its request-stable clock and the server and first client
 * render cannot disagree about an offset across a DST boundary.
 */
export function formatTimezoneOptionLabel(zone: string, now: Date): string {
  const totalMinutes = Math.round(getTimezoneOffset(zone, now) / 60_000);
  const sign = totalMinutes < 0 ? "-" : "+";
  const absMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  const city = (zone.split("/").pop() ?? zone).replace(/_/g, " ");
  return `(GMT${sign}${hours}:${minutes}) ${city}`;
}
