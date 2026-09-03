import { describe, it, expect } from "vitest";

// Helpers read PIN_COOKIE_SECRET lazily; set it before importing the module.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  pinTokenFor,
  isPinTokenValid,
  pinCookieOptions,
  mintFamilySessionToken,
  isFamilySessionTokenValid,
  familySessionCookieOptions,
  createPinResetToken,
  verifyPinResetToken,
  parseResetTokenUserId,
} from "@/lib/pin-session";

const USER = "11111111-1111-1111-1111-111111111111";
const SESSION = "session-abc";

describe("pin-session unlock token", () => {
  it("is deterministic for the same (user, session)", async () => {
    const a = await pinTokenFor(USER, SESSION);
    const b = await pinTokenFor(USER, SESSION);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256
  });

  it("validates the matching token", async () => {
    const token = await pinTokenFor(USER, SESSION);
    expect(await isPinTokenValid(token, USER, SESSION)).toBe(true);
  });

  it("rejects a missing cookie", async () => {
    expect(await isPinTokenValid(undefined, USER, SESSION)).toBe(false);
    expect(await isPinTokenValid(null, USER, SESSION)).toBe(false);
    expect(await isPinTokenValid("", USER, SESSION)).toBe(false);
  });

  it("rejects a token bound to a different user", async () => {
    const token = await pinTokenFor("22222222-2222-2222-2222-222222222222", SESSION);
    expect(await isPinTokenValid(token, USER, SESSION)).toBe(false);
  });

  it("rejects a token bound to a different session (stale after switch/re-login)", async () => {
    const token = await pinTokenFor(USER, "other-session");
    expect(await isPinTokenValid(token, USER, SESSION)).toBe(false);
  });

  it("rejects a garbage value", async () => {
    expect(await isPinTokenValid("not-a-real-token", USER, SESSION)).toBe(false);
  });
});

/**
 * The switch route's signature on a session it created. Everything asserted
 * here is the unlock token's shape re-checked on a second payload, and that is
 * the point: the marker decides which credential leaving a gamer session costs,
 * so it has to be as unforgeable and as tightly bound as the cookie that
 * unlocks a parent.
 */
describe("family-session marker", () => {
  it("is deterministic for the same (user, session)", async () => {
    const a = await mintFamilySessionToken(USER, SESSION);
    const b = await mintFamilySessionToken(USER, SESSION);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates the matching marker", async () => {
    const marker = await mintFamilySessionToken(USER, SESSION);
    expect(await isFamilySessionTokenValid(marker, USER, SESSION)).toBe(true);
  });

  it("rejects a missing marker", async () => {
    expect(await isFamilySessionTokenValid(undefined, USER, SESSION)).toBe(false);
    expect(await isFamilySessionTokenValid(null, USER, SESSION)).toBe(false);
    expect(await isFamilySessionTokenValid("", USER, SESSION)).toBe(false);
  });

  it("rejects a marker bound to a different user", async () => {
    const marker = await mintFamilySessionToken(
      "22222222-2222-2222-2222-222222222222",
      SESSION,
    );
    expect(await isFamilySessionTokenValid(marker, USER, SESSION)).toBe(false);
  });

  it("rejects a marker left behind by the session this one replaced", async () => {
    // The property the whole model rests on: a stale marker cannot classify the
    // session that came after it, so signing out and signing in with a password
    // cannot inherit a family classification.
    const marker = await mintFamilySessionToken(USER, "previous-session");
    expect(await isFamilySessionTokenValid(marker, USER, SESSION)).toBe(false);
  });

  it("is a different payload class from the unlock token", async () => {
    // The two cookies sign different prefixes under one secret, so neither can
    // be presented as the other — swapping them would be a way to mark a
    // session family by unlocking it, or vice versa.
    const unlock = await pinTokenFor(USER, SESSION);
    const marker = await mintFamilySessionToken(USER, SESSION);
    expect(marker).not.toBe(unlock);
    expect(await isFamilySessionTokenValid(unlock, USER, SESSION)).toBe(false);
    expect(await isPinTokenValid(marker, USER, SESSION)).toBe(false);
  });

  it("rejects a garbage value", async () => {
    expect(await isFamilySessionTokenValid("not-a-real-marker", USER, SESSION)).toBe(
      false,
    );
  });
});

/**
 * The two cookies' expiries run opposite ways, and each direction is the safe
 * one for the question that cookie answers — so the pair is pinned here rather
 * than left to whichever mint site is being edited.
 *
 * The unlock cookie is a SESSION cookie: dropping it when the browser quits
 * re-locks the parent, which is free security. The marker is the reverse — a
 * dropped marker re-classifies a switched-in child as self-authenticated and
 * asks their family for a password they may not have, turning a browser restart
 * at home into a dead end. Its long `maxAge` is therefore load-bearing, and the
 * `session_id` binding is what actually expires it.
 */
describe("cookie options", () => {
  it("gives the family marker a year and the unlock cookie no expiry at all", () => {
    expect(familySessionCookieOptions().maxAge).toBe(365 * 24 * 60 * 60);
    expect("maxAge" in pinCookieOptions()).toBe(false);
    expect("expires" in pinCookieOptions()).toBe(false);
  });

  it("keeps both HttpOnly, lax and site-wide", () => {
    // Everything else a mint site could quietly relax. `secure` follows
    // NODE_ENV, so it is asserted against that rather than against a literal.
    const secure = process.env.NODE_ENV === "production";
    expect(pinCookieOptions()).toEqual({
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    });
    expect(familySessionCookieOptions()).toEqual({
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  });
});

describe("pin-session reset token", () => {
  const NOW = 1_700_000_000_000;
  const TTL = 24 * 60 * 60 * 1000;
  // Two distinct bcrypt-shaped hashes: the PIN's stored hash at mint time, and
  // what it becomes after a reset rotates it. The token is bound to the former.
  const OLD_HASH = "$2a$06$oldhasholdhasholdhashuOLD0000000000000000000000000000";
  const NEW_HASH = "$2a$06$newhashnewhashnewhashuNEW1111111111111111111111111111";

  it("round-trips and returns the userId before expiry", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    expect(await verifyPinResetToken(token, OLD_HASH, NOW)).toBe(USER);
    expect(await verifyPinResetToken(token, OLD_HASH, NOW + TTL - 1)).toBe(USER);
  });

  it("rejects once expired", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    expect(await verifyPinResetToken(token, OLD_HASH, NOW + TTL + 1)).toBeNull();
  });

  // Single-use regression: the token is bound to the PIN hash that existed when
  // it was minted. The reset rotates pin_hash (bcrypt re-salts even for the same
  // digits), so replaying the link — or replaying after any later change — fails.
  it("is single-use: stops validating once the stored PIN hash changes", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    // Valid while the stored hash is unchanged (the one real use).
    expect(await verifyPinResetToken(token, OLD_HASH, NOW)).toBe(USER);
    // After the reset rotates pin_hash, the same token no longer validates.
    expect(await verifyPinResetToken(token, NEW_HASH, NOW)).toBeNull();
  });

  it("rejects a tampered userId", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    const [, exp, sig] = token.split(".");
    const forged = `33333333-3333-3333-3333-333333333333.${exp}.${sig}`;
    expect(await verifyPinResetToken(forged, OLD_HASH, NOW)).toBeNull();
  });

  it("rejects a tampered expiry (extending the window)", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    const [userId, exp, sig] = token.split(".");
    const forged = `${userId}.${Number(exp) + TTL}.${sig}`;
    expect(await verifyPinResetToken(forged, OLD_HASH, NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    const [userId, exp] = token.split(".");
    expect(await verifyPinResetToken(`${userId}.${exp}.deadbeef`, OLD_HASH, NOW)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyPinResetToken("only.two", OLD_HASH, NOW)).toBeNull();
    expect(await verifyPinResetToken("", OLD_HASH, NOW)).toBeNull();
  });

  it("parseResetTokenUserId extracts the userId without verifying", async () => {
    const token = await createPinResetToken(USER, OLD_HASH, NOW);
    expect(parseResetTokenUserId(token)).toBe(USER);
    expect(parseResetTokenUserId("only.two")).toBeNull();
    expect(parseResetTokenUserId("")).toBeNull();
  });
});
