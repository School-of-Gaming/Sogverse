import { describe, it, expect } from "vitest";
import { confirmationRecipientEmail } from "@/app/[locale]/(public)/shop/confirmation/confirmation-recipient";

/**
 * The confirmation page names the address the mail went to — the payer's — and
 * only to the payer. Anyone else holding the link, a child's own session
 * included, gets the promise with no address in it.
 */
const PAYER_ID = "8f0e2b6a-3c1d-4e5f-9a7b-1c2d3e4f5a6b";
const GAMER_ID = "2d4c6e8a-0b1c-4d3e-8f5a-6b7c8d9e0f1a";

describe("confirmationRecipientEmail", () => {
  it("shows the payer their own address", () => {
    expect(
      confirmationRecipientEmail(
        { id: PAYER_ID, email: "marja@example.com" },
        PAYER_ID,
      ),
    ).toBe("marja@example.com");
  });

  it("shows a signed-in viewer who is not the payer nothing", () => {
    expect(
      confirmationRecipientEmail(
        { id: GAMER_ID, email: "aino@gamer.sogverse.internal" },
        PAYER_ID,
      ),
    ).toBeNull();
  });

  it("shows nothing when no profile is signed in", () => {
    expect(confirmationRecipientEmail(null, PAYER_ID)).toBeNull();
    expect(confirmationRecipientEmail(undefined, PAYER_ID)).toBeNull();
  });
});
