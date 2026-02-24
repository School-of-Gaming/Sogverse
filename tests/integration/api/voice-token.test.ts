import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/voice/token/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess } from "../../mocks/supabase";
import { createMockVoiceRoom } from "../../mocks/voice";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

const mockCreateMeetingToken = vi.fn();
vi.mock("@/lib/daily", () => ({
  createMeetingToken: (...args: unknown[]) => mockCreateMeetingToken(...args),
}));

// --- Helpers ---

function createTokenRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticatedWithProfile(
  userId: string,
  profile: { role: string; display_name: string; username: string | null }
) {
  if (profile.role === "customer") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "You do not have permission to join voice rooms" },
        { status: 403 }
      )
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile,
    supabase: {},
  });
}

function mockRoomLookup(room: ReturnType<typeof createMockVoiceRoom> | null) {
  if (room) {
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess(room)),
        }),
      }),
    });
  } else {
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "No rows", code: "PGRST116" },
          }),
        }),
      }),
    });
  }
}

// --- Tests ---

describe("POST /api/voice/token", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = "testdomain";
    mockCreateMeetingToken.mockResolvedValue("mock-daily-token");
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = originalEnv;
  });

  it("should return 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(createTokenRequest({ roomId: "room-1" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for customer role", async () => {
    mockAuthenticatedWithProfile("customer-id", {
      role: "customer",
      display_name: "Parent",
      username: "parent1",
    });

    const response = await POST(createTokenRequest({ roomId: "room-1" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("You do not have permission to join voice rooms");
  });

  it("should return 400 when roomId is missing", async () => {
    mockAuthenticatedWithProfile("gedu-user-id", {
      role: "gedu",
      display_name: "Educator",
      username: "edu1",
    });

    const response = await POST(createTokenRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("roomId is required");
  });

  it("should return 404 when room does not exist", async () => {
    mockAuthenticatedWithProfile("gedu-user-id", {
      role: "gedu",
      display_name: "Educator",
      username: "edu1",
    });
    mockRoomLookup(null);

    const response = await POST(createTokenRequest({ roomId: "nonexistent" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Room not found");
  });

  it("should return 500 when NEXT_PUBLIC_DAILY_DOMAIN is not configured", async () => {
    delete process.env.NEXT_PUBLIC_DAILY_DOMAIN;

    mockAuthenticatedWithProfile("gedu-user-id", {
      role: "gedu",
      display_name: "Educator",
      username: "edu1",
    });

    const room = createMockVoiceRoom({ creator_id: "gedu-user-id" });
    mockRoomLookup(room);

    const response = await POST(createTokenRequest({ roomId: room.id }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Voice chat is not configured");
  });

  describe("gedu token", () => {
    it("should return owner token with camera for any open room", async () => {
      const room = createMockVoiceRoom({ creator_id: "other-gedu-id" });

      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Test Educator",
        username: "testgedu",
      });
      mockRoomLookup(room);

      const response = await POST(createTokenRequest({ roomId: room.id }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-daily-token");
      expect(data.role).toBe("gedu");
      expect(data.roomUrl).toBe(
        `https://testdomain.daily.co/${room.daily_room_name}`
      );
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: true,
          enableCamera: true,
          enableMic: true,
          roomName: room.daily_room_name,
        })
      );
    });
  });

  describe("gamer token", () => {
    it("should return non-owner token with camera for open room", async () => {
      const room = createMockVoiceRoom({
        creator_id: "other-gedu-id",
        status: "open" as any,
      });

      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Test Gamer",
        username: "testgamer",
      });
      mockRoomLookup(room);

      const response = await POST(createTokenRequest({ roomId: room.id }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-daily-token");
      expect(data.role).toBe("gamer");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
          enableCamera: true,
          enableMic: true,
        })
      );
    });

    it("should return 403 when gamer tries to join a closed room", async () => {
      const room = createMockVoiceRoom({
        creator_id: "other-gedu-id",
        status: "closed" as any,
      });

      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Test Gamer",
        username: "testgamer",
      });
      mockRoomLookup(room);

      const response = await POST(createTokenRequest({ roomId: room.id }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("This room is not currently open");
    });
  });

  describe("admin token", () => {
    it("should return owner token with role encoded in userName", async () => {
      const room = createMockVoiceRoom({ creator_id: "some-gedu-id" });

      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin User",
        username: "admin1",
      });
      mockRoomLookup(room);

      const response = await POST(createTokenRequest({ roomId: room.id }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.role).toBe("admin");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: true,
          enableCamera: true,
          enableMic: true,
          userName: "admin-user-id|admin|Admin User",
        })
      );
    });
  });
});
