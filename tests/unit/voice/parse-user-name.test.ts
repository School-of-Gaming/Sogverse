import { describe, it, expect } from "vitest";
import { buildUserName, parseUserName } from "@/lib/voice/user-name";

// The Daily.co user_name pipe-encoding, written by buildUserName (token
// routes) and decoded by parseUserName (participant rendering + chat):
//   user_name = "userId|role|displayName"                              (instant rooms)
//   user_name = "userId|role|displayName|mcUsername|mcUuid"            (group rooms)
// The trailing Minecraft slots are only present on group-room tokens; their
// presence is what tells the client to render the Minecraft badge.
//
// Our token routes are the only writers of user_name, so a malformed value
// (bad role slot, missing separators) is a token-generation bug —
// parseUserName throws instead of papering over it with a sentinel role.

describe("parseUserName", () => {
  describe("userId|role|displayName parsing", () => {
    it("splits userId, role, and displayName on pipe separators", () => {
      const result = parseUserName("abc-def-123|gedu|Cool Educator");

      expect(result.userId).toBe("abc-def-123");
      expect(result.role).toBe("gedu");
      expect(result.displayName).toBe("Cool Educator");
    });

    it("treats displayName as a single slot (buildUserName strips pipes from it)", () => {
      // Post-Minecraft-slots, displayName is slot 2 only. buildUserName
      // strips `|` from displayName, so a real name never bleeds into the
      // trailing Minecraft slots — but if it somehow did, the extra segments
      // are read as Minecraft fields, not re-joined into the name.
      const result = parseUserName("user-id|admin|Name|Steve|uuid-1");

      expect(result.userId).toBe("user-id");
      expect(result.role).toBe("admin");
      expect(result.displayName).toBe("Name");
    });

    it("parses all five roles (admin, customer, gamer, gedu, guest)", () => {
      for (const role of ["admin", "customer", "gamer", "gedu", "guest"] as const) {
        const result = parseUserName(`uid|${role}|Name`);
        expect(result.role).toBe(role);
      }
    });

    it("falls back to 'Unknown' when the displayName slot is empty", () => {
      const result = parseUserName("uid|gamer|");

      expect(result.userId).toBe("uid");
      expect(result.displayName).toBe("Unknown");
    });

    it("round-trips a buildUserName value, stripping pipes from the name", () => {
      const result = parseUserName(
        buildUserName({ userId: "uid", role: "guest", displayName: "Sneaky|admin|Name" }),
      );

      expect(result.userId).toBe("uid");
      expect(result.role).toBe("guest");
      expect(result.displayName).toBe("SneakyadminName");
      expect(result.minecraftUsername).toBeUndefined();
      expect(result.minecraftUuid).toBeUndefined();
    });
  });

  describe("malformed input (token-generation bugs surface loudly)", () => {
    it("throws when the name has no pipe separators", () => {
      expect(() => parseUserName("JustAName")).toThrow(/not a voice role/);
    });

    it("throws when user_name is empty, null, or undefined", () => {
      expect(() => parseUserName("")).toThrow(/not a voice role/);
      expect(() => parseUserName(null)).toThrow(/not a voice role/);
      expect(() => parseUserName(undefined)).toThrow(/not a voice role/);
    });

    it("throws when the role slot is not a known voice role", () => {
      expect(() => parseUserName("uid|superadmin|Name")).toThrow(
        /role slot "superadmin" is not a voice role/,
      );
    });

    it("throws when the role slot is empty", () => {
      expect(() => parseUserName("uid||Name")).toThrow(/not a voice role/);
    });
  });

  describe("Minecraft identity parsing", () => {
    it("decodes a verified Minecraft username + uuid from the trailing slots", () => {
      const result = parseUserName("uid|gamer|Kid|Steve123|abc-uuid");

      expect(result.displayName).toBe("Kid");
      expect(result.minecraftUsername).toBe("Steve123");
      expect(result.minecraftUuid).toBe("abc-uuid");
    });

    it("decodes an unverified username (uuid slot empty) as username + null uuid", () => {
      const result = parseUserName("uid|gamer|Kid|Steve123|");

      expect(result.minecraftUsername).toBe("Steve123");
      expect(result.minecraftUuid).toBeNull();
    });

    it("decodes empty Minecraft slots as null (linked-but-unset → '(Unknown)' badge)", () => {
      // Group-room token for a gamer/gedu with no Minecraft account: the
      // slots are present (so the badge renders) but empty (so it shows
      // "(Unknown)").
      const result = parseUserName("uid|gamer|Kid||");

      expect(result.minecraftUsername).toBeNull();
      expect(result.minecraftUuid).toBeNull();
    });

    it("leaves Minecraft fields undefined when the slots are absent (instant rooms → no badge)", () => {
      const result = parseUserName("uid|gedu|Edu");

      expect(result.minecraftUsername).toBeUndefined();
      expect(result.minecraftUuid).toBeUndefined();
    });

    it("round-trips null Minecraft fields as present-but-empty slots", () => {
      const result = parseUserName(
        buildUserName({
          userId: "uid",
          role: "gamer",
          displayName: "Kid",
          minecraftUsername: null,
          minecraftUuid: null,
        }),
      );

      expect(result.minecraftUsername).toBeNull();
      expect(result.minecraftUuid).toBeNull();
    });
  });
});
