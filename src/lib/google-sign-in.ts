/**
 * The codes the OAuth callback sends back to `/login` as `?error=`, and the
 * only ones the login page will show. Anything else in that param renders
 * nothing: it is a query string anyone can type, and a page that echoed
 * arbitrary codes would let a crafted link put words in our mouth.
 *
 * - `oauth_cancelled` — Google answered `access_denied`: the person backed out.
 * - `auth_callback_error` — anything else going wrong between Google and a
 *   session.
 * - `google_gamer` — the Google identity belongs to a gamer account, which
 *   never signs in that way; the callback has already signed it out again.
 */
export const OAUTH_LOGIN_ERRORS = [
  "oauth_cancelled",
  "auth_callback_error",
  "google_gamer",
] as const;

export type OAuthLoginError = (typeof OAUTH_LOGIN_ERRORS)[number];

export function isOAuthLoginError(value: unknown): value is OAuthLoginError {
  return (
    typeof value === "string" &&
    (OAUTH_LOGIN_ERRORS as readonly string[]).includes(value)
  );
}

/**
 * The `redirectTo` handed to `signInWithOAuth`: the callback route on the
 * **current** origin, never the configured site URL. The PKCE verifier is a
 * cookie written on the origin the button was pressed on, and the callback can
 * only exchange the code if it comes back to that same origin to read it.
 *
 * `next` is a locale-prefixed internal path or nothing; without one the
 * callback routes by role.
 */
export function googleCallbackUrl(origin: string, next: string | null): string {
  const url = new URL("/api/auth/callback", origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}
