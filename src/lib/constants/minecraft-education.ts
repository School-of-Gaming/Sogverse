/**
 * The Minecraft Education accounts this platform may reset, and how one entry
 * is read.
 *
 * A leaf module on purpose: the same rule has to hold in three places that
 * cannot import each other — the card's textarea (a client bundle), the route's
 * body schema, and the Graph module (server-only, holding the Azure secret) —
 * and a rule restated three times is a rule that will be three rules by the
 * next edit.
 */

/**
 * The two domains in the sog.gg Azure AD tenant that hold shared Minecraft
 * Education class accounts, in the order a bare username is probed.
 * `@gamer.sog.gg` first because it is the overwhelmingly common case, and it is
 * also the one that keeps the password it is given.
 *
 * **This list is a security boundary, not a convenience.** The reset runs with
 * tenant-wide Graph credentials (the service principal holds Password
 * Administrator), so an entry naming any other domain would reset *that*
 * account — a staff mailbox, an admin — and hand the new password to whoever
 * typed the name. Certification decides who may use the tool; this decides what
 * the tool may touch, and the second half is the one that keeps a certified
 * educator from resetting their way upward. It is enforced server-side; the
 * client filter in front of it is only there so a bad paste is explained
 * instead of 400-ing a class list.
 */
export const MINECRAFT_EDUCATION_DOMAINS = [
  "gamer.sog.gg",
  "gedu.sog.gg",
] as const;

export type MinecraftEducationDomain =
  (typeof MINECRAFT_EDUCATION_DOMAINS)[number];

/**
 * The domain whose accounts must change their password on first sign-in.
 * A gedu account is a person's, so a password somebody else chose for it is a
 * temporary one; a gamer account is a shared class login and keeps what it is
 * given, because the whole point is reading it out to the room.
 */
export const FORCE_CHANGE_DOMAIN: MinecraftEducationDomain = "gedu.sog.gg";

/**
 * One entry as the tool understands it — the single reading of the rule that
 * the textarea, the request schema and the Graph module all defer to.
 *
 * `username` and `upn` come back **sanitized** (trimmed, lower-cased), because
 * that is the name the account actually has; the raw spelling stays with the
 * caller for labelling the row it came from.
 */
export type MinecraftEducationEntry =
  /** A bare name — looked for on each domain above, in that order. */
  | { kind: "bare"; username: string }
  /** An address on an allowed domain — reset at exactly that UPN, no probing. */
  | {
      kind: "addressed";
      username: string;
      domain: MinecraftEducationDomain;
      upn: string;
    }
  /** Empty, or carrying whitespace — nothing to look up. */
  | { kind: "invalid" }
  /** An address on a domain this tool does not reset. */
  | { kind: "unsupported-domain" };

export function parseMinecraftEducationEntry(
  raw: string,
): MinecraftEducationEntry {
  const sanitized = raw.trim().toLowerCase();

  if (!sanitized || /\s/.test(sanitized)) return { kind: "invalid" };
  if (!sanitized.includes("@")) return { kind: "bare", username: sanitized };

  // Exactly one `@`, a name in front of it, and a domain we reset behind it.
  // Anything else — two `@`s, a bare domain, somebody's real mailbox — is the
  // unsupported case, and the caller decides whether that is a warning in front
  // of a submit or a failure row after one.
  const parts = sanitized.split("@");
  if (parts.length !== 2 || !parts[0]) return { kind: "unsupported-domain" };

  const domain = MINECRAFT_EDUCATION_DOMAINS.find((d) => d === parts[1]);
  if (domain === undefined) return { kind: "unsupported-domain" };

  return {
    kind: "addressed",
    username: parts[0],
    domain,
    upn: `${parts[0]}@${domain}`,
  };
}
