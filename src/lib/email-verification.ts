// Email-verification links.
//
// A signed, expiring token emailed to the address it is a claim about. The
// verify route validates it with no session required — the token *is* the
// authorization — and stamps `profiles.email_verified_at` through the admin
// client. So it must be unforgeable (HMAC) and it must expire.
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
// IDEMPOTENT, NOT SINGLE-USE
//
// Unlike the PIN reset, verifying twice is not a second privileged act — the
// second one writes the state that is already there. So there is deliberately no
// single-use machinery: a link works until it expires or the address changes,
// and a parent clicking it again from their inbox gets the same "verified" page
// rather than an error they cannot act on.
//
// Format: `${userId}.${expiresAtMs}.${hexHmac}`. userId is a UUID (no dots) and
// expiresAtMs is a base-10 integer, so splitting on "." is unambiguous. The
// email is NOT in the token — only in the signed payload, which is what keeps
// the address out of a URL that lands in browser history and server logs.
//
// SECRET: this reuses PIN_COOKIE_SECRET rather than introducing a second env
// var. Deliberate — the flows are unrelated, but a new secret is a new thing to
// provision in three environments and to rotate, for no gain here. Domain
// separation comes from the payload prefix (`email-verify:` vs `pin-reset:`),
// which is what stops a token minted by one flow from ever validating in the
// other; sharing an HMAC key across prefixed payloads is exactly the case
// prefixing exists for.
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

// A week. Long enough that a link found in a Sunday inbox still works, short
// enough that an address left unconfirmed goes back through a fresh send rather
// than being verifiable indefinitely from an old message.
const VERIFICATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// `email` is the address the profile held at mint time. Folding it into the
// signed payload (not the token) is what makes a changed address invalidate the
// link — see the header.
async function verificationSignature(
  userId: string,
  email: string,
  expiresAtMs: number,
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
    encoder.encode(`email-verify:${userId}:${email}:${expiresAtMs}`),
  );
  return toHex(signature);
}

/**
 * Mint a verification token for `userId`, valid for 7 days from `nowMs` and
 * bound to `email` — the address the profile holds right now, which is the one
 * the link is being sent to.
 */
export async function createEmailVerificationToken(
  userId: string,
  email: string,
  nowMs: number,
): Promise<string> {
  const expiresAtMs = nowMs + VERIFICATION_TOKEN_TTL_MS;
  const signature = await verificationSignature(userId, email, expiresAtMs);
  return `${userId}.${expiresAtMs}.${signature}`;
}

/**
 * Extract the (unverified) userId from a token so the caller can look up that
 * account's current email before verifying. Returns null on a malformed token.
 * This does NOT authorize anything — verifyEmailVerificationToken still must
 * pass.
 */
export function parseEmailVerificationTokenUserId(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  return parts[0] || null;
}

/**
 * Return the userId a valid, unexpired token authorizes, or null.
 * `currentEmail` is the address the profile holds NOW; a token minted against a
 * different one — i.e. the address changed since the link was sent — fails here.
 */
export async function verifyEmailVerificationToken(
  token: string,
  currentEmail: string,
  nowMs: number,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, signature] = parts;

  const expiresAtMs = Number(expiresRaw);
  if (!Number.isInteger(expiresAtMs) || expiresAtMs < nowMs) return null;

  const expected = await verificationSignature(userId, currentEmail, expiresAtMs);
  if (!constantTimeEqual(signature, expected)) return null;

  return userId;
}
