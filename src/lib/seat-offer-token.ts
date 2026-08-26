// Seat-offer links.
//
// A signed token emailed to a waitlisted family when an admin offers them a
// seat that has opened. The accept/decline landing page validates it with no
// session required — the token *is* the authorization, and the reader may be
// signed out, or signed in as somebody else on a shared family device — so it
// must be unforgeable (HMAC).
//
// BOUND TO THE OFFER, NOT JUST THE PARTICIPATION
//
// The signed payload carries the participation id AND the exact
// `participations.seat_offer_sent_at` the offer was stamped with, and the
// responding RPC compares that instant against the one the row holds now. That
// binding is what makes the token single-use, with no revocation table and no
// cleanup job — every way an offer can end also moves or removes the stamp:
//
//   - accept  → the row goes active and the offer columns are cleared, so
//               `seat_offer_sent_at` is NULL and nothing matches
//   - decline → the row is deleted outright
//   - re-offer after expiry → a fresh stamp, so yesterday's link is stale
//
// A stale link is answered as "no longer valid" rather than as an error: it is
// the ordinary outcome of a family clicking the same mail twice.
//
// EXPIRY IS DERIVED, NOT CARRIED
//
// The window is `SEAT_OFFER_WINDOW_DAYS` from the stamp, so the deadline is a
// function of a value already in the payload — there is no separate `expiresAt`
// to disagree with the database's own `interval '5 days'`. The token expiring
// and the RPC refusing an out-of-window offer are two statements of one rule,
// and this file's copy is the one that lets the landing page say "expired"
// without a round trip. The RPC still checks for itself, because the in-app
// path (a parent pressing Accept in My SOG) carries no token at all.
//
// Format: `${participationId}.${sentAtMs}.${hexHmac}`. The participation id is
// a UUID (no dots) and `sentAtMs` is a base-10 integer, so splitting on "." is
// unambiguous. Nothing about the family or the product is in the token.
//
// SECRET: this reuses PIN_COOKIE_SECRET, the third flow to do so, for the
// reason `email-verification.ts` sets out — a new env var is a new thing to
// provision in three environments and to rotate, for no gain. Domain separation
// comes from the payload prefix (`seat-offer:`), which is what stops a token
// minted by one flow from ever validating in another.
//
// Web Crypto (not node:crypto), matching the two flows beside it: this has to
// keep working if the check ever moves to the Edge runtime.

import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";

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

async function offerSignature(
  participationId: string,
  sentAtMs: number,
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
    encoder.encode(`seat-offer:${participationId}:${sentAtMs}`),
  );
  return toHex(signature);
}

/** What a token says, once its signature has been checked. */
export interface SeatOfferTokenClaims {
  participationId: string;
  /** The `seat_offer_sent_at` the offer was stamped with, as epoch ms. */
  sentAtMs: number;
}

/**
 * Mint a link token for one offer.
 *
 * `sentAt` must be the instant the RPC actually stored — not the moment the
 * route decided to send. The RPC returns its own stamp for exactly this reason:
 * a token signed over a value the row does not hold cannot ever be redeemed.
 */
export async function createSeatOfferToken(
  participationId: string,
  sentAt: Date,
): Promise<string> {
  const sentAtMs = sentAt.getTime();
  const signature = await offerSignature(participationId, sentAtMs);
  return `${participationId}.${sentAtMs}.${signature}`;
}

/**
 * The claims a well-formed, correctly-signed token carries — or null.
 *
 * **Signature only. This says nothing about whether the offer is still live**,
 * because "expired" and "invalid" are two different answers and the landing
 * page shows different copy for each: an expired offer is a real offer the
 * family missed, and the page says so; a forged or corrupted token is answered
 * generically, naming nothing. Ask {@link isSeatOfferTokenExpired} for the
 * other half.
 */
export async function readSeatOfferToken(
  token: string | null | undefined,
): Promise<SeatOfferTokenClaims | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [participationId, sentAtRaw, signature] = parts;
  if (!participationId) return null;

  const sentAtMs = Number(sentAtRaw);
  // `Number("")` is 0 and `Number(" 1 ")` is 1, so the round-trip back to a
  // string is what actually pins the spelling — a token whose middle field is
  // not the canonical decimal integer is not one we minted.
  if (!Number.isSafeInteger(sentAtMs) || String(sentAtMs) !== sentAtRaw) {
    return null;
  }

  const expected = await offerSignature(participationId, sentAtMs);
  if (!constantTimeEqual(signature, expected)) return null;

  return { participationId, sentAtMs };
}

/**
 * Whether the response window has closed on these claims, at `nowMs`.
 *
 * The same arithmetic the three RPCs do with `interval '5 days'` — see
 * `SEAT_OFFER_WINDOW_DAYS` for why the number lives in both places. The
 * boundary is exclusive at the far end: an offer is live while
 * `sentAt + window > now`, so the instant the window elapses it is expired,
 * which is the way the SQL predicates are written too.
 */
export function isSeatOfferTokenExpired(
  claims: SeatOfferTokenClaims,
  nowMs: number,
): boolean {
  return claims.sentAtMs + SEAT_OFFER_WINDOW_MS <= nowMs;
}
