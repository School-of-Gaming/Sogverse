// Parent-PIN "unlock" token.
//
// A customer session is "locked" until the parent enters their PIN once. When
// they do, src/app/api/auth/pin/* sets an HttpOnly cookie holding this token;
// src/proxy.ts (pages) and requireRole() (API) treat the session as unlocked
// only while the cookie matches. There is no server-side state — the token is
// an HMAC over (userId, sessionId), so:
//
//   - It can't be forged without PIN_COOKIE_SECRET.
//   - It's bound to the user, so a stale cookie can't unlock a different account.
//   - It's bound to the auth session_id, which is stable across token refreshes
//     (the unlock survives a browser close, per spec) but changes on re-login or
//     account switch — so switching to a gamer and back auto re-locks, with no
//     explicit invalidation needed (we still clear it on switch/sign-out for
//     hygiene).
//
// Web Crypto (not node:crypto) because the proxy runs on the Edge runtime.
// See docs/parent-pin-architecture.md.

export const PIN_COOKIE_NAME = "sog_pin_verified";

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

/** HMAC-SHA256(secret, `${userId}:${sessionId}`) as hex. */
export async function pinTokenFor(userId: string, sessionId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${userId}:${sessionId}`));
  return toHex(signature);
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

/** True when the cookie value is the valid unlock token for this user+session. */
export async function isPinTokenValid(
  cookieValue: string | undefined | null,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await pinTokenFor(userId, sessionId);
  return constantTimeEqual(cookieValue, expected);
}

/**
 * Cookie attributes for the unlock token. Persistent (no maxAge) so the unlock
 * survives a browser close; re-lock is driven by the session_id binding and by
 * explicit clearing on switch/sign-out, not by expiry (a TTL is a deferred
 * future improvement).
 */
export function pinCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

// ---------------------------------------------------------------------------
// PIN reset tokens (email flow)
// ---------------------------------------------------------------------------
// A forgotten PIN is reset via a link emailed to the parent's inbox — the only
// channel a child on a shared device can't reach. The link carries this signed,
// expiring token; /api/auth/pin/reset validates it (no session required) and
// sets the new PIN via the admin-only set_pin_for_user RPC. The token is the
// authorization, so it must be unforgeable (HMAC) and short-lived.
//
// Format: `${userId}.${expiresAtMs}.${hexHmac}`. userId is a UUID (no dots) and
// expiresAtMs is a base-10 integer, so splitting on "." is unambiguous.

// The single expiry on the PIN-reset link. This flow does NOT use a Supabase
// recovery link/OTP (that's the separate password-reset email, governed by
// `otp_expiry` in supabase/config.toml) — it's a standalone signed token, so
// this is the only clock that applies to it. See /api/auth/pin/reset.
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function resetTokenSignature(userId: string, expiresAtMs: number): Promise<string> {
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
    encoder.encode(`pin-reset:${userId}:${expiresAtMs}`),
  );
  return toHex(signature);
}

/** Mint a reset token for `userId`, valid for 24h from `nowMs`. */
export async function createPinResetToken(userId: string, nowMs: number): Promise<string> {
  const expiresAtMs = nowMs + RESET_TOKEN_TTL_MS;
  const signature = await resetTokenSignature(userId, expiresAtMs);
  return `${userId}.${expiresAtMs}.${signature}`;
}

/** Return the userId a valid, unexpired token authorizes, or null. */
export async function verifyPinResetToken(token: string, nowMs: number): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresRaw, signature] = parts;

  const expiresAtMs = Number(expiresRaw);
  if (!Number.isInteger(expiresAtMs) || expiresAtMs < nowMs) return null;

  const expected = await resetTokenSignature(userId, expiresAtMs);
  if (!constantTimeEqual(signature, expected)) return null;

  return userId;
}
