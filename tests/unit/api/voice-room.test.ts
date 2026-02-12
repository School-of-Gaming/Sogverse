import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, PATCH } from "@/app/api/voice/room/route";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";
import { createMockVoiceRoom } from "../../mocks/voice";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockFromSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockFromSelect,
    })),
  })),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

const mockCreateDailyRoom = vi.fn();
const mockGetDailyRoom = vi.fn();
vi.mock("@/lib/daily", () => ({
  createDailyRoom: (...args: unknown[]) => mockCreateDailyRoom(...args),
  getDailyRoom: (...args: unknown[]) => mockGetDailyRoom(...args),
}));

// --- Helpers ---

function mockAuthenticatedGedu() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "gedu-user-id" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({
          role: "gedu",
          display_name: "Test Educator",
          username: "testgedu",
        })
      ),
    }),
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

function mockAuthenticatedWithRole(role: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "some-user-id" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({ role, display_name: "User", username: "user" })
      ),
    }),
  });
}

function createJsonRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createPatchRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/room", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// --- Tests ---

describe("POST /api/voice/room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-gedu/admin roles", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only gedus and admins can manage voice rooms");
  });

  it("should return 403 for customer role", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
  });

  it("should return existing open room idempotently", async () => {
    mockAuthenticatedGedu();

    const existingRoom = createMockVoiceRoom({ status: "open" as any });
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess(existingRoom)),
        }),
      }),
    });

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room).toEqual(existingRoom);
    expect(mockCreateDailyRoom).not.toHaveBeenCalled();
  });

  it("should reopen a closed room", async () => {
    mockAuthenticatedGedu();

    const closedRoom = createMockVoiceRoom({ status: "closed" as any });
    const reopenedRoom = createMockVoiceRoom({ status: "open" as any });

    // First call: admin.from("voice_rooms").select("*").eq("creator_id",...).single()
    // Second call: admin.from("voice_rooms").update(...).eq("id",...).select().single()
    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSupabaseSuccess(closedRoom)),
            }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(mockSupabaseSuccess(reopenedRoom)),
            }),
          }),
        }),
      };
    });

    mockGetDailyRoom.mockResolvedValue(null);
    mockCreateDailyRoom.mockResolvedValue({ name: closedRoom.daily_room_name });

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room).toEqual(reopenedRoom);
    expect(mockGetDailyRoom).toHaveBeenCalledWith(closedRoom.daily_room_name);
    expect(mockCreateDailyRoom).toHaveBeenCalled();
  });

  it("should create a new room when none exists", async () => {
    mockAuthenticatedGedu();

    const newRoom = createMockVoiceRoom();

    // First call: existing check returns no row
    // Second call: insert
    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                mockSupabaseError("No rows", "PGRST116")
              ),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(newRoom)),
          }),
        }),
      };
    });

    mockGetDailyRoom.mockResolvedValue(null);
    mockCreateDailyRoom.mockResolvedValue({ name: "room-gedu-use" });

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room).toEqual(newRoom);
    expect(mockGetDailyRoom).toHaveBeenCalled();
    expect(mockCreateDailyRoom).toHaveBeenCalled();
  });

  it("should skip Daily.co creation if room already exists on Daily.co", async () => {
    mockAuthenticatedGedu();

    const newRoom = createMockVoiceRoom();

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                mockSupabaseError("No rows", "PGRST116")
              ),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(newRoom)),
          }),
        }),
      };
    });

    // Daily.co room already exists
    mockGetDailyRoom.mockResolvedValue({ name: "room-gedu-use", url: "https://test.daily.co/room-gedu-use" });

    const response = await POST(createJsonRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room).toEqual(newRoom);
    expect(mockGetDailyRoom).toHaveBeenCalled();
    expect(mockCreateDailyRoom).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/voice/room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(createPatchRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for non-gedu/admin roles", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await PATCH(createPatchRequest());
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only gedus and admins can manage voice rooms");
  });

  it("should close the creator's room", async () => {
    mockAuthenticatedGedu();

    const closedRoom = createMockVoiceRoom({ status: "closed" as any });
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(mockSupabaseSuccess(closedRoom)),
          }),
        }),
      }),
    });

    const response = await PATCH(createPatchRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.room.status).toBe("closed");
  });
});
