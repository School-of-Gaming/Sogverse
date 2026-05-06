import { describe, it, expect } from "vitest";
import {
  generateVoiceRoomCode,
  isValidVoiceRoomCode,
  normalizeVoiceRoomCode,
  VOICE_ROOM_CODE_REGEX,
} from "@/lib/voice-room-code";

describe("voice-room-code", () => {
  describe("generateVoiceRoomCode", () => {
    it("returns a 4-character code", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateVoiceRoomCode();
        expect(code).toHaveLength(4);
      }
    });

    it("only uses chars from the documented alphabet", () => {
      for (let i = 0; i < 200; i++) {
        const code = generateVoiceRoomCode();
        expect(code).toMatch(VOICE_ROOM_CODE_REGEX);
      }
    });

    it("never includes the human-confusable glyphs (0, 1, I, O)", () => {
      const banned = /[01IO]/;
      for (let i = 0; i < 200; i++) {
        expect(generateVoiceRoomCode()).not.toMatch(banned);
      }
    });
  });

  describe("isValidVoiceRoomCode", () => {
    it("accepts valid uppercase codes", () => {
      expect(isValidVoiceRoomCode("K7P2")).toBe(true);
      expect(isValidVoiceRoomCode("ABCD")).toBe(true);
      expect(isValidVoiceRoomCode("2345")).toBe(true);
    });

    it("rejects the banned glyphs (0/1/I/O)", () => {
      expect(isValidVoiceRoomCode("0BCD")).toBe(false);
      expect(isValidVoiceRoomCode("1BCD")).toBe(false);
      expect(isValidVoiceRoomCode("IBCD")).toBe(false);
      expect(isValidVoiceRoomCode("OBCD")).toBe(false);
    });

    it("accepts L (only I/O are excluded letters)", () => {
      expect(isValidVoiceRoomCode("LBCD")).toBe(true);
    });

    it("rejects wrong length", () => {
      expect(isValidVoiceRoomCode("ABC")).toBe(false);
      expect(isValidVoiceRoomCode("ABCDE")).toBe(false);
      expect(isValidVoiceRoomCode("")).toBe(false);
    });

    it("rejects lowercase (caller is responsible for normalization)", () => {
      expect(isValidVoiceRoomCode("abcd")).toBe(false);
    });

    it("rejects non-alphanumeric", () => {
      expect(isValidVoiceRoomCode("AB-D")).toBe(false);
      expect(isValidVoiceRoomCode("AB CD")).toBe(false);
      expect(isValidVoiceRoomCode("../A")).toBe(false);
    });
  });

  describe("normalizeVoiceRoomCode", () => {
    it("uppercases valid lowercase codes", () => {
      expect(normalizeVoiceRoomCode("k7p2")).toBe("K7P2");
      expect(normalizeVoiceRoomCode("AbCd")).toBe("ABCD");
    });

    it("returns null for codes that contain banned glyphs even after upper-casing", () => {
      // Don't silently rescue typos by mapping 0 → O; surface them as "not found".
      expect(normalizeVoiceRoomCode("0BCD")).toBeNull();
      expect(normalizeVoiceRoomCode("oBCD")).toBeNull();
      expect(normalizeVoiceRoomCode("iBCD")).toBeNull();
    });

    it("returns null for non-strings", () => {
      expect(normalizeVoiceRoomCode(null)).toBeNull();
      expect(normalizeVoiceRoomCode(undefined)).toBeNull();
      expect(normalizeVoiceRoomCode(1234)).toBeNull();
      expect(normalizeVoiceRoomCode({})).toBeNull();
    });

    it("returns null for path-injection attempts", () => {
      expect(normalizeVoiceRoomCode("../foo")).toBeNull();
      expect(normalizeVoiceRoomCode("a/b/c")).toBeNull();
      expect(normalizeVoiceRoomCode("ABCD/extra")).toBeNull();
    });
  });
});
