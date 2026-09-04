import type { GamerSignIn, UserRole } from "@/types";

/**
 * How a gamer's account is addressed, in one place.
 *
 * A child account holds one of three sign-in modes (`gamer_profiles.sign_in`),
 * and the mode decides what the address on `auth.users` / `profiles.email`
 * actually *is*:
 *
 *  - `parent`   — a random synthetic handle nobody reads and nobody types. The
 *                 account is reached by an account switch from the parent.
 *  - `username` — a synthetic handle built from a username the parent chose, so
 *                 GoTrue's own uniqueness constraint on the address is what makes
 *                 the username unique. Login is an ordinary email + password.
 *  - `email`    — the child's real mailbox, which we may verify and write to.
 *
 * The first two are *synthetic*: strings that satisfy GoTrue's insistence on an
 * address without naming a mailbox. Everything in this module exists so that the
 * distinction is asked once, the same way, everywhere — a mail sent to a
 * synthetic address goes nowhere, and a "verified" stamp on one means nothing.
 *
 * Web Crypto rather than `node:crypto`, because the login form imports
 * {@link identifierToLoginEmail} from here and a `node:` import would follow it
 * into the browser bundle.
 */

/** The domain every synthetic gamer address lives under, `@` included. */
export const GAMER_EMAIL_DOMAIN = "@gamer.sogverse.internal";

/**
 * The bounds on a username, named so a text field can stop a parent typing past
 * them rather than restating the number in its own markup.
 *
 * A `maxLength` spelled as a literal beside a pattern that owns the same number
 * is two sources for one rule: the day the pattern widens, the field goes on
 * truncating at the old bound and the parent watches characters vanish with no
 * message saying why.
 */
export const GAMER_USERNAME_MIN_LENGTH = 3;
export const GAMER_USERNAME_MAX_LENGTH = 20;

/**
 * What a parent may pick as their child's username: 3–20 lowercase letters and
 * digits. Deliberately narrow — the value becomes the local part of an email
 * address, it is typed by a child on a keyboard they may be new to, and it is
 * read back to a parent who has to recognise it. Anything a case fold, an accent
 * or a lookalike character could make ambiguous is out.
 *
 * Built from the two bounds above rather than spelling them a second time, so
 * the pattern and every field that limits its input move together.
 *
 * The pattern tests an ALREADY-NORMALISED value; run {@link normalizeGamerUsername}
 * first (or use {@link isValidGamerUsername}, which does).
 */
export const GAMER_USERNAME_PATTERN = new RegExp(
  `^[a-z0-9]{${GAMER_USERNAME_MIN_LENGTH},${GAMER_USERNAME_MAX_LENGTH}}$`,
);

/** Trim the surrounding whitespace and fold to lowercase. */
export function normalizeGamerUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Whether `raw`, once normalised, is a username we will accept. */
export function isValidGamerUsername(raw: string): boolean {
  return GAMER_USERNAME_PATTERN.test(normalizeGamerUsername(raw));
}

/**
 * The auth address for a username-mode gamer. Normalises first, so a caller that
 * has not cannot mint two addresses for one username.
 */
export function usernameToSyntheticEmail(username: string): string {
  return `${normalizeGamerUsername(username)}${GAMER_EMAIL_DOMAIN}`;
}

/**
 * A fresh synthetic address for a switch-only (`parent` mode) gamer.
 *
 * Opaque on purpose: the parent never sees it and nobody ever types it. 64 bits
 * of entropy, so a collision with an existing handle is vanishingly improbable —
 * the create route still checks once, because GoTrue's uniqueness error is the
 * only other thing that would notice.
 *
 * A generated handle and a chosen username share one namespace, and that is
 * fine: GoTrue's uniqueness on the address is what stops the two from ever
 * naming one account, which is the same constraint that makes usernames unique
 * in the first place.
 */
export function randomSyntheticGamerEmail(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `g${hex}${GAMER_EMAIL_DOMAIN}`;
}

/**
 * Whether an address is one of ours rather than a mailbox. True for both
 * synthetic shapes — a random handle and a username-derived one — because the
 * question every caller is really asking is "would mail sent here reach a
 * person?", and the answer is no for both.
 */
export function isSyntheticGamerEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(GAMER_EMAIL_DOMAIN);
}

/**
 * Whether this account's stored address is a real mailbox.
 *
 * Every role but `gamer` holds one by construction — an adult signed up with it.
 * A gamer holds one only in `email` mode. Written as a question about the
 * account rather than about the string so a caller that has the row but not the
 * address (and there are several) can still ask it.
 */
export function hasRealEmail(profileLike: {
  role: UserRole | null;
  sign_in?: GamerSignIn | null;
}): boolean {
  if (profileLike.role !== "gamer") return true;
  return profileLike.sign_in === "email";
}

/**
 * What the login form posts to Supabase for whatever was typed in its one
 * identifier field.
 *
 * A child in username mode types `aino`, an adult types `aino@example.com`, and
 * the sign-in call takes an email either way — so the presence of an `@` is what
 * decides which of the two was meant. An address is passed through trimmed and
 * otherwise untouched (GoTrue normalises it); a username is normalised and given
 * the synthetic domain.
 *
 * This cannot be a username-first guess: a real address that happens to be short
 * and lowercase would otherwise be rewritten into a synthetic handle, and the
 * adult holding it would be told their password was wrong.
 */
export function identifierToLoginEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed;
  return usernameToSyntheticEmail(trimmed);
}

/**
 * The username inside a synthetic address, or null if there is none.
 *
 * A username-mode child's username lives nowhere but the local part of their
 * address — that is what makes GoTrue's uniqueness on the address *be*
 * uniqueness on the username — so every surface that shows one reads it back out
 * of here rather than off a column that does not exist.
 *
 * **The mode is the caller's to check, not this function's.** A random handle is
 * `g` plus sixteen hex characters, which satisfies the username pattern exactly
 * as a chosen name does — the two shapes share one namespace on purpose (see
 * {@link randomSyntheticGamerEmail}) and no string test can separate them. So
 * this answers "what would the username be", and every call site asks it only of
 * an account it already knows to be in `username` mode. Null is for a real
 * mailbox, and for anything that could not have been typed by a parent.
 */
export function gamerUsernameFromEmail(
  email: string | null | undefined,
): string | null {
  if (!isSyntheticGamerEmail(email) || typeof email !== "string") return null;
  const username = email
    .slice(0, email.length - GAMER_EMAIL_DOMAIN.length)
    .toLowerCase();
  return GAMER_USERNAME_PATTERN.test(username) ? username : null;
}
