import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceService } from "@/services/voice/voice.service";
import {
  mockSupabaseSuccess,
  mockSupabaseError,
} from "../../mocks/supabase";
import { createMockAvailableVoiceRoom } from "../../mocks/voice";

describe("VoiceService", () => {
  let service: VoiceService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  function createMockSupabase() {
    return {
      from: vi.fn(),
      rpc: vi.fn(),
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new VoiceService(mockSupabase as any);
  });

  describe("getAvailableRooms", () => {
    it("should return rooms from RPC with computed session window", async () => {
      const mockRooms = [
        createMockAvailableVoiceRoom({ id: "1", name: "Room 1", room_type: "gedu_only", group_id: null, day_of_week: null, start_time: null, timezone: null, duration_minutes: null }),
        createMockAvailableVoiceRoom({ id: "2", name: "Room 2" }),
      ];

      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(mockRooms));

      const result = await service.getAvailableRooms();

      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_available_voice_rooms");
      expect(result).toHaveLength(2);
      // Always-open room should have isOpen: true
      expect(result[0].isOpen).toBe(true);
      expect(result[0].nextSessionStart).toBeNull();
      // Group room should have computed window
      expect(typeof result[1].isOpen).toBe("boolean");
    });

    it("should return empty array when no rooms", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(null));

      const result = await service.getAvailableRooms();

      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      mockSupabase.rpc.mockResolvedValue(
        mockSupabaseError("Database error"),
      );

      await expect(service.getAvailableRooms()).rejects.toThrow();
    });
  });

  describe("getToken", () => {
    it("should POST to /api/voice/token and return token + roomUrl", async () => {
      const mockResponse = {
        token: "daily-token-abc",
        roomUrl: "https://test.daily.co/group-abcd1234",
        role: "gedu",
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await service.getToken("room-uuid-1234");

      expect(fetchSpy).toHaveBeenCalledWith("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: "room-uuid-1234" }),
      });
      expect(result).toEqual(mockResponse);

      fetchSpy.mockRestore();
    });

    it("should throw on error response", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(service.getToken("bad-id")).rejects.toThrow("Room not found");

      fetchSpy.mockRestore();
    });
  });
});
