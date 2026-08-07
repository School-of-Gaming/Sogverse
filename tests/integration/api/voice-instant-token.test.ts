import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/voice/instant/token/route";

// --- Mocks ---

const mockGetUserWithProfile = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getUserWithProfile: () => mockGetUserWithProfile(),
  // `instantRoomModerator` (the route's auth-detection helper) opens a fresh
  // client only to read the gedu's verification row; `isGeduVerified` is mocked
  // below, so the client is just an opaque handle.
  createClient: vi.fn(async () => ({})),
}));

// Verification is the mod boundary: an unverified gedu must be demoted to the
// guest path. These mocks compose through the real `instantRoomModerator`
// helper, so the route's owner-eligibility decision is exercised end-to-end.
// Default verified=true so the existing mod-path tests still see a gedu as an
// owner; the unverified cases override per-test.
const mockIsGeduVerified = vi.fn();
vi.mock("@/services/gedu/gedu-profiles.service", () => ({
  isGeduVerified: (...args: unknown[]) => mockIsGeduVerified(...args),
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

function authenticated(role: string, opts?: { id?: string; firstName?: string }) {
  mockGetUserWithProfile.mockResolvedValue({
    user: { id: opts?.id ?? `${role}-user-id` },
    profile: { role, first_name: opts?.firstName ?? `${role} user` },
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
    mockIsGeduVerified.mockResolvedValue(true);
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

  describe("signed-out guest path", () => {
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
  });

  // Permission and identity are separate axes: a signed-in parent, gamer or
  // unverified gedu joins as *themselves* (profile id + profile first name)
  // while keeping guest permissions. The role slot staying "guest" is what
  // keeps every positive admin/gedu client gate dark for them.
  describe("signed-in non-moderator — own identity, guest permissions", () => {
    it("gives an authenticated parent guest permissions and their profile identity", async () => {
      authenticated("customer", { id: "parent-1", firstName: "Real Parent" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      expect(data.userId).toBe("parent-1");
      // The body's displayName is not consulted on this path at all.
      expect(data.displayName).toBe("Real Parent");
    });

    it("gives an authenticated gamer guest permissions and their profile identity", async () => {
      authenticated("gamer", { id: "gamer-1", firstName: "Real Gamer" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      expect(data.userId).toBe("gamer-1");
      expect(data.displayName).toBe("Real Gamer");
    });

    it("needs no displayName from a signed-in visitor (the lobby stops asking)", async () => {
      authenticated("customer", { id: "parent-1", firstName: "Real Parent" });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect((await response.json()).displayName).toBe("Real Parent");
    });

    it("does not length-check the profile name against the guest bounds", async () => {
      // A one-character profile first name would fail the guest-path bounds;
      // it must not, because those bounds police lobby input, not profiles.
      authenticated("gamer", { id: "gamer-1", firstName: "A" });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect((await response.json()).displayName).toBe("A");
    });

    it("encodes the role slot as 'guest' for a signed-in non-moderator", async () => {
      authenticated("customer", { id: "parent-1", firstName: "Real Parent" });
      await POST(createTokenRequest({ code: "K7P2" }));
      const slots = mockCreateMeetingToken.mock.calls[0][0].userName.split("|");
      expect(slots[0]).toBe("parent-1");
      expect(slots[1]).toBe("guest");
      expect(slots[2]).toBe("Real Parent");
    });

    it("ignores a body `userId` from a signed-in non-moderator", async () => {
      authenticated("gamer", { id: "gamer-1", firstName: "Real Gamer" });
      const response = await POST(
        createTokenRequest({
          code: "K7P2",
          userId: "00000000-0000-0000-0000-000000000000",
        }),
      );
      expect((await response.json()).userId).toBe("gamer-1");
    });
  });

  describe("moderator path", () => {
    it("issues an owner token for authenticated admin", async () => {
      authenticated("admin", { id: "admin-1", firstName: "Admin User" });
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
      authenticated("gedu", { id: "gedu-1", firstName: "Educator" });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true }),
      );
      expect((await response.json()).role).toBe("gedu");
    });

    it("uses profile first_name for mods (lobby-supplied name ignored)", async () => {
      authenticated("admin", { id: "admin-1", firstName: "Profile Admin" });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Override" }),
      );
      const data = await response.json();
      expect(data.displayName).toBe("Profile Admin");
    });

    it("does not consult verification for an admin (admins are always trusted)", async () => {
      authenticated("admin", { id: "admin-1", firstName: "Admin User" });
      await POST(createTokenRequest({ code: "K7P2" }));
      expect(mockIsGeduVerified).not.toHaveBeenCalled();
    });
  });

  describe("unverified gedu — demoted to guest permissions", () => {
    it("issues a non-owner token for an unverified gedu", async () => {
      authenticated("gedu", { id: "gedu-1", firstName: "Educator" });
      mockIsGeduVerified.mockResolvedValue(false);
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      // Guest *permissions*, but their own identity — verification gates
      // moderator power, not who you are.
      expect(data.userId).toBe("gedu-1");
      expect(data.displayName).toBe("Educator");
    });

    it("needs no displayName from an unverified gedu (they are signed in)", async () => {
      authenticated("gedu", { id: "gedu-1", firstName: "Educator" });
      mockIsGeduVerified.mockResolvedValue(false);
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      expect(data.displayName).toBe("Educator");
    });

    it("fails closed to guest when the verification lookup throws", async () => {
      authenticated("gedu", { id: "gedu-1", firstName: "Educator" });
      mockIsGeduVerified.mockRejectedValue(new Error("db down"));
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Lobby Name" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      // A lookup we couldn't complete costs them ownership, never their name.
      expect(data.displayName).toBe("Educator");
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

    // A session we can't resolve to a profile takes the *signed-out* path
    // whole: no ownership, and no identity guessed from the half-answer.
    it("treats user with null profile as a signed-out guest", async () => {
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
      const data = await response.json();
      expect(data.userId).not.toBe("u1");
      expect(data.userId).toMatch(/^[0-9a-f-]{36}$/);
      expect(data.displayName).toBe("Bob");
    });

    it("requires a name when the profile lookup came back empty", async () => {
      mockGetUserWithProfile.mockResolvedValue({
        user: { id: "u1" },
        profile: null,
      });
      const response = await POST(createTokenRequest({ code: "K7P2" }));
      expect(response.status).toBe(400);
    });

    it("treats unknown role as guest, not as mod", async () => {
      mockGetUserWithProfile.mockResolvedValue({
        user: { id: "u1" },
        profile: { role: "totally-not-a-real-role", first_name: "X" },
      });
      const response = await POST(
        createTokenRequest({ code: "K7P2", displayName: "Bob" }),
      );
      expect(response.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
      const data = await response.json();
      expect(data.role).toBe("guest");
      // A role we don't recognize costs them ownership; the profile is still
      // a real profile, so they join under it and the body is still ignored.
      expect(data.userId).toBe("u1");
      expect(data.displayName).toBe("X");
    });
  });

  describe("lobby media preferences", () => {
    it("forwards micOn=false / cameraOn=true to the token mint", async () => {
      unauthenticated();
      await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          micOn: false,
          cameraOn: true,
        }),
      );
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          startAudioOff: true,
          startVideoOff: false,
        }),
      );
    });

    it("forwards micOn=true / cameraOn=false to the token mint", async () => {
      unauthenticated();
      await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          micOn: true,
          cameraOn: false,
        }),
      );
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          startAudioOff: false,
          startVideoOff: true,
        }),
      );
    });

    it("defaults to mic on / camera off when flags are absent", async () => {
      unauthenticated();
      await POST(createTokenRequest({ code: "K7P2", displayName: "Bob" }));
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          startAudioOff: false,
          startVideoOff: true,
        }),
      );
    });

    it("ignores non-boolean micOn/cameraOn values (falls back to defaults)", async () => {
      unauthenticated();
      await POST(
        createTokenRequest({
          code: "K7P2",
          displayName: "Bob",
          micOn: "false",
          cameraOn: 1,
        }),
      );
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          startAudioOff: false,
          startVideoOff: true,
        }),
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
