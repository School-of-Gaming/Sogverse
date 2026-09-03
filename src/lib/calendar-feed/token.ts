// Subscribed-calendar feed tokens.
//
// A calendar app polls a feed URL forever, with no session and no way to be
// prompted for one, so **the URL is the credential** — and the thing it
// discloses is a child's weekly whereabouts. This module mints and verifies the
// token that sits in that URL's path.
//
// AN EXPLORATION STAND-IN, NOT THE SHAPE THE FEATURE WANTS
//
// `docs/investigations/session-reminders-and-calendar-feed.md` decides that the
// real token is a **random per-customer secret stored in the database** —
// revocable and reissuable — precisely because expiry is the wrong tool for a
// URL that is polled indefinitely. This is an HMAC instead, which is neither
// revocable nor reissuable: it is what lets the exploration hand a real
// `webcal://` URL to a real calendar app today, without a migration. Anything
// that graduates from the exploration replaces this module with the stored
// secret rather than growing a TTL onto it.
//
// Format: `${customerId}.${hexHmac}` — the same shape, for the same reason, as
// the email-verification token: a UUID contains no dot, so splitting on "." is
// unambiguous. The path may additionally carry a `.ics` suffix, because some
// clients want a URL that looks like a file; it is stripped before parsing and
// is not part of the signed payload.
//
// SECRET AND DOMAIN SEPARATION: this reuses `PIN_COOKIE_SECRET` and carries its
// own payload prefix `ics-feed:`, exactly as `src/lib/email-verification.ts`
// requires of every flow that shares the key. Its header lists the siblings;
// this one is the fifth.
//
// Web Crypto rather than `node:crypto`, like every other token here, so the
// check keeps working if it ever moves to the Edge runtime.

/** The suffix a calendar client may append to make the URL look like a file. */
const ICS_SUFFIX = ".ics";

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

async function feedSignature(customerId: string): Promise<string> {
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
    encoder.encode(`ics-feed:${customerId}`),
  );
  return toHex(signature);
}

/**
 * Strip the optional `.ics` suffix a client may have appended to the path
 * segment. Exported so the route can log or echo the bare token if it ever
 * needs to; verification calls it itself.
 */
export function stripIcsSuffix(segment: string): string {
  return segment.endsWith(ICS_SUFFIX)
    ? segment.slice(0, -ICS_SUFFIX.length)
    : segment;
}

/** Mint the feed token for one customer. Valid until the shared secret rotates. */
export async function createCalendarFeedToken(
  customerId: string,
): Promise<string> {
  return `${customerId}.${await feedSignature(customerId)}`;
}

/**
 * The customer id a valid token authorizes, or `null`.
 *
 * Accepts the token with or without its `.ics` suffix. Everything else — a
 * malformed shape, a tampered signature, a token minted by another flow under
 * the same key — answers `null`, and the route turns that into a 404 rather
 * than a 401: whether a given customer exists is itself information.
 */
export async function verifyCalendarFeedToken(
  token: string,
): Promise<string | null> {
  const parts = stripIcsSuffix(token).split(".");
  if (parts.length !== 2) return null;
  const [customerId, signature] = parts;
  if (!customerId || !signature) return null;

  const expected = await feedSignature(customerId);
  if (!constantTimeEqual(signature, expected)) return null;

  return customerId;
}
