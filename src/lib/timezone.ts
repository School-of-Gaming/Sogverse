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
 * Two halves, neither of which is a translated string. The offset comes from
 * `Intl`'s `longOffset` at the `now` you pass, so a label read in July says +03
 * and the same label in January says +02 — a fixed offset baked into a message
 * file would be wrong for half of every year. `Intl` abbreviates a zero offset
 * to a bare "GMT" (London in winter), which is the one shape that would make a
 * list of otherwise identical labels ragged, so it is expanded back to
 * `GMT+00:00`. The city is the IANA id's last segment with its underscores
 * opened out, which is why no message key is needed for it: `America/New_York`
 * reads "New York" in every locale, and translating a city list would be a
 * per-locale maintenance burden for names families already recognise.
 *
 * `now` is a caller's argument rather than a `new Date()` inside, so a React
 * caller can pass its request-stable clock and the server and first client
 * render cannot disagree about an offset across a DST boundary.
 */
export function formatTimezoneOptionLabel(
  zone: string,
  now: Date,
  locale: string,
): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = raw === "GMT" ? "GMT+00:00" : raw;
  const city = (zone.split("/").pop() ?? zone).replace(/_/g, " ");
  return `(${offset}) ${city}`;
}
