import { describe, it, expect } from "vitest";

// Helpers read PIN_COOKIE_SECRET lazily; set it before importing the module.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  pinTokenFor,
  isPinTokenValid,
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
