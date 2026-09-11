/**
 * The `locale` cookie: its name, its retention, and the attributes a
 * server-side write has to state to match what the browser writes.
 *
 * **What the cookie is for.** It is the hint the bare-path ladder reads — a
 * bare `/parent` becomes `/fi/parent` because this cookie says `fi`. It is a
 * preference, never a credential, so it is readable by script (the picker
 * writes it from the browser) and it never decides what a prefixed URL
 * renders.
 *
 * **Who may write it.** The picker, and the two server-side auth flows that
 * hand a signed-in reader to a bare path (the OAuth callback and the account
 * switch), plus the login form client-side — all three seeding it from
 * `profiles.locale` so a fresh device lands in the reader's stored language.
 * Nothing else: visiting a prefixed URL is reading, not choosing.
 *
 * The attributes below mirror the browser-side writer in `@/lib/cookies` —
 * same path, same `SameSite`, same year of retention — so a server write and a
 * picker write land on one cookie rather than two the browser then has to pick
 * between.
 */

const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

export const LOCALE_COOKIE_NAME = "locale";

export const LOCALE_COOKIE_MAX_AGE = YEAR_IN_SECONDS;

/**
 * Attributes for a server-side write (`cookies().set`, `response.cookies.set`).
 *
 * `secure` follows the environment rather than being hardcoded: a `Secure`
 * cookie is dropped outright on `http://localhost:3000`, which is every local
 * dev session, and a sign-in that silently failed to seed the locale is
 * exactly the bug this shared helper exists to prevent.
 */
export function localeCookieOptions() {
  return {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  } as const;
}
