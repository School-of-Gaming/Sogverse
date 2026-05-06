import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/voice/instant/token/route";

// --- Mocks ---

const mockGetUserWithProfile = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getUserWithProfile: () => mockGetUserWithProfile(),
}));

const mockCreateMeetingToken = vi.fn();
const mockGetDailyRoom = vi.fn();
// Stub the network-touching helpers but keep `buildUserName` real — Vector A
// (display-name pipe sanitization) asserts on the encoded output, so the
// production helper has to be the one under test, not a parallel mirror that
// can drift.
vi.mock("@/lib/daily", async () => {
  const actual = await vi.importActual<typeof import("@/lib/daily")>("@/lib/daily");
  return {
    ...actual,
    createMeetingToken: (...args: unknown[]) => mockCreateMeetingToken(...args),
    getDailyRoom: (...args: unknown[]) => mockGetDailyRoom(...args),
  };
});

// --- Helpers ---

function createTokenRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/instant/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function unauthenticated() {
  mockGetUserWithProfile.mockResolvedValue(null);
}

function authenticated(role: string, opts?: { id?: string; displayName?: string }) {
  mockGetUserWithProfile.mockResolvedValue({
    user: { id: opts?.id ?? `${role}-user-id` },
    profile: { role, display_name: opts?.displayName ?? `${role} user` },
  });
}

// --- Tests ---

describe("POST /api/voice/instant/token", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = "testdomain";
    mockCreateMeetingToken.mockResolvedValue("mock-daily-token");
    mockGetDailyRoom.mockResolvedValue({ name: "K7P2" });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = originalEnv;
  });

  describe("code validation", () => {
    it("rejects missing code", async () => {
      unauthenticated();
      const response = await POST(createTokenRequest({ displayName: "Bob" }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Invalid room code");
    });

    it("rejects malformed code", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "../etc", displayName: "Bob" }),
      );
      expect(response.status).toBe(400);
    });

    it("rejects code with banned glyphs (0/1/I/O)", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "0BCD", displayName: "Bob" }),
      );
      expect(response.status).toBe(400);
    });

    it("normalizes lowercase code to uppercase before lookup", async () => {
      unauthenticated();
      await POST(createTokenRequest({ code: "k7p2", displayName: "Bob" }));
      expect(mockGetDailyRoom).toHaveBeenCalledWith("K7P2");
    });
  });

  describe("guest path", () => {
    it("returns 400 when displayName is too short", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "x" }),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 when displayName is too long (over 32 chars)", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "x".repeat(33) }),
      );
      expect(response.status).toBe(400);
    });

    it("trims whitespace before checking length", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "  Bob  " }),
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.displayName).toBe("Bob");
    });

    it("issues a non-owner token for unauthenticated guest", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false, roomName: "K7P2" }),
      );
    });

    it("server-generates a fresh UUID for each guest (Vector D)", async () => {
      unauthenticated();
      const r1 = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      const r2 = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      const id1 = (await r1.json()).userId;
      const id2 = (await r2.json()).userId;
      expect(id1).toMatch(/^[0-9a-f-]{36}$/);
      expect(id2).toMatch(/^[0-9a-f-]{36}$/);
      expect(id1).not.toBe(id2);
    });

    it("returns role 'guest' in the response", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect((await response.json()).role).toBe("guest");
    });

    it("treats authenticated parents as guests", async () => {
      authenticated("customer", { displayName: "Real Parent" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      expect(data.displayName).toBe("Lobby Name");
    });

    it("treats authenticated gamers as guests", async () => {
      authenticated("gamer", { displayName: "Real Gamer" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      expect((await response.json()).role).toBe("guest");
    });
  });

  describe("moderator path", () => {
    it("issues an owner token for authenticated admin", async () => {
      authenticated("admin", { id: "admin-1", displayName: "Admin User" });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true, roomName: "K7P2" }),
      );
      const data = await response.json();
      expect(data.role).toBe("admin");
      expect(data.userId).toBe("admin-1");
      expect(data.displayName).toBe("Admin User");
    });

    it("issues an owner token for authenticated gedu", async () => {
      authenticated("gedu", { id: "gedu-1", displayName: "Educator" });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true }),
      );
      expect((await response.json()).role).toBe("gedu");
    });

    it("uses profile display_name for mods (lobby-supplied name ignored)", async () => {
      authenticated("admin", { id: "admin-1", displayName: "Profile Admin" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Override" }),
      );
      const data = await response.json();
      expect(data.displayName).toBe("Profile Admin");
    });
  });

  describe("Vector B — body cannot grant ownership", () => {
    it("ignores body field `isOwner: true` from unauthenticated guest", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          isOwner: true,
        }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });

    it("ignores body field `role: 'admin'` from unauthenticated guest", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          role: "admin",
        }),
      );
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.role).toBe("guest");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });

    it("ignores body field `isOwner: true` from authenticated parent", async () => {
      authenticated("customer");
      const response = await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          isOwner: true,
        }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });
  });

  describe("Vector D — guest cannot supply UUID", () => {
    it("ignores body field `userId` from guest", async () => {
      unauthenticated();
      const response = await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          userId: "00000000-0000-0000-0000-000000000000",
        }),
      );
      const data = await response.json();
      expect(data.userId).not.toBe("00000000-0000-0000-0000-000000000000");
      expect(data.userId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("Vector A — display-name pipe sanitization", () => {
    it("strips `|` characters from display name in the encoded user_name", async () => {
      unauthenticated();
      await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Spoof|admin|Foo",
        }),
      );
      const call = mockCreateMeetingToken.mock.calls[0][0];
      expect(call.userName).not.toContain("|admin|");
      // After stripping pipes, name becomes "Spoofadmin Foo" so the
      // role slot is still our server-set "guest"
      const slots = call.userName.split("|");
      expect(slots[1]).toBe("guest");
    });
  });

  describe("Vector C — auth failure falls through to guest", () => {
    it("treats null session as guest, not as mod", async () => {
      mockGetUserWithProfile.mockResolvedValue(null);
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });

    it("treats user with null profile as guest", async () => {
      mockGetUserWithProfile.mockResolvedValue({
        user: { id: "u1" },
        profile: null,
      });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });

    it("treats unknown role as guest, not as mod", async () => {
      mockGetUserWithProfile.mockResolvedValue({
        user: { id: "u1" },
        profile: { role: "totally-not-a-real-role", display_name: "X" },
      });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });
  });

  describe("room not found", () => {
    it("returns 404 with the entered code echoed back", async () => {
      unauthenticated();
      mockGetDailyRoom.mockResolvedValue(null);
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("room_not_found");
      expect(data.code).toBe("K7P2");
    });
  });

  describe("config errors", () => {
    it("returns 500 when NEXT_PUBLIC_DAILY_DOMAIN is missing", async () => {
      delete process.env.NEXT_PUBLIC_DAILY_DOMAIN;
      unauthenticated();
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(500);
    });
  });
});
