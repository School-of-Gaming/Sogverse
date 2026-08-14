import { describe, it, expect, beforeAll } from "vitest";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
} from "@/lib/email-templates/enrollment-changes";
import { getEmailTranslator, type EmailTranslator } from "@/lib/email-templates/translator";

let t: EmailTranslator;

beforeAll(async () => {
  t = await getEmailTranslator("en");
});

describe("enrollment-changes email templates", () => {
  describe("buildEnrollmentParentEmail", () => {
    it("includes parent, gamer, gedu, and product names", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Minecraft 101",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
        isSelfSeat: false,
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Minecraft 101");
      expect(html).toContain("Enrolment Confirmed");
    });

    it("escapes HTML in names", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "<script>xss</script>",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: false,
      });
      expect(html).not.toContain("<script>xss</script>");
      expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
    });

    it("wraps in layout", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: false,
      });
      expect(html).toContain("<!DOCTYPE html>");
      // The layout's header carries the full lockup — brand first, platform
      // second, spaced en dash. The sender name is the brand alone because an
      // inbox list truncates it; the header is where there is room for both.
      expect(html).toContain("School of Gaming");
      expect(html).toContain("– Sogverse");
    });

    it("shows verified minecraft status with skin image", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
        isSelfSeat: false,
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows unverified minecraft status without skin image", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: null,
        isSelfSeat: false,
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("not yet verified");
      expect(html).not.toContain("mc-heads.net");
    });

    it("shows not provided minecraft status", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: false,
      });
      expect(html).toContain("Not provided");
    });
  });

  describe("buildEnrollmentGeduEmail", () => {
    it("includes gedu, gamer, and product names", () => {
      const html = buildEnrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Minecraft 101",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Kid");
      expect(html).toContain("Minecraft 101");
      expect(html).toContain("New Participant in Your Group");
    });

    it("shows verified minecraft status with skin image", () => {
      const html = buildEnrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows unverified minecraft status", () => {
      const html = buildEnrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: null,
      });
      expect(html).toContain("not yet verified");
    });

    it("shows not provided minecraft status", () => {
      const html = buildEnrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("Not provided");
    });

    it("escapes HTML in names", () => {
      const html = buildEnrollmentGeduEmail(t, "en", {
        geduName: "A&B",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("A&amp;B");
    });
  });

  describe("buildUnenrollmentParentEmail", () => {
    it("includes parent, gamer, gedu, and product names", () => {
      const html = buildUnenrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Roblox Pro",
        isSelfSeat: false,
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Roblox Pro");
      expect(html).toContain("Unenrolment Confirmed");
    });

    it("confirms gamer unenrolled", () => {
      const html = buildUnenrollmentParentEmail(t, "en", {
        parentName: "Parent",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        isSelfSeat: false,
      });
      expect(html).toContain("unenrolled");
    });

    it("escapes HTML", () => {
      const html = buildUnenrollmentParentEmail(t, "en", {
        parentName: "<b>P</b>",
        participantName: "Kid",
        geduName: "Alice",
        productName: "Test",
        isSelfSeat: false,
      });
      expect(html).not.toContain("<b>P</b>");
    });
  });

  describe("buildUnenrollmentGeduEmail", () => {
    it("includes gedu, gamer, and product names", () => {
      const html = buildUnenrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Kid");
      expect(html).toContain("Test");
      expect(html).toContain("Participant Left Your Group");
    });

    it("shows verified minecraft status with skin image for whitelist removal", () => {
      const html = buildUnenrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows not provided minecraft status", () => {
      const html = buildUnenrollmentGeduEmail(t, "en", {
        geduName: "Alice",
        participantName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("Not provided");
    });
  });

  /**
   * The self-seat variants: a parent enrolled on a for-parents product is both
   * the recipient and the participant, so the copy moves into the second person.
   *
   * The assertions are about what must **not** be there as much as what must:
   * the third-person sentence naming the reader back at themselves is the
   * failure this variant exists to prevent, and it would still render a
   * perfectly valid-looking email.
   */
  describe("the parent's own seat", () => {
    it("addresses the reader directly and never third-persons them", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Marja",
        participantName: "Marja",
        geduName: "Alice",
        productName: "Parents' Minecraft Evening",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: true,
      });
      expect(html).toContain("you are now enrolled");
      expect(html).toContain("Alice");
      expect(html).toContain("Parents&#39; Minecraft Evening");
      expect(html).not.toContain("Marja is now enrolled");
    });

    it("omits the Minecraft block, which an adult can never fill", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Marja",
        participantName: "Marja",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: true,
      });
      expect(html).not.toContain("Not provided");
      expect(html).not.toContain("Minecraft Username");
    });

    it("still renders the child variant's Minecraft block when the seat is a child's", () => {
      const html = buildEnrollmentParentEmail(t, "en", {
        parentName: "Marja",
        participantName: "Aino",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
        isSelfSeat: false,
      });
      expect(html).toContain("Not provided");
      expect(html).toContain("Aino");
    });

    it("un-enrolls in the second person too", () => {
      const html = buildUnenrollmentParentEmail(t, "en", {
        parentName: "Marja",
        participantName: "Marja",
        geduName: "Alice",
        productName: "Test",
        isSelfSeat: true,
      });
      expect(html).toContain("you have been unenrolled");
      expect(html).not.toContain("Marja has been unenrolled");
    });

    it("escapes the reader's name on the self path as well", () => {
      const html = buildUnenrollmentParentEmail(t, "en", {
        parentName: "<b>P</b>",
        participantName: "<b>P</b>",
        geduName: "Alice",
        productName: "Test",
        isSelfSeat: true,
      });
      expect(html).not.toContain("<b>P</b>");
      expect(html).toContain("&lt;b&gt;P&lt;/b&gt;");
    });
  });
});
