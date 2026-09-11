import { describe, it, expect } from "vitest";
import {
  gamerHoldsOwnMailbox,
  resolveFamilyRecipients,
  type FamilyGamerContact,
} from "@/lib/email/family-recipients.server";

/**
 * Who a family mail goes to. The rule under test has two halves — the parent
 * always, the child only when their sign-in is their own email address — and
 * every case here is one way of getting the second half wrong: a mode that has
 * no inbox behind it, a child with nobody to write to first, and the case that
 * used to be withheld and no longer is (a real address nobody has verified).
 */

const parent = { email: "marja@example.test", firstName: "Marja", locale: "fi" };

const emailChild: FamilyGamerContact = {
  email: "aino@example.test",
  firstName: "Aino",
  locale: "en",
  signIn: "email",
};

describe("resolveFamilyRecipients", () => {
  it("writes to the parent alone when the child signs in through the parent", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: { ...emailChild, signIn: "parent" },
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
        ...emailChild,
        email: "aino@gamer.sogverse.internal",
        signIn: "username",
      },
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent"]);
  });

  /**
   * Verification is not a precondition, by decision. A copy is most useful
   * before the child has clicked anything — a confirmation minutes after the
   * parent created the account — so the mode is the whole test.
   */
  it("sends the child's copy to a real address nobody has verified", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: emailChild,
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent", "gamer"]);
  });

  it("adds the child's own copy after the parent, never instead of them", () => {
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: emailChild,
      fallbackLocale: "en",
    });
    expect(recipients).toEqual([
      { email: "marja@example.test", kind: "parent", locale: "fi", firstName: "Marja" },
      { email: "aino@example.test", kind: "gamer", locale: "en", firstName: "Aino" },
    ]);
  });

  /** We never write to a child alone, whatever they hold. */
  it("writes to nobody when there is no parent, even for a child with their own address", () => {
    expect(
      resolveFamilyRecipients({ parents: [], gamer: emailChild, fallbackLocale: "en" }),
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
      gamer: { ...emailChild, locale: "sv" },
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

  it("writes to the parent alone when the mode says email but the address is ours", () => {
    // The half-written mode change: `gamer_profiles.sign_in` says `email` while
    // the stored address is still the synthetic handle. The child's copy would
    // go nowhere, so it is not sent.
    const recipients = resolveFamilyRecipients({
      parents: [parent],
      gamer: { ...emailChild, email: "aino@gamer.sogverse.internal" },
      fallbackLocale: "en",
    });
    expect(recipients.map((r) => r.kind)).toEqual(["parent"]);
  });
});

describe("gamerHoldsOwnMailbox", () => {
  const real = "aino@example.test";

  it("is true for the real-email mode and for nothing else", () => {
    expect(gamerHoldsOwnMailbox({ email: real, signIn: "email" })).toBe(true);
    expect(gamerHoldsOwnMailbox({ email: real, signIn: "username" })).toBe(false);
    expect(gamerHoldsOwnMailbox({ email: real, signIn: "parent" })).toBe(false);
    expect(gamerHoldsOwnMailbox({ email: real, signIn: null })).toBe(false);
  });

  it("refuses a synthetic address even when the mode says the child holds one", () => {
    // The two are written separately — a mode change moves `auth.users` and
    // `profiles.email` in two statements — so a failure between them leaves a
    // row saying `email` beside a handle no inbox answers. Every send reads the
    // stored address, so believing the mode alone posts a child's copy into the
    // void and logs it as delivered.
    expect(
      gamerHoldsOwnMailbox({
        email: "aino@gamer.sogverse.internal",
        signIn: "email",
      }),
    ).toBe(false);
    // Case-folded, like every other test of the domain: GoTrue lowercases on
    // the way in, but nothing guarantees a row written by hand did.
    expect(
      gamerHoldsOwnMailbox({
        email: "G1234@GAMER.SOGVERSE.INTERNAL",
        signIn: "email",
      }),
    ).toBe(false);
  });
});
