import { describe, it, expect } from "vitest";
import {
  gamerHoldsOwnMailbox,
  resolveFamilyRecipients,
  type FamilyGamerContact,
} from "@/lib/email/family-recipients.server";

/**
 * Who a family mail goes to. The rule under test has two halves — the parent
 * always, the child only behind a verified real address — and every case here
 * is one way of getting the second half wrong: a mode without a stamp, a stamp
 * without the mode, a child with nobody to write to first.
 */

const parent = { email: "marja@example.test", firstName: "Marja", locale: "fi" };

const verifiedChild: FamilyGamerContact = {
  email: "aino@example.test",
  firstName: "Aino",
  locale: "en",
  signIn: "email",
  emailVerifiedAt: "2026-08-01T10:00:00Z",
};

describe("resolveFamilyRecipients", () => {
  it("writes to the parent alone when the child signs in through the parent", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: { ...verifiedChild, signIn: "parent", emailVerifiedAt: null },
      fallbackLocale: "en",
    });
    expect(recipients).toEqual([
      { email: "marja@example.test", kind: "parent", locale: "fi", firstName: "Marja" },
    ]);
  });

  it("writes to the parent alone when the child signs in with a username", () => {
    // A username sign-in has a platform-internal address behind it; no inbox
    // answers it, and it must never be a recipient.
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: {
        ...verifiedChild,
        email: "aino@gamer.sogverse.internal",
        signIn: "username",
        emailVerifiedAt: null,
      },
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent"]);
  });

  /**
   * The load-bearing case. A real address the parent typed but the child has
   * not verified may belong to a stranger, and a mail about a named child must
   * not land there. The mode alone is never enough.
   */
  it("withholds the child's copy until the address is verified", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: { ...verifiedChild, emailVerifiedAt: null },
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent"]);
  });

  it("withholds the copy when a stamp survives a switch away from the real-email mode", () => {
    // Both facts together, not either: a stamp left behind by an earlier mode
    // does not reopen the mailbox once the parent has chosen another sign-in.
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: { ...verifiedChild, signIn: "parent" },
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent"]);
  });

  it("adds the child's own copy, after the parent, when the address is verified", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: verifiedChild,
      fallbackLocale: "en",
    });
    expect(recipients).toEqual([
      { email: "marja@example.test", kind: "parent", locale: "fi", firstName: "Marja" },
      { email: "aino@example.test", kind: "gamer", locale: "en", firstName: "Aino" },
    ]);
  });

  /** We never write to a child alone, whatever they hold. */
  it("writes to nobody when there is no parent, even for a verified child", () => {
    expect(
      resolveFamilyRecipients({ parents: [], gamer: verifiedChild, fallbackLocale: "en" }),
    ).toEqual([]);
  });

  it("leaves an adult's own seat as it was — one recipient, no child", () => {
    const recipients = resolveFamilyRecipients({
      parents: [{ email: "sylvie@example.test", firstName: "Sylvie", locale: null }],
      gamer: null,
      fallbackLocale: "fr",
    });
    expect(recipients).toEqual([
      { email: "sylvie@example.test", kind: "parent", locale: "fr", firstName: "Sylvie" },
    ]);
  });

  it("resolves each recipient's locale on their own, with the caller's fallback", () => {
    const recipients = resolveFamilyRecipients({
      parents: [{ ...parent, locale: null }],
      gamer: { ...verifiedChild, locale: "sv" },
      fallbackLocale: "fr",
    });
    expect(recipients.map((r) => r.locale)).toEqual(["fr", "sv"]);
  });

  it("never trusts a stored locale it does not ship", () => {
    const recipients = resolveFamilyRecipients({
      parents: [{ ...parent, locale: "xx" }],
      gamer: null,
      fallbackLocale: "en",
    });
    expect(recipients[0].locale).toBe("en");
  });
});

describe("gamerHoldsOwnMailbox", () => {
  it("is true only for the real-email mode with a verification stamp", () => {
    expect(gamerHoldsOwnMailbox({ signIn: "email", emailVerifiedAt: "2026-08-01T10:00:00Z" })).toBe(true);
    expect(gamerHoldsOwnMailbox({ signIn: "email", emailVerifiedAt: null })).toBe(false);
    expect(gamerHoldsOwnMailbox({ signIn: "username", emailVerifiedAt: "2026-08-01T10:00:00Z" })).toBe(false);
    expect(gamerHoldsOwnMailbox({ signIn: "parent", emailVerifiedAt: null })).toBe(false);
    expect(gamerHoldsOwnMailbox({ signIn: null, emailVerifiedAt: "2026-08-01T10:00:00Z" })).toBe(false);
  });
});
