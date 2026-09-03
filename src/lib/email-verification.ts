// Email-verification links.
//
// A signed token emailed to the address it is a claim about. The verify route
// validates it with no session required — the token *is* the authorization —
// and stamps `profiles.email_verified_at` through the admin client. So it must
// be unforgeable (HMAC).
//
// BOUND TO THE CURRENT ADDRESS, NOT JUST THE ACCOUNT
//
// The signed payload carries the email the link was minted for, and verification
// re-derives the signature from the address the profile holds *now*. Change the
// address and every outstanding link for that account stops validating on its
// own — no revocation table, no cleanup job. That is the same trick the PIN
// reset token plays with the stored PIN hash, applied to the thing this token is
// actually about. It also closes the case that matters: a link minted for an old
// address must never verify a new one.
//
// NO EXPIRY, AND IDEMPOTENT RATHER THAN SINGLE-USE
//
// A link works until the address changes, however long that takes — a parent
// opening their welcome email a month late clicks it and it works. Expiry
// would only defend a token whose use is dangerous, and using this one twice
// (or having it leak) does nothing but write the state that is already there:
// no session, no privilege, no data. So there is deliberately no TTL and no
// single-use machinery. THE CONTRACT THIS RESTS ON: verified status is purely
// informational. If it ever starts gating something security-relevant (account
// recovery, trusted comms), add expiry then and bump the payload prefix
// (`email-verify:` → `email-verify-v2:`) — the bump alone invalidates every
// link minted under this contract.
//
// Format: `${userId}.${hexHmac}`. userId is a UUID (no dots), so splitting on
// "." is unambiguous. The email is NOT in the token — only in the signed
// payload, which is what keeps the address out of a URL that lands in browser
// history and server logs.
//
// SECRET: this reuses PIN_COOKIE_SECRET rather than introducing a second env
// var. Deliberate — the flows are unrelated, but a new secret is a new thing to
// provision in three environments and to rotate, for no gain here. Domain
// separation comes from the payload prefix (`email-verify:` vs `pin-reset:`),
// which is what stops a token minted by one flow from ever validating in the
// other; sharing an HMAC key across prefixed payloads is exactly the case
// prefixing exists for. The inventory of payload classes under this key, which
// a new one joins by adding its own prefix here:
//
//   1. `pin-reset:`      — the PIN reset link (`pin-session.ts`).
//   2. `email-verify:`   — this module.
//   3. `seat-offer:`     — the seat offer link (`seat-offer-token.ts`).
//   4. `family-session:` — the switch route's marker on a session it created
//                          (`pin-session.ts`).
//   5. (no prefix)       — the PIN unlock cookie, which signs
//                          `${userId}:${sessionId}` bare.
//
// The bare one is the exception and stays the only one: it cannot collide with
// a prefixed payload because its verifier derives both components from the
// caller's own JWT rather than from the token, and a UUID can never begin with
// a prefix string. Any NEW payload class must carry its own prefix; do not add
// another bare one.
//
// The changed-address reset watches `profiles.email` (a DB trigger), which is
// the only email this app ever changes. An auth-side change that bypassed
// profiles (dashboard edit, a future auth.updateUser flow) would leave the
// stamp and the binding pointing at the stale string — if an email-change flow
// is ever built, it must write through profiles.email for the reset to hold.
//
// Web Crypto (not node:crypto) for the same reason as pin-session: this has to
// keep working if the check ever moves to the Edge runtime.

function getSecret(): string {
  const secret = process.env.PIN_COOKIE_SECRET;
  if (!secret) {
    throw new Error("PIN_COOKIE_SECRET is not set");
  }
  return secret;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Constant-time string compare — both inputs are fixed-length hex digests. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// `email` is the address the profile held at mint time. Folding it into the
// signed payload (not the token) is what makes a changed address invalidate the
// link — see the header.
async function verificationSignature(
  userId: string,
  email: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`email-verify:${userId}:${email}`),
  );
  return toHex(signature);
}

/**
 * Mint a verification token for `userId`, bound to `email` — the address the
 * profile holds right now, which is the one the link is being sent to. Valid
 * until that address changes.
 */
export async function createEmailVerificationToken(
  userId: string,
  email: string,
): Promise<string> {
  const signature = await verificationSignature(userId, email);
  return `${userId}.${signature}`;
}

/**
 * Extract the (unverified) userId from a token so the caller can look up that
 * account's current email before verifying. Returns null on a malformed token.
 * This does NOT authorize anything — verifyEmailVerificationToken still must
 * pass.
 */
export function parseEmailVerificationTokenUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  return parts[0] || null;
}

/**
 * Return the userId a valid token authorizes, or null.
 * `currentEmail` is the address the profile holds NOW; a token minted against a
 * different one — i.e. the address changed since the link was sent — fails here.
 */
export async function verifyEmailVerificationToken(
  token: string,
  currentEmail: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [userId, signature] = parts;

  const expected = await verificationSignature(userId, currentEmail);
  if (!constantTimeEqual(signature, expected)) return null;

  return userId;
}
