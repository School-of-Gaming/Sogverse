/**
 * Where a session came from, read off the JWT's `amr` claim.
 *
 * GoTrue records one entry in `amr` (Authentication Methods References) per
 * authentication event that built the session — an array of
 * `{ method, timestamp }` — and the method names are the ones the flow used.
 * Two of them matter here, and both were confirmed against production tokens:
 *
 *  - a session created by the account-switch route, which mints a magic-link OTP
 *    server-side and redeems it, records **`otp`**;
 *  - a session created by signing in with an email and a password records
 *    **`password`**.
 *
 * So the question "did the person at this keyboard type this account's own
 * password?" is answerable from the token alone, with no server state and no
 * extra round trip:
 *
 *  - **`own`** — some method is `password`. The session was opened by whoever
 *    holds this account's credential.
 *  - **`family`** — no method is `password`. The session was handed over from
 *    another family member's session, which is what an account switch is.
 *
 * WHY IT DECIDES ANYTHING. Leaving a gamer session costs a credential, and which
 * credential depends on this: a family session is inside the home, so a parent's
 * PIN is the accepted friction; an own session may be a school computer a child
 * signed into and walked away from, and a four-digit PIN with no rate limit is
 * not what should stand between that machine and the parent's account. There the
 * price is the target account's own password.
 *
 * THE CONSERVATIVE DIRECTION IS `family`, and it is what an unknown method gets.
 * A session we cannot classify is treated as switched-in rather than
 * self-authenticated, which asks for the PIN rather than waiving a gate.
 *
 * A RECOVERY SESSION COUNTS AS `family`, and that is a real consequence worth
 * naming: clicking a password-reset link opens a session whose `amr` carries
 * `otp` (or `recovery`), not `password`. That would be a way into the PIN-gated
 * path without typing a password — except that the reset form signs its own
 * session out immediately after setting the password, so no such session
 * survives the page that created it. This module is only correct while that
 * remains true; if the reset flow ever leaves the user signed in, this
 * derivation has to learn about the recovery method explicitly.
 */

export type SessionProvenance = "own" | "family";

/** Whether one `amr` entry names the password method. */
function isPasswordMethod(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  return "method" in entry && entry.method === "password";
}

/**
 * Derive the provenance of a session from the `amr` claim of its access token.
 *
 * Takes `unknown` because that is honestly what a claim is: the value is
 * whatever the token carried, and a token minted by an older GoTrue may carry
 * nothing at all. Anything that is not an array of entries naming `password`
 * answers `family`.
 */
export function sessionProvenanceFromAmr(amr: unknown): SessionProvenance {
  if (!Array.isArray(amr)) return "family";
  const entries: unknown[] = amr;
  return entries.some(isPasswordMethod) ? "own" : "family";
}
