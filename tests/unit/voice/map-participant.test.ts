import { describe, it, expect } from "vitest";
import type { DailyParticipant } from "@daily-co/daily-js";

// mapParticipant is not exported, so we extract and test its logic directly.
// The encoding convention is: user_name = "userId|displayName"
// This test ensures the parsing is correct for Identicon generation.

function mapParticipant(
  p: Pick<DailyParticipant, "user_name" | "session_id" | "audio" | "video" | "tracks" | "local" | "owner">,
  activeSpeakerId: string | null
) {
  const raw = p.user_name || "";
  const separatorIndex = raw.indexOf("|");
  const userId = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : p.session_id;
  const userName = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : raw || "Unknown";

  return {
    sessionId: p.session_id,
    userId,
    userName,
    audioOn: !p.audio ? false : p.tracks.audio?.state === "playable",
    videoOn: !p.video ? false : p.tracks.video?.state === "playable",
    isLocal: p.local,
    isOwner: p.owner ?? false,
    isSpeaking: p.session_id === activeSpeakerId,
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
    user_name = "user-123|Alice",
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
  } as unknown as DailyParticipant;
}

describe("mapParticipant", () => {
  describe("userId|displayName parsing", () => {
    it("should split userId and displayName on pipe separator", () => {
      const p = createFakeParticipant({ user_name: "abc-def-123|Cool Gamer" });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("abc-def-123");
      expect(result.userName).toBe("Cool Gamer");
    });

    it("should handle display names containing pipe characters", () => {
      const p = createFakeParticipant({ user_name: "user-id|Name|With|Pipes" });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("user-id");
      expect(result.userName).toBe("Name|With|Pipes");
    });

    it("should fall back to session_id for userId when no pipe separator", () => {
      const p = createFakeParticipant({
        user_name: "JustAName",
        session_id: "sess-xyz",
      });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("sess-xyz");
      expect(result.userName).toBe("JustAName");
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

    it("should handle undefined user_name", () => {
      const p = createFakeParticipant({ session_id: "sess-abc" });
      // Simulate undefined (Daily can return this for unnamed participants)
      (p as any).user_name = undefined;
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("sess-abc");
      expect(result.userName).toBe("Unknown");
    });

    it("should handle empty userId with pipe separator", () => {
      const p = createFakeParticipant({ user_name: "|DisplayOnly" });
      const result = mapParticipant(p, null);

      expect(result.userId).toBe("");
      expect(result.userName).toBe("DisplayOnly");
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

    it("should default owner to false when undefined", () => {
      const p = createFakeParticipant();
      (p as any).owner = undefined;
      const result = mapParticipant(p, null);

      expect(result.isOwner).toBe(false);
    });
  });
});
