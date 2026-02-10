import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceService } from "@/services/voice/voice.service";
import {
  mockSupabaseSuccess,
  mockSupabaseError,
} from "../../mocks/supabase";
import { createMockVoiceRoom, createMockOpenVoiceRoom } from "../../mocks/voice";

describe("VoiceService", () => {
  let service: VoiceService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  function createMockSupabase() {
    return {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new VoiceService(mockSupabase as any);
  });

  describe("getOpenRooms", () => {
    it("should return open rooms from RPC", async () => {
      const mockRooms = [
        createMockOpenVoiceRoom({ id: "1", name: "Room 1" }),
        createMockOpenVoiceRoom({ id: "2", name: "Room 2" }),
      ];

      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(mockRooms));

      const result = await service.getOpenRooms();

      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_open_voice_rooms");
      expect(result).toEqual(mockRooms);
    });

    it("should return empty array when no rooms", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(null));

      const result = await service.getOpenRooms();

      expect(result).toEqual([]);
    });

    it("should throw on error", async () => {
      mockSupabase.rpc.mockResolvedValue(
        mockSupabaseError("Database error")
      );

      await expect(service.getOpenRooms()).rejects.toThrow();
    });
  });

  describe("getMyRoom", () => {
    it("should return the gedu's room", async () => {
      const mockRoom = createMockVoiceRoom();

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "gedu-user-id" } },
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess(mockRoom)),
        }),
      });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const result = await service.getMyRoom();

      expect(mockSupabase.from).toHaveBeenCalledWith("voice_rooms");
      expect(result).toEqual(mockRoom);
    });

    it("should return null when no room exists (PGRST116)", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "gedu-user-id" } },
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            mockSupabaseError("No rows returned", "PGRST116")
          ),
        }),
      });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      const result = await service.getMyRoom();

      expect(result).toBeNull();
    });

    it("should throw on non-PGRST116 errors", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: "gedu-user-id" } },
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            mockSupabaseError("Connection failed")
          ),
        }),
      });
      mockSupabase.from.mockReturnValue({ select: mockSelect });

      await expect(service.getMyRoom()).rejects.toThrow();
    });

    it("should throw when not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      await expect(service.getMyRoom()).rejects.toThrow("Not authenticated");
    });
  });

  describe("openRoom", () => {
    it("should POST to /api/voice/room and return the room", async () => {
      const mockRoom = createMockVoiceRoom();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ room: mockRoom }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await service.openRoom("My Room");

      expect(fetchSpy).toHaveBeenCalledWith("/api/voice/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Room" }),
      });
      expect(result).toEqual(mockRoom);

      fetchSpy.mockRestore();
    });

    it("should throw on error response", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Only gedus can manage voice rooms" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(service.openRoom()).rejects.toThrow(
        "Only gedus can manage voice rooms"
      );

      fetchSpy.mockRestore();
    });
  });

  describe("closeRoom", () => {
    it("should PATCH /api/voice/room and return the room", async () => {
      const mockRoom = createMockVoiceRoom({ status: "closed" as any });
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ room: mockRoom }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await service.closeRoom();

      expect(fetchSpy).toHaveBeenCalledWith("/api/voice/room", {
        method: "PATCH",
      });
      expect(result).toEqual(mockRoom);

      fetchSpy.mockRestore();
    });

    it("should throw on error response", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "Failed to close room" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(service.closeRoom()).rejects.toThrow("Failed to close room");

      fetchSpy.mockRestore();
    });
  });

  describe("getToken", () => {
    it("should POST to /api/voice/token and return token + roomUrl", async () => {
      const mockResponse = {
        token: "daily-token-abc",
        roomUrl: "https://test.daily.co/gedu-abc12345",
      };
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
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
        })
      );

      await expect(service.getToken("bad-id")).rejects.toThrow("Room not found");

      fetchSpy.mockRestore();
    });
  });
});
