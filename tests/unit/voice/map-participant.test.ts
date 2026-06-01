import { describe, it, expect } from "vitest";
import type { DailyParticipant } from "@daily-co/daily-js";

// mapParticipant is not exported, so we extract and test its logic directly.
// The encoding convention is:
//   user_name = "userId|role|displayName"                              (instant rooms)
//   user_name = "userId|role|displayName|mcUsername|mcUuid"            (group rooms)
// The trailing Minecraft slots are only present on group-room tokens; their
// presence is what tells the client to render the Minecraft badge.
// This test ensures the parsing is correct for Identicon generation, role
// extraction, and Minecraft identity.

// Mirrors VoiceRole in src/components/voice/hooks/types.ts. "guest" is the
// extra role used by instant voice rooms for unauthenticated joiners (and
// authenticated parents/gamers, who get the same treatment on those rooms).
type VoiceRole = "admin" | "customer" | "gamer" | "gedu" | "guest";

type ParticipantFields = Pick<DailyParticipant, "user_name" | "session_id" | "audio" | "video" | "tracks" | "local" | "owner">;

// Mirrors the production mapParticipant in src/components/voice/VoiceRoomProvider.tsx,
// minus the spatial position argument. Keep in sync with production.
function mapParticipant(
  p: ParticipantFields,
  activeSpeakerId: string | null
) {
  const raw = p.user_name || "";
  const parts = raw.split("|");
  const userId = parts[0] || p.session_id;
  const role = parts[1] as VoiceRole;
  const userName = parts[2] || "Unknown";
  const hasMinecraft = parts.length > 3;
  const minecraftUsername = hasMinecraft ? parts[3] || null : undefined;
  const minecraftUuid = hasMinecraft ? parts[4] || null : undefined;

  return {
    sessionId: p.session_id,
    userId,
    role,
    userName,
    minecraftUsername,
    minecraftUuid,
    audioOn: !p.audio ? false : p.tracks.audio.state === "playable",
    videoOn: !p.video ? false : p.tracks.video.state === "playable",
    isLocal: p.local,
    isOwner: p.owner,
    isSpeaking: p.session_id === activeSpeakerId && Boolean(p.audio) && p.tracks.audio.state === "playable",
  };
}

function createFakeParticipant(
  overrides: Partial<{
    user_name: string;
    session_id: string;
    audio: boolean;
    video: boolean;
    audioState: string;
    videoState: string;
    local: boolean;
    owner: boolean;
  }> = {}
) {
  const {
    user_name = "user-123|gamer|Alice",
    session_id = "sess-abc",
    audio = true,
    video = false,
    audioState = "playable",
    videoState = "off",
    local = false,
    owner = false,
  } = overrides;

  return {
    user_name,
    session_id,
    audio,
    video,
    local,
    owner,
    tracks: {
      audio: { state: audioState },
      video: { state: videoState },
    },
  } as unknown as ParticipantFields;
}

describe("mapParticipant", () => {
  describe("userId|role|displayName parsing", () => {
    it("should split userId, role, and displayName on pipe separators", () => {
      const p = createFakeParticipant({ user_name: "abc-def-123|gedu|Cool Educator" });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("abc-def-123");
      expect(result.role).toBe("gedu");
      expect(result.userName).toBe("Cool Educator");
    });

    it("should treat displayName as a single slot (buildUserName strips pipes from it)", () => {
      // Post-Minecraft-slots, displayName is parts[2] only. buildUserName
      // strips `|` from displayName, so a real name never bleeds into the
      // trailing Minecraft slots — but if it somehow did, the extra segments
      // are read as Minecraft fields, not re-joined into the name.
      const p = createFakeParticipant({ user_name: "user-id|admin|Name|Steve|uuid-1" });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("user-id");
      expect(result.role).toBe("admin");
      expect(result.userName).toBe("Name");
    });

    it("should fall back to user_name for userId and use 'Unknown' name when no separators", () => {
      const p = createFakeParticipant({
        user_name: "JustAName",
        session_id: "sess-xyz",
      });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("JustAName");
      expect(result.userName).toBe("Unknown");
    });

    it("should use 'Unknown' when user_name is empty", () => {
      const p = createFakeParticipant({
        user_name: "",
        session_id: "sess-xyz",
      });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("sess-xyz");
      expect(result.userName).toBe("Unknown");
    });

    it("should parse all five roles correctly (admin, customer, gamer, gedu, guest)", () => {
      for (const role of ["admin", "customer", "gamer", "gedu", "guest"] as const) {
        const p = createFakeParticipant({ user_name: `uid|${role}|Name` });
        const result = mapParticipant(p, null);
        expect(result.role).toBe(role);
      }
    });
  });

  describe("Minecraft identity parsing", () => {
    it("decodes a verified Minecraft username + uuid from the trailing slots", () => {
      const p = createFakeParticipant({
        user_name: "uid|gamer|Kid|Steve123|abc-uuid",
      });
      const result = mapParticipant(p, null);

      expect(result.userName).toBe("Kid");
      expect(result.minecraftUsername).toBe("Steve123");
      expect(result.minecraftUuid).toBe("abc-uuid");
    });

    it("decodes an unverified username (uuid slot empty) as username + null uuid", () => {
      const p = createFakeParticipant({ user_name: "uid|gamer|Kid|Steve123|" });
      const result = mapParticipant(p, null);

      expect(result.minecraftUsername).toBe("Steve123");
      expect(result.minecraftUuid).toBeNull();
    });

    it("decodes empty Minecraft slots as null (linked-but-unset → '(Unknown)' badge)", () => {
      // Group-room token for a gamer/gedu with no Minecraft account: the
      // slots are present (so the badge renders) but empty (so it shows
      // "(Unknown)").
      const p = createFakeParticipant({ user_name: "uid|gamer|Kid||" });
      const result = mapParticipant(p, null);

      expect(result.minecraftUsername).toBeNull();
      expect(result.minecraftUuid).toBeNull();
    });

    it("leaves Minecraft fields undefined when the slots are absent (instant rooms → no badge)", () => {
      const p = createFakeParticipant({ user_name: "uid|gedu|Edu" });
      const result = mapParticipant(p, null);

      expect(result.minecraftUsername).toBeUndefined();
      expect(result.minecraftUuid).toBeUndefined();
    });
  });

  describe("audio/video state", () => {
    it("should report audioOn when audio is enabled and playable", () => {
      const p = createFakeParticipant({ audio: true, audioState: "playable" });
      const result = mapParticipant(p, null);

      expect(result.audioOn).toBe(true);
    });

    it("should report audioOn false when audio is disabled", () => {
      const p = createFakeParticipant({ audio: false, audioState: "playable" });
      const result = mapParticipant(p, null);

      expect(result.audioOn).toBe(false);
    });

    it("should report audioOn false when audio track is not playable", () => {
      const p = createFakeParticipant({ audio: true, audioState: "off" });
      const result = mapParticipant(p, null);

      expect(result.audioOn).toBe(false);
    });

    it("should report videoOn when video is enabled and playable", () => {
      const p = createFakeParticipant({ video: true, videoState: "playable" });
      const result = mapParticipant(p, null);

      expect(result.videoOn).toBe(true);
    });

    it("should report videoOn false when video is disabled", () => {
      const p = createFakeParticipant({ video: false, videoState: "playable" });
      const result = mapParticipant(p, null);

      expect(result.videoOn).toBe(false);
    });
  });

  describe("speaking state", () => {
    it("should mark participant as speaking when they are the active speaker", () => {
      const p = createFakeParticipant({ session_id: "sess-abc" });
      const result = mapParticipant(p, "sess-abc");

      expect(result.isSpeaking).toBe(true);
    });

    it("should not mark participant as speaking when someone else is active", () => {
      const p = createFakeParticipant({ session_id: "sess-abc" });
      const result = mapParticipant(p, "sess-xyz");

      expect(result.isSpeaking).toBe(false);
    });

    it("should not mark anyone as speaking when no active speaker", () => {
      const p = createFakeParticipant({ session_id: "sess-abc" });
      const result = mapParticipant(p, null);

      expect(result.isSpeaking).toBe(false);
    });

    it("should not mark participant as speaking when muted even if active speaker", () => {
      const p = createFakeParticipant({ session_id: "sess-abc", audio: false });
      const result = mapParticipant(p, "sess-abc");

      expect(result.isSpeaking).toBe(false);
    });
  });

  describe("ownership and local state", () => {
    it("should reflect local participant", () => {
      const p = createFakeParticipant({ local: true });
      const result = mapParticipant(p, null);

      expect(result.isLocal).toBe(true);
    });

    it("should reflect owner status", () => {
      const p = createFakeParticipant({ owner: true });
      const result = mapParticipant(p, null);

      expect(result.isOwner).toBe(true);
    });

    it("should reflect owner false", () => {
      const p = createFakeParticipant({ owner: false });
      const result = mapParticipant(p, null);

      expect(result.isOwner).toBe(false);
    });
  });
});
