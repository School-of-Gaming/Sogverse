import { describe, it, expect } from "vitest";
import {
  buildEnrollmentParentEmail,
  buildEnrollmentGeduEmail,
  buildUnenrollmentParentEmail,
  buildUnenrollmentGeduEmail,
} from "@/lib/email-templates/enrollment-changes";

describe("enrollment-changes email templates", () => {
  describe("buildEnrollmentParentEmail", () => {
    it("includes parent, gamer, gedu, and product names", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Minecraft 101",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Minecraft 101");
      expect(html).toContain("Enrollment Confirmed");
    });

    it("escapes HTML in names", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "<script>xss</script>",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).not.toContain("<script>xss</script>");
      expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
    });

    it("wraps in layout", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("SOG");
    });

    it("shows verified minecraft status with skin image", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows unverified minecraft status without skin image", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: null,
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("not yet verified");
      expect(html).not.toContain("mc-heads.net");
    });

    it("shows not provided minecraft status", () => {
      const html = buildEnrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("Not provided");
    });
  });

  describe("buildEnrollmentGeduEmail", () => {
    it("includes gedu, gamer, and product names", () => {
      const html = buildEnrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Minecraft 101",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Kid");
      expect(html).toContain("Minecraft 101");
      expect(html).toContain("New Gamer in Your Group");
    });

    it("shows verified minecraft status with skin image", () => {
      const html = buildEnrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows unverified minecraft status", () => {
      const html = buildEnrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: null,
      });
      expect(html).toContain("not yet verified");
    });

    it("shows not provided minecraft status", () => {
      const html = buildEnrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("Not provided");
    });

    it("escapes HTML in names", () => {
      const html = buildEnrollmentGeduEmail({
        geduName: "A&B",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("A&amp;B");
    });
  });

  describe("buildUnenrollmentParentEmail", () => {
    it("includes parent, gamer, gedu, and product names", () => {
      const html = buildUnenrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Roblox Pro",
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Roblox Pro");
      expect(html).toContain("Unenrollment Confirmed");
    });

    it("confirms gamer unenrolled", () => {
      const html = buildUnenrollmentParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
      });
      expect(html).toContain("unenrolled");
    });

    it("escapes HTML", () => {
      const html = buildUnenrollmentParentEmail({
        parentName: "<b>P</b>",
        gamerName: "Kid",
        geduName: "Alice",
        productName: "Test",
      });
      expect(html).not.toContain("<b>P</b>");
    });
  });

  describe("buildUnenrollmentGeduEmail", () => {
    it("includes gedu, gamer, and product names", () => {
      const html = buildUnenrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Kid");
      expect(html).toContain("Test");
      expect(html).toContain("Gamer Left Your Group");
    });

    it("shows verified minecraft status with skin image for whitelist removal", () => {
      const html = buildUnenrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: "PlayerOne",
        minecraftUuid: "uuid-123",
      });
      expect(html).toContain("PlayerOne");
      expect(html).toContain("verified");
      expect(html).toContain("mc-heads.net/body/PlayerOne");
    });

    it("shows not provided minecraft status", () => {
      const html = buildUnenrollmentGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        productName: "Test",
        minecraftUsername: null,
        minecraftUuid: null,
      });
      expect(html).toContain("Not provided");
    });
  });
});
