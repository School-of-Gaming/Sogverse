import { describe, it, expect } from "vitest";
import { buildUserName, parseUserName } from "@/lib/voice/user-name";

// The Daily.co user_name pipe-encoding, written by buildUserName (token
// routes) and decoded by parseUserName (participant rendering + chat):
//   user_name = "userId|role|displayName"                                (no game context)
//   user_name = "userId|role|displayName|platform|username|externalId"   (a game room)
// The platform slot is the gate: which identity a room surfaces is the
// *product's* decision (its topic), so every peer in one room carries the same
// platform or none at all.
//
// Our token routes are the only writers of user_name, so a malformed role slot
// is a token-generation bug — parseUserName throws instead of papering over it
// with a sentinel role. The game slots are cosmetic and degrade instead.

describe("parseUserName", () => {
  describe("userId|role|displayName parsing", () => {
    it("splits userId, role, and displayName on pipe separators", () => {
      const result = parseUserName("abc-def-123|gedu|Cool Educator");

      expect(result.userId).toBe("abc-def-123");
      expect(result.role).toBe("gedu");
      expect(result.displayName).toBe("Cool Educator");
    });

    it("treats displayName as a single slot (buildUserName strips pipes from it)", () => {
      // displayName is slot 2 only. buildUserName strips `|` from it, so a real
      // name never bleeds into the trailing game slots — but if it somehow did,
      // the extra segments are read as game fields, not re-joined into the name.
      const result = parseUserName("user-id|admin|Name|minecraft|Steve|uuid-1");

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
      expect(result.gamePlatform).toBeUndefined();
      expect(result.gameUsername).toBeUndefined();
      expect(result.gameExternalId).toBeUndefined();
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

  describe("Minecraft identity", () => {
    it("decodes a verified username + Mojang UUID, keeping the key a string", () => {
      const result = parseUserName("uid|gamer|Kid|minecraft|Steve123|abc-uuid");

      expect(result.displayName).toBe("Kid");
      expect(result.gamePlatform).toBe("minecraft");
      expect(result.gameUsername).toBe("Steve123");
      expect(result.gameExternalId).toBe("abc-uuid");
    });

    it("decodes an unverified username (key slot empty) as username + null key", () => {
      const result = parseUserName("uid|gamer|Kid|minecraft|Steve123|");

      expect(result.gameUsername).toBe("Steve123");
      expect(result.gameExternalId).toBeNull();
    });

    it("decodes empty identity slots as null (linked-but-unset → '(Unknown)')", () => {
      // A Minecraft room's token for a gamer/gedu with no account: the platform
      // is there (so the row renders) but the identity is empty (so it shows
      // "(Unknown)").
      const result = parseUserName("uid|gamer|Kid|minecraft||");

      expect(result.gamePlatform).toBe("minecraft");
      expect(result.gameUsername).toBeNull();
      expect(result.gameExternalId).toBeNull();
    });

    it("round-trips null identity fields as present-but-empty slots", () => {
      const result = parseUserName(
        buildUserName({
          userId: "uid",
          role: "gamer",
          displayName: "Kid",
          gamePlatform: "minecraft",
          gameUsername: null,
          gameExternalId: null,
        }),
      );

      expect(result.gamePlatform).toBe("minecraft");
      expect(result.gameUsername).toBeNull();
      expect(result.gameExternalId).toBeNull();
    });
  });

  describe("Roblox identity", () => {
    it("decodes the account key back into a number, not the string it crossed as", () => {
      // Roblox account ids are int64s. They ride the wire as decimal text and
      // must come back as numbers — the render lookup is by numeric id, and a
      // string there would be a silent type hole.
      const result = parseUserName("uid|gamer|Kid|roblox|BuilderKid|1583920471");

      expect(result.gamePlatform).toBe("roblox");
      expect(result.gameUsername).toBe("BuilderKid");
      expect(result.gameExternalId).toBe(1583920471);
    });

    it("round-trips a numeric key through buildUserName", () => {
      const encoded = buildUserName({
        userId: "uid",
        role: "gedu",
        displayName: "Edu",
        gamePlatform: "roblox",
        gameUsername: "BuilderKid",
        gameExternalId: 1583920471,
      });

      expect(encoded).toBe("uid|gedu|Edu|roblox|BuilderKid|1583920471");
      expect(parseUserName(encoded).gameExternalId).toBe(1583920471);
    });

    it("reads an unverified handle as a null key (no id → the silhouette)", () => {
      const result = parseUserName("uid|gamer|Kid|roblox|BuilderKid|");

      expect(result.gameUsername).toBe("BuilderKid");
      expect(result.gameExternalId).toBeNull();
    });

    it("reads a key that isn't a clean integer as null rather than NaN", () => {
      // `null` draws the silhouette; a NaN would reach a thumbnail endpoint
      // expecting an id.
      expect(parseUserName("uid|gamer|Kid|roblox|Kid|not-a-number").gameExternalId).toBeNull();
      expect(parseUserName("uid|gamer|Kid|roblox|Kid|12.5").gameExternalId).toBeNull();
    });
  });

  describe("tolerated layouts (a room outlives a deploy)", () => {
    it("reads the legacy 5-slot Minecraft form as platform minecraft", () => {
      // A token is minted once at join and lives for the whole session window,
      // so a deploy landing mid-window puts both formats in one live room. The
      // old layout was `…|minecraftUsername|minecraftUuid` with no platform
      // slot, and it was always Minecraft.
      const result = parseUserName("uid|gamer|Kid|Steve123|abc-uuid");

      expect(result.gamePlatform).toBe("minecraft");
      expect(result.gameUsername).toBe("Steve123");
      expect(result.gameExternalId).toBe("abc-uuid");
    });

    it("reads the legacy form's empty slots as linked-but-unset", () => {
      const result = parseUserName("uid|gamer|Kid||");

      expect(result.gamePlatform).toBe("minecraft");
      expect(result.gameUsername).toBeNull();
      expect(result.gameExternalId).toBeNull();
    });

    it("leaves the game fields undefined on the 3-slot instant-room form", () => {
      const result = parseUserName("uid|gedu|Edu");

      expect(result.gamePlatform).toBeUndefined();
      expect(result.gameUsername).toBeUndefined();
      expect(result.gameExternalId).toBeUndefined();
    });

    it("degrades an unknown platform slot to no game context instead of throwing", () => {
      // The mirror image of the legacy case: a peer minted by a *newer* deploy
      // that knows a platform this build does not. These slots are cosmetic, so
      // that peer drops its identity row and keeps its place in the roster —
      // unlike the role slot, which drives moderator UI and throws.
      const result = parseUserName("uid|gamer|Kid|fortnite|Kid|123");

      expect(result.displayName).toBe("Kid");
      expect(result.gamePlatform).toBeUndefined();
      expect(result.gameUsername).toBeUndefined();
      expect(result.gameExternalId).toBeUndefined();
    });

    it("degrades an empty platform slot the same way", () => {
      const result = parseUserName("uid|gamer|Kid|||");

      expect(result.gamePlatform).toBeUndefined();
      expect(result.gameUsername).toBeUndefined();
    });
  });
});
