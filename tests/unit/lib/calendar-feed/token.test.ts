import { describe, it, expect } from "vitest";

// The token helpers read PIN_COOKIE_SECRET lazily; set it before importing.
process.env.PIN_COOKIE_SECRET = "unit-test-pin-secret";

import {
  createCalendarFeedToken,
  createSandboxFeedToken,
  stripIcsSuffix,
  verifyCalendarFeedToken,
} from "@/lib/calendar-feed/token";
import { createEmailVerificationToken } from "@/lib/email-verification";

const CUSTOMER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const SANDBOX = "33333333-3333-3333-3333-333333333333";

describe("calendar feed token", () => {
  it("round-trips and returns the customer id", async () => {
    const token = await createCalendarFeedToken(CUSTOMER);
    expect(await verifyCalendarFeedToken(token)).toEqual({
      kind: "customer",
      customerId: CUSTOMER,
    });
  });

  it("accepts the token with the optional .ics suffix a client may append", async () => {
    const token = await createCalendarFeedToken(CUSTOMER);
    expect(await verifyCalendarFeedToken(`${token}.ics`)).toEqual({
      kind: "customer",
      customerId: CUSTOMER,
    });
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

describe("sandbox feed token", () => {
  it("round-trips and returns the sandbox id", async () => {
    const token = await createSandboxFeedToken(SANDBOX);
    expect(await verifyCalendarFeedToken(token)).toEqual({
      kind: "sandbox",
      sandboxId: SANDBOX,
    });
  });

  it("carries the marker that makes its kind explicit", async () => {
    const token = await createSandboxFeedToken(SANDBOX);
    expect(token.startsWith("s.")).toBe(true);
    expect(token.split(".")).toHaveLength(3);
  });

  it("accepts the optional .ics suffix without losing its kind", async () => {
    const token = await createSandboxFeedToken(SANDBOX);
    expect(await verifyCalendarFeedToken(`${token}.ics`)).toEqual({
      kind: "sandbox",
      sandboxId: SANDBOX,
    });
  });

  /**
   * The two halves of the domain separation, and the reason the two kinds are
   * prefixed against each other rather than merely shaped differently: one
   * verifier reads both, and only the prefix stops a token minted for a fake
   * family from ever answering for a real one.
   */
  it("does not verify a sandbox id presented as a customer token", async () => {
    const sandboxToken = await createSandboxFeedToken(SANDBOX);
    const [, , signature] = sandboxToken.split(".");
    expect(await verifyCalendarFeedToken(`${SANDBOX}.${signature}`)).toBeNull();
  });

  it("does not verify a customer id presented as a sandbox token", async () => {
    const customerToken = await createCalendarFeedToken(CUSTOMER);
    const [, signature] = customerToken.split(".");
    expect(
      await verifyCalendarFeedToken(`s.${CUSTOMER}.${signature}`),
    ).toBeNull();
  });

  it("rejects a three-part token whose marker is not the sandbox one", async () => {
    const token = await createSandboxFeedToken(SANDBOX);
    const [, id, signature] = token.split(".");
    expect(await verifyCalendarFeedToken(`x.${id}.${signature}`)).toBeNull();
  });

  it("rejects a tampered sandbox signature", async () => {
    const token = await createSandboxFeedToken(SANDBOX);
    const [marker, id, signature] = token.split(".");
    const flipped = signature.startsWith("a")
      ? `b${signature.slice(1)}`
      : `a${signature.slice(1)}`;
    expect(
      await verifyCalendarFeedToken(`${marker}.${id}.${flipped}`),
    ).toBeNull();
  });
});
