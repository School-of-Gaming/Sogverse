import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/voice/instant/end/route";
import { DailyApiError } from "@/lib/daily";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockDeleteDailyRoom = vi.fn();
vi.mock("@/lib/daily", async () => {
  const actual = await vi.importActual<typeof import("@/lib/daily")>("@/lib/daily");
  return {
    ...actual,
    deleteDailyRoom: (...args: unknown[]) => mockDeleteDailyRoom(...args),
  };
});

function endRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/voice/instant/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authenticated(role: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: `${role}-user-id` },
    profile: { role, display_name: `${role} user` },
    supabase: {},
  });
}

describe("POST /api/voice/instant/end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteDailyRoom.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated users", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(endRequest({ code: "K7P2" }));
    expect(response.status).toBe(401);
  });

  it("rejects gamers", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(endRequest({ code: "K7P2" }));
    expect(response.status).toBe(403);
  });

  it("rejects malformed code", async () => {
    authenticated("admin");
    const response = await POST(endRequest({ code: "not-valid" }));
    expect(response.status).toBe(400);
    expect(mockDeleteDailyRoom).not.toHaveBeenCalled();
  });

  it("rejects path-traversal code", async () => {
    authenticated("admin");
    const response = await POST(endRequest({ code: "../foo" }));
    expect(response.status).toBe(400);
    expect(mockDeleteDailyRoom).not.toHaveBeenCalled();
  });

  it("normalizes lowercase to uppercase before deleting", async () => {
    authenticated("admin");
    await POST(endRequest({ code: "k7p2" }));
    expect(mockDeleteDailyRoom).toHaveBeenCalledWith("K7P2");
  });

  it("deletes the Daily room and returns 204", async () => {
    authenticated("gedu");
    const response = await POST(endRequest({ code: "K7P2" }));
    expect(response.status).toBe(204);
    expect(mockDeleteDailyRoom).toHaveBeenCalledWith("K7P2");
  });

  it("treats Daily 404 as a no-op success (room already gone)", async () => {
    authenticated("admin");
    mockDeleteDailyRoom.mockRejectedValue(new DailyApiError(404, "Not Found"));
    const response = await POST(endRequest({ code: "K7P2" }));
    expect(response.status).toBe(204);
  });

  it("returns 500 on a non-404 Daily error", async () => {
    authenticated("admin");
    mockDeleteDailyRoom.mockRejectedValue(new DailyApiError(500, "Boom"));
    const response = await POST(endRequest({ code: "K7P2" }));
    expect(response.status).toBe(500);
  });
});
