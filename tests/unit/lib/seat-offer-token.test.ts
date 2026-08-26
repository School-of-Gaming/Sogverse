import { describe, it, expect } from "vitest";

// Helpers read PIN_COOKIE_SECRET lazily; set it before importing the module.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import {
  createSeatOfferToken,
  isSeatOfferTokenExpired,
  readSeatOfferToken,
} from "@/lib/seat-offer-token";
import { createPinResetToken } from "@/lib/pin-session";
import { createEmailVerificationToken } from "@/lib/email-verification";

const PARTICIPATION = "3f9c2b7e-5d14-4a8e-9c61-0b2f7e8d4a15";
const OTHER_PARTICIPATION = "8a1d4c60-2b73-4f19-9d55-6e0a3c81b7f2";
const SENT_AT = new Date("2026-08-26T10:00:00.123Z");

describe("createSeatOfferToken / readSeatOfferToken", () => {
  it("round-trips the participation and the offer instant", async () => {
    const token = await createSeatOfferToken(PARTICIPATION, SENT_AT);
    expect(await readSeatOfferToken(token)).toEqual({
      participationId: PARTICIPATION,
      sentAtMs: SENT_AT.getTime(),
    });
  });

  it("has three dot-separated parts, and the middle one is the instant", async () => {
    const parts = (await createSeatOfferToken(PARTICIPATION, SENT_AT)).split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(PARTICIPATION);
    expect(parts[1]).toBe(String(SENT_AT.getTime()));
  });

  it.each([
    ["no token", null],
    ["an empty string", ""],
    ["too few parts", `${PARTICIPATION}.${SENT_AT.getTime()}`],
    ["too many parts", `${PARTICIPATION}.${SENT_AT.getTime()}.aa.bb`],
    ["a non-numeric instant", `${PARTICIPATION}.nope.aabbcc`],
    ["an empty participation", `.${SENT_AT.getTime()}.aabbcc`],
  ])("refuses %s", async (_label, token) => {
    expect(await readSeatOfferToken(token)).toBeNull();
  });

  /**
   * `Number(" 1 ")` is 1 and `Number("")` is 0, so parsing alone does not pin
   * the spelling — the round-trip back to a string does. A token whose middle
   * field is not the canonical decimal integer is not one we minted, and
   * admitting it would let two different strings verify as one offer.
   */
  it("refuses a non-canonical spelling of the instant", async () => {
    const signature = (await createSeatOfferToken(PARTICIPATION, SENT_AT)).split(".")[2];
    expect(
      await readSeatOfferToken(`${PARTICIPATION}. ${SENT_AT.getTime()} .${signature}`),
    ).toBeNull();
    expect(
      await readSeatOfferToken(`${PARTICIPATION}.+${SENT_AT.getTime()}.${signature}`),
    ).toBeNull();
  });

  /** The signature is over both fields, so neither can be edited on its own. */
  it("refuses a token whose participation has been swapped", async () => {
    const signature = (await createSeatOfferToken(PARTICIPATION, SENT_AT)).split(".")[2];
    expect(
      await readSeatOfferToken(
        `${OTHER_PARTICIPATION}.${SENT_AT.getTime()}.${signature}`,
      ),
    ).toBeNull();
  });

  it("refuses a token whose instant has been moved", async () => {
    const signature = (await createSeatOfferToken(PARTICIPATION, SENT_AT)).split(".")[2];
    const later = SENT_AT.getTime() + 60_000;
    expect(
      await readSeatOfferToken(`${PARTICIPATION}.${later}.${signature}`),
    ).toBeNull();
  });

  it("refuses a forged signature", async () => {
    expect(
      await readSeatOfferToken(`${PARTICIPATION}.${SENT_AT.getTime()}.${"0".repeat(64)}`),
    ).toBeNull();
  });

  /**
   * Domain separation. Three flows share `PIN_COOKIE_SECRET` and are kept apart
   * by the prefix each folds into its signed payload; if that ever stopped
   * being true, a token minted by one flow would authorize an action in
   * another. Nothing else in the repo asserts the seat-offer prefix does its
   * job, so this is the check that would notice it being dropped.
   */
  it("does not accept a token minted by another flow under the same secret", async () => {
    const pinReset = await createPinResetToken(PARTICIPATION, "hash", Date.now());
    expect(await readSeatOfferToken(pinReset)).toBeNull();

    const verification = await createEmailVerificationToken(
      PARTICIPATION,
      "someone@example.com",
    );
    expect(await readSeatOfferToken(verification)).toBeNull();
  });
});

describe("isSeatOfferTokenExpired", () => {
  const claims = { participationId: PARTICIPATION, sentAtMs: SENT_AT.getTime() };

  it("is live inside the window", () => {
    expect(isSeatOfferTokenExpired(claims, claims.sentAtMs)).toBe(false);
    expect(
      isSeatOfferTokenExpired(claims, claims.sentAtMs + SEAT_OFFER_WINDOW_MS - 1),
    ).toBe(false);
  });

  /**
   * The far end is exclusive: live while `sentAt + window > now`, which is how
   * the SQL predicates in migration 00207 are written too. The boundary is
   * asserted rather than assumed because the two ends of this rule are in two
   * languages and only agree by hand.
   */
  it("is expired at the boundary and after it", () => {
    expect(
      isSeatOfferTokenExpired(claims, claims.sentAtMs + SEAT_OFFER_WINDOW_MS),
    ).toBe(true);
    expect(
      isSeatOfferTokenExpired(claims, claims.sentAtMs + SEAT_OFFER_WINDOW_MS + 1),
    ).toBe(true);
  });
});
