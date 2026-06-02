import { describe, it, expect } from "vitest";

// Helpers read PIN_COOKIE_SECRET lazily; set it before importing the module.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  pinTokenFor,
  isPinTokenValid,
  createPinResetToken,
  verifyPinResetToken,
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

  it("round-trips and returns the userId before expiry", async () => {
    const token = await createPinResetToken(USER, NOW);
    expect(await verifyPinResetToken(token, NOW)).toBe(USER);
    expect(await verifyPinResetToken(token, NOW + TTL - 1)).toBe(USER);
  });

  it("rejects once expired", async () => {
    const token = await createPinResetToken(USER, NOW);
    expect(await verifyPinResetToken(token, NOW + TTL + 1)).toBeNull();
  });

  it("rejects a tampered userId", async () => {
    const token = await createPinResetToken(USER, NOW);
    const [, exp, sig] = token.split(".");
    const forged = `33333333-3333-3333-3333-333333333333.${exp}.${sig}`;
    expect(await verifyPinResetToken(forged, NOW)).toBeNull();
  });

  it("rejects a tampered expiry (extending the window)", async () => {
    const token = await createPinResetToken(USER, NOW);
    const [userId, exp, sig] = token.split(".");
    const forged = `${userId}.${Number(exp) + TTL}.${sig}`;
    expect(await verifyPinResetToken(forged, NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createPinResetToken(USER, NOW);
    const [userId, exp] = token.split(".");
    expect(await verifyPinResetToken(`${userId}.${exp}.deadbeef`, NOW)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyPinResetToken("only.two", NOW)).toBeNull();
    expect(await verifyPinResetToken("", NOW)).toBeNull();
  });
});
