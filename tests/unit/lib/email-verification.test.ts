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
  it("round-trips and returns the userId", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    expect(await verifyEmailVerificationToken(token, EMAIL)).toBe(USER);
  });

  // There is deliberately no expiry: the token's only power is to write a
  // purely informational flag, so a link works however late it is opened.
  // The module header records the contract that makes this safe — and the
  // prefix bump that revokes everything if that contract ever changes.
  it("is idempotent: the same token keeps validating", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    expect(await verifyEmailVerificationToken(token, EMAIL)).toBe(USER);
    expect(await verifyEmailVerificationToken(token, EMAIL)).toBe(USER);
  });

  // The binding that makes revocation (and expiry) unnecessary: the signature
  // is over the address the link was minted for, so changing it kills every
  // outstanding link — and a link minted for an old address can never verify
  // a new one.
  it("stops validating once the account's email changes", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    expect(await verifyEmailVerificationToken(token, OTHER_EMAIL)).toBeNull();
  });

  it("rejects a tampered userId", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    const [, sig] = token.split(".");
    const forged = `33333333-3333-3333-3333-333333333333.${sig}`;
    expect(await verifyEmailVerificationToken(forged, EMAIL)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    const [userId] = token.split(".");
    expect(
      await verifyEmailVerificationToken(`${userId}.deadbeef`, EMAIL),
    ).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyEmailVerificationToken("no-dot-at-all", EMAIL)).toBeNull();
    expect(await verifyEmailVerificationToken("", EMAIL)).toBeNull();
    expect(await verifyEmailVerificationToken("a.b.c", EMAIL)).toBeNull();
  });

  it("parseEmailVerificationTokenUserId extracts the userId without verifying", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    expect(parseEmailVerificationTokenUserId(token)).toBe(USER);
    expect(parseEmailVerificationTokenUserId("no-dot-at-all")).toBeNull();
    expect(parseEmailVerificationTokenUserId("")).toBeNull();
  });

  // Domain separation: the payload prefix is the only thing standing between
  // this flow and the PIN-reset flow, which shares the HMAC key.
  it("produces a hex signature and a two-part token", async () => {
    const token = await createEmailVerificationToken(USER, EMAIL);
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(USER);
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/);
  });
});
