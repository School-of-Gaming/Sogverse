import { describe, it, expect } from "vitest";
import {
  buildGroupAddedEmail,
  buildGroupDeletedEmail,
  buildGroupReassignedOldGeduEmail,
  buildGroupReassignedNewGeduEmail,
  buildGroupReassignedParentEmail,
  buildGamerMovedParentEmail,
  buildGamerMovedOldGeduEmail,
  buildGamerMovedNewGeduEmail,
} from "@/lib/email-templates/group-changes";

describe("group-changes email templates", () => {
  describe("buildGroupAddedEmail", () => {
    it("includes gedu name and product name", () => {
      const html = buildGroupAddedEmail({ geduName: "Alice", productName: "Minecraft 101" });
      expect(html).toContain("Alice");
      expect(html).toContain("Minecraft 101");
      expect(html).toContain("assigned to a new group");
    });

    it("escapes HTML in names", () => {
      const html = buildGroupAddedEmail({ geduName: "<script>xss</script>", productName: "Test" });
      expect(html).not.toContain("<script>xss</script>");
      expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
    });

    it("wraps in layout", () => {
      const html = buildGroupAddedEmail({ geduName: "Alice", productName: "Test" });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("SOG");
    });
  });

  describe("buildGroupDeletedEmail", () => {
    it("includes gedu name and product name", () => {
      const html = buildGroupDeletedEmail({ geduName: "Bob", productName: "Roblox Pro" });
      expect(html).toContain("Bob");
      expect(html).toContain("Roblox Pro");
      expect(html).toContain("removed");
    });

    it("escapes HTML", () => {
      const html = buildGroupDeletedEmail({ geduName: "A&B", productName: "Test" });
      expect(html).toContain("A&amp;B");
    });
  });

  describe("buildGroupReassignedOldGeduEmail", () => {
    it("includes old and new gedu names", () => {
      const html = buildGroupReassignedOldGeduEmail({
        oldGeduName: "Alice",
        newGeduName: "Bob",
        productName: "Test",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(html).toContain("reassigned");
    });
  });

  describe("buildGroupReassignedNewGeduEmail", () => {
    it("includes old and new gedu names", () => {
      const html = buildGroupReassignedNewGeduEmail({
        oldGeduName: "Alice",
        newGeduName: "Bob",
        productName: "Test",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(html).toContain("assigned to a group");
    });
  });

  describe("buildGroupReassignedParentEmail", () => {
    it("includes parent, gamer, old gedu, and new gedu names", () => {
      const html = buildGroupReassignedParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        oldGeduName: "Alice",
        newGeduName: "Bob",
        productName: "Test",
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(html).toContain("Gedu has changed");
    });

    it("escapes all names", () => {
      const html = buildGroupReassignedParentEmail({
        parentName: "<b>P</b>",
        gamerName: "<i>G</i>",
        oldGeduName: "A",
        newGeduName: "B",
        productName: "T",
      });
      expect(html).not.toContain("<b>P</b>");
      expect(html).not.toContain("<i>G</i>");
    });
  });

  describe("buildGamerMovedParentEmail", () => {
    it("includes all names and product", () => {
      const html = buildGamerMovedParentEmail({
        parentName: "Parent",
        gamerName: "Kid",
        oldGeduName: "Alice",
        newGeduName: "Bob",
        productName: "Minecraft",
      });
      expect(html).toContain("Parent");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("Bob");
      expect(html).toContain("moved");
    });
  });

  describe("buildGamerMovedOldGeduEmail", () => {
    it("includes gedu, gamer, and destination names", () => {
      const html = buildGamerMovedOldGeduEmail({
        geduName: "Alice",
        gamerName: "Kid",
        newGeduName: "Bob",
        productName: "Test",
      });
      expect(html).toContain("Alice");
      expect(html).toContain("Kid");
      expect(html).toContain("Bob");
      expect(html).toContain("moved from your group");
    });
  });

  describe("buildGamerMovedNewGeduEmail", () => {
    it("includes gedu, gamer, and origin names", () => {
      const html = buildGamerMovedNewGeduEmail({
        geduName: "Bob",
        gamerName: "Kid",
        oldGeduName: "Alice",
        productName: "Test",
      });
      expect(html).toContain("Bob");
      expect(html).toContain("Kid");
      expect(html).toContain("Alice");
      expect(html).toContain("moved to your group");
    });
  });
});
