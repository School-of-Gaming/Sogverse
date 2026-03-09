import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/voice/token/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess } from "../../mocks/supabase";
import { createMockVoiceRoom } from "../../mocks/voice";
import { VOICE_CONFIG } from "@/lib/constants/voice";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
  })),
}));

const mockCreateMeetingToken = vi.fn();
const mockGetDailyRoom = vi.fn();
const mockCreateDailyRoom = vi.fn();
vi.mock("@/lib/daily", () => ({
  createMeetingToken: (...args: unknown[]) => mockCreateMeetingToken(...args),
  getDailyRoom: (...args: unknown[]) => mockGetDailyRoom(...args),
  createDailyRoom: (...args: unknown[]) => mockCreateDailyRoom(...args),
}));

const mockComputeSessionWindow = vi.fn();
vi.mock("@/lib/voice-schedule", () => ({
  computeSessionWindow: (...args: unknown[]) => mockComputeSessionWindow(...args),
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
  profile: { role: string; display_name: string; username: string | null },
) {
  if (profile.role === "customer") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "You do not have permission to join voice rooms" },
        { status: 403 },
      ),
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile,
    supabase: {},
  });
}

function mockRoomLookup(room: Record<string, unknown> | null) {
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

function createGroupRoom(overrides: Record<string, unknown> = {}) {
  return {
    ...createMockVoiceRoom(),
    room_type: "group",
    group_id: "group-uuid-1234",
    product_groups: {
      gedu_id: "gedu-user-id",
      product_id: "product-uuid-1234",
      products: {
        day_of_week: 1,
        start_time: "14:00",
        timezone: "Europe/Helsinki",
        duration_minutes: 60,
      },
    },
    ...overrides,
  };
}

function createSpecialRoom(roomType: string) {
  return {
    ...createMockVoiceRoom({
      group_id: null,
      room_type: roomType,
      daily_room_name: roomType === "admin_only" ? "admin-lounge" : "gedu-lounge",
    }),
    product_groups: null,
  };
}

// --- Tests ---

describe("POST /api/voice/token", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = "testdomain";
    mockCreateMeetingToken.mockResolvedValue("mock-daily-token");
    mockGetDailyRoom.mockResolvedValue({ name: "test-room" });
    mockComputeSessionWindow.mockReturnValue({
      isOpen: true,
      nextSessionStart: new Date(),
      windowOpensAt: new Date(),
      windowClosesAt: new Date(Date.now() + 3600_000),
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = originalEnv;
  });

  it("should return 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
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
    mockRoomLookup(createGroupRoom());

    const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Voice chat is not configured");
  });

  describe("admin_only room", () => {
    it("should allow admin to join", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin",
        username: "admin1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });

    it("should reject gedu from admin-only room", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Educator",
        username: "edu1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Only admins can join this room");
    });

    it("should reject gamer from admin-only room", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(403);
    });
  });

  describe("gedu_only room", () => {
    it("should allow gedu to join", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Educator",
        username: "edu1",
      });
      mockRoomLookup(createSpecialRoom("gedu_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });

    it("should allow admin to join gedu-only room", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin",
        username: "admin1",
      });
      mockRoomLookup(createSpecialRoom("gedu_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });

    it("should reject gamer from gedu-only room", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });
      mockRoomLookup(createSpecialRoom("gedu_only"));

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Only educators and admins can join this room");
    });
  });

  describe("group room — gedu access", () => {
    it("should allow assigned gedu to join", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Educator",
        username: "edu1",
      });
      mockRoomLookup(createGroupRoom());

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });

    it("should reject unassigned gedu", async () => {
      mockAuthenticatedWithProfile("other-gedu-id", {
        role: "gedu",
        display_name: "Other Educator",
        username: "edu2",
      });
      mockRoomLookup(createGroupRoom());

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("You are not assigned to this group");
    });
  });

  describe("group room — gamer access", () => {
    /** Helper: mock both room lookup + enrollment query for gamer tests */
    function mockGamerEnrollment(enrollment: { id: string; created_at: string } | null) {
      let fromCallCount = 0;
      mockAdminFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(mockSupabaseSuccess(createGroupRoom())),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess(enrollment)),
                  }),
                }),
              }),
            }),
          }),
        };
      });
    }

    it("should allow enrolled gamer to join when session is open", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });
      mockRoomLookup(createGroupRoom());

      // Enrolled well before session start
      const sessionStart = new Date();
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: sessionStart,
        windowOpensAt: new Date(sessionStart.getTime() - 300_000),
        windowClosesAt: new Date(sessionStart.getTime() + 3600_000),
      });

      mockGamerEnrollment({
        id: "enrollment-1",
        created_at: new Date(sessionStart.getTime() - 7 * 24 * 3600_000).toISOString(),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });

    it("should reject unenrolled gamer", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });

      mockGamerEnrollment(null);

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("You are not enrolled in this group");
    });

    it("should reject gamer outside session window", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });

      mockComputeSessionWindow.mockReturnValue({
        isOpen: false,
        nextSessionStart: new Date(Date.now() + 86400_000),
        windowOpensAt: new Date(Date.now() + 86100_000),
        windowClosesAt: new Date(Date.now() + 90000_000),
      });

      mockGamerEnrollment({
        id: "enrollment-1",
        created_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Room is not open yet");
    });

    it("should reject gamer who enrolled after session started (mid-session enrollment)", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });

      // Session started 20 minutes ago
      const sessionStart = new Date(Date.now() - 20 * 60_000);
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: sessionStart,
        windowOpensAt: new Date(sessionStart.getTime() - 300_000),
        windowClosesAt: new Date(sessionStart.getTime() + 3600_000),
      });

      // Enrolled 5 minutes ago — after the session started
      mockGamerEnrollment({
        id: "enrollment-1",
        created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Your enrollment starts next session");
    });

    it("should allow gamer who enrolled just before session started", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Gamer",
        username: "gamer1",
      });

      // Session started 1 minute ago
      const sessionStart = new Date(Date.now() - 60_000);
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: sessionStart,
        windowOpensAt: new Date(sessionStart.getTime() - 300_000),
        windowClosesAt: new Date(sessionStart.getTime() + 3600_000),
      });

      // Enrolled 2 minutes ago — before the session started
      mockGamerEnrollment({
        id: "enrollment-1",
        created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      expect(response.status).toBe(200);
    });
  });

  describe("admin access", () => {
    it("should allow admin to join any group room when session is open", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin User",
        username: "admin1",
      });
      mockRoomLookup(createGroupRoom());

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.role).toBe("admin");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: true,
          userName: "admin-user-id|admin|Admin User",
        }),
      );
    });

    it("should reject admin outside session window", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin User",
        username: "admin1",
      });
      mockRoomLookup(createGroupRoom());
      mockComputeSessionWindow.mockReturnValue({
        isOpen: false,
        nextSessionStart: new Date(Date.now() + 86400_000),
        windowOpensAt: new Date(Date.now() + 86100_000),
        windowClosesAt: new Date(Date.now() + 90000_000),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Room is not open yet");
    });
  });

  describe("gedu session window", () => {
    it("should reject assigned gedu outside session window", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Educator",
        username: "edu1",
      });
      mockRoomLookup(createGroupRoom());
      mockComputeSessionWindow.mockReturnValue({
        isOpen: false,
        nextSessionStart: new Date(Date.now() + 86400_000),
        windowOpensAt: new Date(Date.now() + 86100_000),
        windowClosesAt: new Date(Date.now() + 90000_000),
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("Room is not open yet");
    });
  });

  describe("token properties", () => {
    it("should create owner token for gedu", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Test Educator",
        username: "testgedu",
      });
      mockRoomLookup(createGroupRoom());

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.token).toBe("mock-daily-token");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: true,
          enableCamera: true,
          enableMic: true,
        }),
      );
    });

    it("should create non-owner token for gamer", async () => {
      mockAuthenticatedWithProfile("gamer-user-id", {
        role: "gamer",
        display_name: "Test Gamer",
        username: "testgamer",
      });

      let fromCallCount = 0;
      mockAdminFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(mockSupabaseSuccess(createGroupRoom())),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess({
                      id: "enrollment-1",
                      created_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
                    })),
                  }),
                }),
              }),
            }),
          }),
        };
      });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));

      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
          enableCamera: true,
          enableMic: true,
        }),
      );
    });

    it("should set group room token expiry to windowClosesAt + grace period", async () => {
      mockAuthenticatedWithProfile("gedu-user-id", {
        role: "gedu",
        display_name: "Educator",
        username: "edu1",
      });
      mockRoomLookup(createGroupRoom());

      const windowClosesAt = new Date("2026-03-03T15:05:00.000Z");
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: new Date("2026-03-03T14:00:00.000Z"),
        windowOpensAt: new Date("2026-03-03T13:55:00.000Z"),
        windowClosesAt,
      });

      await POST(createTokenRequest({ roomId: "room-uuid-1234" }));

      const expectedExp = Math.round(windowClosesAt.getTime() / 1000)
        + VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ expUnix: expectedExp }),
      );
    });

    it("should not set expUnix for always-open rooms", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin",
        username: "admin1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));

      await POST(createTokenRequest({ roomId: "room-uuid-1234" }));

      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ expUnix: undefined }),
      );
    });
  });

  describe("lazy Daily.co room creation", () => {
    it("should create Daily.co room if it does not exist", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin",
        username: "admin1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));
      mockGetDailyRoom.mockResolvedValue(null);

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));

      expect(response.status).toBe(200);
      expect(mockGetDailyRoom).toHaveBeenCalledWith("admin-lounge");
      expect(mockCreateDailyRoom).toHaveBeenCalledWith({ name: "admin-lounge" });
    });

    it("should skip Daily.co creation if room already exists", async () => {
      mockAuthenticatedWithProfile("admin-user-id", {
        role: "admin",
        display_name: "Admin",
        username: "admin1",
      });
      mockRoomLookup(createSpecialRoom("admin_only"));
      mockGetDailyRoom.mockResolvedValue({ name: "admin-lounge" });

      const response = await POST(createTokenRequest({ roomId: "room-uuid-1234" }));

      expect(response.status).toBe(200);
      expect(mockCreateDailyRoom).not.toHaveBeenCalled();
    });
  });
});
