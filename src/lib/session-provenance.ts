/**
 * Where a session came from: opened by whoever holds this account's own
 * credential, or handed over from another family member's session.
 *
 * WHY IT DECIDES ANYTHING. Leaving a gamer session is priced by this, and the
 * two answers are not two prices: a family session is inside the home, so a
 * parent's PIN is the accepted friction; an own session may be a school computer
 * a child signed into and walked away from, and a four-digit PIN with no rate
 * limit is not what should stand between that machine and the parent's account
 * — so an own session cannot switch at all, and the way to the other person's
 * account is to sign out and sign in as them.
 *
 * THE SIGNAL IS A MARKER THE SWITCH ROUTE MINTS, NOT SOMETHING READ OFF THE
 * TOKEN. The account-switch route signs a cookie bound to `(userId,
 * session_id)` on every session its OTP path creates
 * (`FAMILY_SESSION_COOKIE_NAME` in `src/lib/pin-session.ts`), and that marker is
 * the whole of what makes a session `family`. It is the switch route's signature
 * on a session it built, rather than an inference about how a session looks.
 *
 * The inference is what this used to be, and it was wrong in the one direction
 * that costs something. The JWT's `amr` records `otp` for a switch-created
 * session and `password` for a typed sign-in, so "no password method" reads like
 * "switched in" — except that a password-RECOVERY session records `otp` too.
 * A child in email mode who requests their own reset link, opens it and
 * abandons the form would then hold a session classified as switched-in, i.e. a
 * PIN-only path into the parent's account, opened by a link the child can ask
 * for themselves. No claim in the token separates the two cases; only the mint
 * site does, which is why the marker is the primary signal.
 *
 * THE CONSERVATIVE DIRECTION IS NOW `own`, and that is the point of the change.
 * A session we cannot positively identify as a switch is refused the switch
 * outright rather than offered it for four digits — the *stronger* answer, so an
 * unclassifiable session can never be the cheap way in. (The old derivation
 * defaulted to `family`, which was fail-open toward the weaker gate.)
 *
 * `amr` survives as a second, redundant condition: a session whose token says a
 * password was typed is `own` even if it somehow carries a valid marker. The
 * binding to `session_id` already makes that combination unreachable — a
 * password sign-in produces a new session id, and only the switch route mints
 * markers — so this is a guard against a future path that mints one more
 * loosely, not against anything reachable today.
 */

export type SessionProvenance = "own" | "family";

/** Whether one `amr` entry names the password method. */
function isPasswordMethod(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  return "method" in entry && entry.method === "password";
}

/**
 * Whether the token says this session was opened by typing a password.
 *
 * Takes `unknown` because that is honestly what a claim is: the value is
 * whatever the token carried, and a token minted by an older GoTrue may carry
 * nothing at all.
 */
export function amrNamesPassword(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const entries: unknown[] = amr;
  return entries.some(isPasswordMethod);
}

/**
 * Classify a session from the switch route's marker plus the token's `amr`.
 *
 * `familyMarkerValid` is the caller's verdict on the marker cookie — validated
 * against the *current* session's `(userId, session_id)`, never merely present.
 * Server callers get it from `readSessionProvenance()` in `src/lib/auth.ts`
 * rather than assembling it themselves.
 */
export function sessionProvenance(args: {
  amr: unknown;
  familyMarkerValid: boolean;
}): SessionProvenance {
  if (!args.familyMarkerValid) return "own";
  return amrNamesPassword(args.amr) ? "own" : "family";
}
