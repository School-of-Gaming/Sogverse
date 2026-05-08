import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/voice/instant/create/route";
import { DailyApiError } from "@/lib/daily";
import { VOICE_CONFIG } from "@/lib/constants/voice";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateDailyRoom = vi.fn();
vi.mock("@/lib/daily", async () => {
  const actual = await vi.importActual<typeof import("@/lib/daily")>("@/lib/daily");
  return {
    ...actual,
    createDailyRoom: (...args: unknown[]) => mockCreateDailyRoom(...args),
  };
});

function authenticated(role: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: `${role}-user-id` },
    profile: { role, first_name: `${role} user` },
    supabase: {},
  });
}

describe("POST /api/voice/instant/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDailyRoom.mockResolvedValue({ name: "any" });
  });

  it("rejects unauthenticated users", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("rejects gamers", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST();
    expect(response.status).toBe(403);
  });

  it("returns a 4-character code on success", async () => {
    authenticated("admin");
    const response = await POST();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it("creates a Daily room with an 8-hour exp", async () => {
    authenticated("admin");
    const before = Math.round(Date.now() / 1000);
    await POST();
    const after = Math.round(Date.now() / 1000);

    expect(mockCreateDailyRoom).toHaveBeenCalledTimes(1);
    const arg = mockCreateDailyRoom.mock.calls[0][0];
    expect(arg.name).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    // exp should be ~8h ahead of now
    expect(arg.expUnix).toBeGreaterThanOrEqual(
      before + VOICE_CONFIG.INSTANT_ROOM_EXP_SECONDS - 1,
    );
    expect(arg.expUnix).toBeLessThanOrEqual(
      after + VOICE_CONFIG.INSTANT_ROOM_EXP_SECONDS + 1,
    );
  });

  it("retries on 409 collision and returns the next code", async () => {
    authenticated("gedu");
    mockCreateDailyRoom
      .mockRejectedValueOnce(new DailyApiError(409, "Conflict"))
      .mockResolvedValueOnce({ name: "ok" });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(mockCreateDailyRoom).toHaveBeenCalledTimes(2);
  });

  it("returns 503 if all retries collide", async () => {
    authenticated("admin");
    mockCreateDailyRoom.mockRejectedValue(new DailyApiError(409, "Conflict"));

    const response = await POST();
    expect(response.status).toBe(503);
    expect(mockCreateDailyRoom).toHaveBeenCalledTimes(
      VOICE_CONFIG.INSTANT_ROOM_CREATE_MAX_RETRIES,
    );
  });

  it("returns 500 on a non-409 Daily error and does not retry", async () => {
    authenticated("admin");
    mockCreateDailyRoom.mockRejectedValue(
      new DailyApiError(500, "Daily down"),
    );

    const response = await POST();
    expect(response.status).toBe(500);
    expect(mockCreateDailyRoom).toHaveBeenCalledTimes(1);
  });

  it("allows admin and gedu but not customer", async () => {
    // The route gates via requireRole(["admin", "gedu"]); we're testing that
    // we wired the right role list, not requireRole's internals.
    expect(mockRequireRole).not.toHaveBeenCalled();
    authenticated("admin");
    await POST();
    expect(mockRequireRole).toHaveBeenLastCalledWith(
      ["admin", "gedu"],
      expect.any(Object),
    );
  });
});
