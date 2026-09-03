// Subscribed-calendar feed tokens.
//
// A calendar app polls a feed URL forever, with no session and no way to be
// prompted for one, so **the URL is the credential** — and for a real family
// the thing it discloses is a child's weekly whereabouts. This module mints and
// verifies the token that sits in that URL's path.
//
// TWO KINDS OF FEED, TWO KINDS OF TOKEN
//
// A token names either a **customer** — a real family, real children, real
// times and places — or an admin's **sandbox**, a fake family that exists only
// to be edited and watched. They are separate token kinds rather than one kind
// over two id spaces, because the two disclose entirely different things and a
// verifier that cannot tell them apart would eventually be asked to.
//
//   customer  `${customerId}.${hmac}`        payload `ics-feed:${id}`
//   sandbox   `s.${sandboxId}.${hmac}`       payload `ics-feed-sandbox:${id}`
//
// The `s.` marker is what makes the kind explicit rather than inferred: a UUID
// contains no dot, so a two-part token is a customer token and a three-part one
// beginning `s` is a sandbox token, and nothing else parses at all. The payload
// prefixes are what make a token minted for one kind fail to verify as the
// other even though both are signed under the same key — the same domain
// separation `src/lib/email-verification.ts` requires of every flow sharing it.
//
// AN EXPLORATION STAND-IN FOR THE CUSTOMER KIND, AND ADEQUATE FOR THE SANDBOX
//
// `docs/investigations/session-reminders-and-calendar-feed.md` decides that a
// real customer's token is a **random per-customer secret stored in the
// database** — revocable and reissuable — precisely because expiry is the wrong
// tool for a URL that is polled indefinitely. The HMAC below is neither
// revocable nor reissuable, and for a real family it is what lets the
// exploration hand a real `webcal://` URL to a real calendar app today. A
// sandbox token is a different question: there is no family behind it, the
// document it discloses is invented, and an admin who wants a new one deletes
// the row. So the signature is the whole answer there and stays.
//
// The path may additionally carry a `.ics` suffix, because some clients want a
// URL that looks like a file; it is stripped before parsing and is not part of
// the signed payload.
//
// Web Crypto rather than `node:crypto`, like every other token here, so the
// check keeps working if it ever moves to the Edge runtime.

/** The suffix a calendar client may append to make the URL look like a file. */
const ICS_SUFFIX = ".ics";

/** The leading segment that marks a sandbox token. Not a valid UUID, on purpose. */
const SANDBOX_MARKER = "s";

const CUSTOMER_PREFIX = "ics-feed:";
const SANDBOX_PREFIX = "ics-feed-sandbox:";

/** What a verified token authorizes: one family's feed, or one sandbox's. */
export type CalendarFeedSubject =
  | { kind: "customer"; customerId: string }
  | { kind: "sandbox"; sandboxId: string };

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

async function sign(payload: string): Promise<string> {
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
    encoder.encode(payload),
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
  return `${customerId}.${await sign(`${CUSTOMER_PREFIX}${customerId}`)}`;
}

/** Mint the feed token for one admin's sandbox family. */
export async function createSandboxFeedToken(
  sandboxId: string,
): Promise<string> {
  const signature = await sign(`${SANDBOX_PREFIX}${sandboxId}`);
  return `${SANDBOX_MARKER}.${sandboxId}.${signature}`;
}

/**
 * What a valid token authorizes, or `null`.
 *
 * Accepts the token with or without its `.ics` suffix. Everything else — a
 * malformed shape, a tampered signature, a customer token presented as a
 * sandbox one or the reverse, a token minted by another flow under the same
 * key — answers `null`, and the route turns that into a 404 rather than a 401:
 * whether a given customer exists is itself information.
 */
export async function verifyCalendarFeedToken(
  token: string,
): Promise<CalendarFeedSubject | null> {
  const parts = stripIcsSuffix(token).split(".");

  if (parts.length === 2) {
    const [customerId, signature] = parts;
    if (!customerId || !signature) return null;
    const expected = await sign(`${CUSTOMER_PREFIX}${customerId}`);
    if (!constantTimeEqual(signature, expected)) return null;
    return { kind: "customer", customerId };
  }

  if (parts.length === 3) {
    const [marker, sandboxId, signature] = parts;
    if (marker !== SANDBOX_MARKER || !sandboxId || !signature) return null;
    const expected = await sign(`${SANDBOX_PREFIX}${sandboxId}`);
    if (!constantTimeEqual(signature, expected)) return null;
    return { kind: "sandbox", sandboxId };
  }

  return null;
}
