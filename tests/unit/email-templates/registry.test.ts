import { describe, it, expect, beforeAll } from "vitest";
import { templateRegistry } from "@/lib/email-templates/registry";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

/**
 * The seat variant reaches the reader twice — once in the body and once in the
 * subject — and the two are chosen by different code: the builder picks the
 * body, the registry entry picks the subject. The builders' halves are covered
 * next door; this file covers the registry's, through `render()` rather than by
 * reaching for the ternary, because `render` is what the API route calls.
 *
 * The failure being pinned is the half-applied one: an inbox line reading
 * "Marja is now enrolled" above a mail that opens "you are now enrolled". It
 * renders, it sends, and only the subject is wrong — so each case asserts the
 * subject and the body *together*, which is the only way a disagreement between
 * them shows up as a failure.
 */
describe("templateRegistry render()", () => {
  const parentParams = {
    parentName: "Marja",
    participantName: "Marja",
    geduName: "Alice",
    productName: "Parents' Minecraft Evening",
    minecraftUsername: null,
    minecraftUuid: null,
  };

  describe("enrollmentParent", () => {
    it("puts the second person in the subject when the seat is the parent's own", () => {
      const { subject, html } = templateRegistry.enrollmentParent.render(
        { ...parentParams, isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe("You are now enrolled in Parents' Minecraft Evening");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("you are now enrolled");
    });

    it("names the participant in the subject when the seat is a child's", () => {
      const { subject, html } = templateRegistry.enrollmentParent.render(
        { ...parentParams, participantName: "Aino", isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe("Aino is now enrolled in Parents' Minecraft Evening");
      expect(html).toContain("is now enrolled");
      expect(html).not.toContain("you are now enrolled");
    });
  });

  describe("unenrollmentParent", () => {
    const unenrollParams = {
      parentName: "Marja",
      participantName: "Marja",
      geduName: "Alice",
      productName: "Parents' Minecraft Evening",
    };

    it("puts the second person in the subject when the seat was the parent's own", () => {
      const { subject, html } = templateRegistry.unenrollmentParent.render(
        { ...unenrollParams, isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe("You have been unenrolled from Parents' Minecraft Evening");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("you have been unenrolled");
    });

    it("names the participant in the subject when the seat was a child's", () => {
      const { subject, html } = templateRegistry.unenrollmentParent.render(
        { ...unenrollParams, participantName: "Aino", isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe("Aino has been unenrolled from Parents' Minecraft Evening");
      expect(html).toContain("has been unenrolled");
      expect(html).not.toContain("you have been unenrolled");
    });
  });

  /**
   * The seat select is the testing UI's only way to reach either branch above,
   * and it hands the API a string. This is where that string becomes the
   * boolean the schema demands — an unfilled field means a child's seat,
   * because that is every seat that existed before for-parents products.
   */
  describe("the seat select's resolver", () => {
    it.each(["enrollmentParent", "unenrollmentParent"])(
      "expands the %s seat select into a boolean, defaulting to a child's seat",
      (key) => {
        const resolve = templateRegistry[key].resolveParams;
        if (!resolve) throw new Error(`${key} has no resolveParams`);

        expect(resolve({ seat: "self" })).toMatchObject({ isSelfSeat: true });
        expect(resolve({ seat: "child" })).toMatchObject({ isSelfSeat: false });
        expect(resolve({})).toMatchObject({ isSelfSeat: false });
      },
    );
  });

  /**
   * The signup mail branches on three things at once — enrolled vs waitlisted,
   * whose seat it is, and which verb the product type calls for — and all three
   * reach the subject line. The pairing is what each case asserts: a subject
   * reading "Aino is signed up" over a body that opens "you are on the waitlist"
   * is two wrong answers in the one line the reader meets first, and each half
   * looks fine on its own.
   */
  describe("productConfirmation", () => {
    const signup = {
      participantName: "Aino",
      productName: "Minecraft 101",
      productType: "consumer_club",
      mode: "subscription",
      priceAmount: "€40.00",
      dashboardUrl: "https://sogverse.sog.gg/parent",
    };

    it("names the participant when the seat is a child's", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe("Aino is enrolled in Minecraft 101");
      expect(html).toContain("Aino");
      expect(html).toContain("is enrolled in");
    });

    /**
     * The subject takes the same per-type verb the body does, because the two
     * are read together: an inbox line saying "Aino is enrolled in" over a mail
     * that opens "Aino is joining" is the kind of mismatch nobody notices until
     * a parent asks which one it is. Each case pins the subject and the body of
     * one type at once, which is the only way a drift between them fails.
     */
    it.each([
      ["consumer_club", "Aino is enrolled in Minecraft 101", "is enrolled in"],
      ["municipality_club", "Aino is registered for Minecraft 101", "is registered for"],
      ["camp", "Aino is signed up for Minecraft 101", "is signed up for"],
      ["event", "Aino is joining Minecraft 101", "is joining"],
    ])("uses the %s verb in the subject as well as the body", (productType, expected, bodyVerb) => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, productType, isSelfSeat: false },
        t,
        "en",
      );

      expect(subject).toBe(expected);
      expect(html).toContain(bodyVerb);
    });

    it.each([
      ["consumer_club", "You are enrolled in Minecraft 101", "You’re enrolled in"],
      ["municipality_club", "You are registered for Minecraft 101", "You’re registered for"],
      ["camp", "You are signed up for Minecraft 101", "You’re signed up for"],
      ["event", "You are joining Minecraft 101", "You’re joining"],
    ])("uses the %s verb on a self seat too", (productType, expected, bodyVerb) => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, productType, participantName: "Marja", isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe(expected);
      expect(subject).not.toContain("Marja");
      expect(html).toContain(bodyVerb);
    });

    it("moves to the second person when the seat is the parent's own", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, participantName: "Marja", isSelfSeat: true },
        t,
        "en",
      );

      expect(subject).toBe("You are enrolled in Minecraft 101");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("You’re enrolled in");
      expect(html).not.toContain("Marja");
    });

    it("says waitlist in the subject when the outcome is a waitlist join", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, isSelfSeat: false, mode: "waitlist", priceAmount: null },
        t,
        "en",
      );

      expect(subject).toBe("Aino is on the waitlist for Minecraft 101");
      expect(html).toContain("is on the waitlist for");
      expect(html).not.toContain("signed up");
    });

    it("carries both axes at once on a self-seat waitlist join", () => {
      const { subject, html } = templateRegistry.productConfirmation.render(
        { ...signup, participantName: "Marja", isSelfSeat: true, mode: "waitlist", priceAmount: null },
        t,
        "en",
      );

      expect(subject).toBe("You are on the waitlist for Minecraft 101");
      expect(subject).not.toContain("Marja");
      expect(html).toContain("You’re on the waitlist for");
      expect(html).not.toContain("Marja");
    });

    /**
     * The testing form hands every field over as a string. This is where the
     * seat select becomes the boolean the schema demands, and where the price
     * is cleared on the two modes that state no amount — so a test send of a
     * free signup carries what the live mail carries, not a price the builder
     * would have ignored anyway.
     */
    describe("its resolver", () => {
      const resolve = templateRegistry.productConfirmation.resolveParams;

      it("expands the seat select into a boolean", () => {
        if (!resolve) throw new Error("productConfirmation has no resolveParams");
        expect(resolve({ seat: "self", mode: "subscription" })).toMatchObject({ isSelfSeat: true });
        expect(resolve({ seat: "child", mode: "subscription" })).toMatchObject({ isSelfSeat: false });
        expect(resolve({ mode: "subscription" })).toMatchObject({ isSelfSeat: false });
      });

      it("keeps the price on the paid modes and clears it on the rest", () => {
        if (!resolve) throw new Error("productConfirmation has no resolveParams");
        for (const mode of ["subscription", "upfront"]) {
          expect(resolve({ mode, priceAmount: "€40.00" })).toMatchObject({ priceAmount: "€40.00" });
        }
        for (const mode of ["free", "waitlist"]) {
          expect(resolve({ mode, priceAmount: "€40.00" })).toMatchObject({ priceAmount: null });
        }
      });
    });
  });
});

/**
 * Every registered template, rendered in every locale we ship.
 *
 * The failure this catches is a key added to `en.json` and forgotten in one of
 * the other four: the translator falls back to printing the key path, so the
 * mail still renders, still sends, and reads as `email.welcomeParent.heading`
 * to a Finnish parent. Each case looks for its own template's key prefix, which
 * is what a fallback prints — a blanket search for `email.` would trip over
 * every sentence that happens to end in the word.
 */
describe("every template renders in every locale", () => {
  /**
   * Valid params per template, and the list is checked against the registry
   * below — a new template with no fixture fails here rather than quietly
   * skipping the sweep.
   */
  const TEMPLATE_PARAMS: Record<string, Record<string, string | boolean | null>> = {
    passwordReset: { resetLink: "https://sogverse.sog.gg/reset-password?code=abc123" },
    feedback: {
      userName: "Marja Virtanen",
      userRole: "customer",
      userEmail: "marja@example.com",
      message: "Great product!",
    },
    enrollmentParent: {
      parentName: "Marja",
      participantName: "Aino",
      geduName: "Alice",
      productName: "Minecraft 101",
      minecraftUsername: null,
      minecraftUuid: null,
      isSelfSeat: false,
    },
    enrollmentGedu: {
      geduName: "Alice",
      participantName: "Aino",
      productName: "Minecraft 101",
      minecraftUsername: "PlayerOne",
      minecraftUuid: null,
    },
    unenrollmentParent: {
      parentName: "Marja",
      participantName: "Aino",
      geduName: "Alice",
      productName: "Minecraft 101",
      isSelfSeat: false,
    },
    unenrollmentGedu: {
      geduName: "Alice",
      participantName: "Aino",
      productName: "Minecraft 101",
      minecraftUsername: null,
      minecraftUuid: null,
    },
    welcomeParent: {
      firstName: "Marja",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
      dashboardUrl: "https://sogverse.sog.gg/parent",
      shopUrl: "https://sogverse.sog.gg/shop",
      settingsUrl: "https://sogverse.sog.gg/settings",
    },
    welcomeGedu: {
      firstName: "Alice",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
      dashboardUrl: "https://sogverse.sog.gg/gedu",
      settingsUrl: "https://sogverse.sog.gg/settings",
    },
    productConfirmation: {
      participantName: "Aino",
      isSelfSeat: false,
      productName: "Minecraft 101",
      productType: "camp",
      mode: "upfront",
      priceAmount: "€40.00",
      dashboardUrl: "https://sogverse.sog.gg/parent",
    },
    verifyEmail: {
      firstName: "Marja",
      verificationUrl: "https://sogverse.sog.gg/verify-email?token=abc123",
    },
  };

  it("has a fixture for every registered template", () => {
    expect(Object.keys(TEMPLATE_PARAMS).sort()).toEqual(Object.keys(templateRegistry).sort());
  });

  describe.each(SUPPORTED_LOCALES)("%s", (locale) => {
    it.each(Object.keys(templateRegistry))("renders %s", async (key) => {
      const translator = await getEmailTranslator(locale);
      const { subject, html, replyTo } = templateRegistry[key].render(
        TEMPLATE_PARAMS[key],
        translator,
        locale,
      );

      expect(subject.trim()).not.toBe("");
      expect(subject).not.toContain(`email.${key}`);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain(`lang="${locale}"`);
      expect(html).not.toContain(`email.${key}`);
      expect(replyTo).toContain("@");
    });
  });
});
