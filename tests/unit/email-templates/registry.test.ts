import { describe, it, expect, beforeAll } from "vitest";
import { templateRegistry } from "@/lib/email-templates/registry";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

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
});
