import { describe, it, expect } from "vitest";

// Helpers read PIN_COOKIE_SECRET lazily; set it before importing the module.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  createEmailVerificationToken,
  parseEmailVerificationTokenUserId,
  verifyEmailVerificationToken,
} from "@/lib/email-verification";

const USER = "11111111-1111-1111-1111-111111111111";
const EMAIL = "parent@example.test";
const OTHER_EMAIL = "someone-else@example.test";

describe("email-verification token", () => {
  const NOW = 1_700_000_000_000;
  const TTL = 7 * 24 * 60 * 60 * 1000;

  it("round-trips and returns the userId before expiry", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    expect(await verifyEmailVerificationToken(token, EMAIL, NOW)).toBe(USER);
    expect(await verifyEmailVerificationToken(token, EMAIL, NOW + TTL - 1)).toBe(USER);
  });

  it("rejects once expired", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    expect(await verifyEmailVerificationToken(token, EMAIL, NOW + TTL + 1)).toBeNull();
  });

  // Verifying is idempotent on purpose: the second click writes the state the
  // first one already wrote, so a parent re-opening the link from their inbox
  // must see the same success rather than an error they cannot act on.
  it("is idempotent: the same token keeps validating", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    expect(await verifyEmailVerificationToken(token, EMAIL, NOW)).toBe(USER);
    expect(await verifyEmailVerificationToken(token, EMAIL, NOW + 1000)).toBe(USER);
  });

  // The binding that makes revocation unnecessary: the signature is over the
  // address the link was minted for, so changing it kills every outstanding
  // link — and a link minted for an old address can never verify a new one.
  it("stops validating once the account's email changes", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    expect(await verifyEmailVerificationToken(token, OTHER_EMAIL, NOW)).toBeNull();
  });

  it("rejects a tampered userId", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    const [, exp, sig] = token.split(".");
    const forged = `33333333-3333-3333-3333-333333333333.${exp}.${sig}`;
    expect(await verifyEmailVerificationToken(forged, EMAIL, NOW)).toBeNull();
  });

  it("rejects a tampered expiry (extending the window)", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    const [userId, exp, sig] = token.split(".");
    const forged = `${userId}.${Number(exp) + TTL}.${sig}`;
    expect(await verifyEmailVerificationToken(forged, EMAIL, NOW)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    const [userId, exp] = token.split(".");
    expect(
      await verifyEmailVerificationToken(`${userId}.${exp}.deadbeef`, EMAIL, NOW),
    ).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyEmailVerificationToken("only.two", EMAIL, NOW)).toBeNull();
    expect(await verifyEmailVerificationToken("", EMAIL, NOW)).toBeNull();
    expect(
      await verifyEmailVerificationToken("a.b.c.d", EMAIL, NOW),
    ).toBeNull();
  });

  it("rejects an expiry that is not an integer", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    const [userId, , sig] = token.split(".");
    expect(
      await verifyEmailVerificationToken(`${userId}.not-a-number.${sig}`, EMAIL, NOW),
    ).toBeNull();
  });

  it("parseEmailVerificationTokenUserId extracts the userId without verifying", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    expect(parseEmailVerificationTokenUserId(token)).toBe(USER);
    expect(parseEmailVerificationTokenUserId("only.two")).toBeNull();
    expect(parseEmailVerificationTokenUserId("")).toBeNull();
  });

  // Domain separation: the payload prefix is the only thing standing between
  // this flow and the PIN-reset flow, which shares the HMAC key.
  it("produces a hex signature and a three-part token", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL, NOW);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(USER);
    expect(Number(parts[1])).toBe(NOW + TTL);
    expect(parts[2]).toMatch(/^[0-9a-f]{64}$/);
  });
});
