import { describe, it, expect } from "vitest";

// The token helpers read PIN_COOKIE_SECRET lazily; set it before importing.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  createCalendarFeedToken,
  stripIcsSuffix,
  verifyCalendarFeedToken,
} from "@/lib/calendar-feed/token";
import { createEmailVerificationToken } from "@/lib/email-verification";

const CUSTOMER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("calendar feed token", () => {
  it("round-trips and returns the customer id", async () => {
    const token = await createCalendarFeedToken(CUSTOMER);
    expect(await verifyCalendarFeedToken(token)).toBe(CUSTOMER);
  });

  it("accepts the token with the optional .ics suffix a client may append", async () => {
    const token = await createCalendarFeedToken(CUSTOMER);
    expect(await verifyCalendarFeedToken(`${token}.ics`)).toBe(CUSTOMER);
  });

  it("strips only a trailing .ics", () => {
    expect(stripIcsSuffix("abc.ics")).toBe("abc");
    expect(stripIcsSuffix("abc.icsx")).toBe("abc.icsx");
    expect(stripIcsSuffix("abc")).toBe("abc");
  });

  it("rejects a tampered signature", async () => {
    const token = await createCalendarFeedToken(CUSTOMER);
    const [id, signature] = token.split(".");
    const flipped = signature.startsWith("a")
      ? `b${signature.slice(1)}`
      : `a${signature.slice(1)}`;
    expect(await verifyCalendarFeedToken(`${id}.${flipped}`)).toBeNull();
  });

  it("rejects another customer's signature", async () => {
    const [, signature] = (await createCalendarFeedToken(CUSTOMER)).split(".");
    expect(await verifyCalendarFeedToken(`${OTHER}.${signature}`)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyCalendarFeedToken("nonsense")).toBeNull();
    expect(await verifyCalendarFeedToken("")).toBeNull();
    expect(await verifyCalendarFeedToken(`${CUSTOMER}.`)).toBeNull();
  });

  /**
   * The whole point of the payload prefix. Both flows sign with the same
   * `PIN_COOKIE_SECRET`, so without domain separation a token minted to verify
   * an email address would also unlock that family's calendar — and this test
   * is what proves the separation is real rather than commented.
   */
  it("rejects a token minted by the email-verification flow for the same id", async () => {
    const emailToken = await createEmailVerificationToken(
      CUSTOMER,
      "parent@example.test",
    );
    expect(await verifyCalendarFeedToken(emailToken)).toBeNull();
  });
});
