import { describe, it, expect, vi, beforeEach } from "vitest";

// A deliberately public route: the lobby checks whether a room code resolves
// before asking the browser for camera and microphone permission, and a guest
// joining by link has no session. It reveals only that a code exists — which
// anyone holding the code could learn by simply joining — and nothing else.
// There is no wrong-role case to test, because there is no role.

const mockGetDailyRoom = vi.fn();
vi.mock("@/lib/daily", () => ({
  getDailyRoom: (...args: unknown[]) => mockGetDailyRoom(...args),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

import { GET } from "@/app/api/voice/instant/exists/route";

function existsRequest(query: string): Request {
  return new Request(
    `http://localhost:3000/api/voice/instant/exists${query}`,
  );
}

describe("GET /api/voice/instant/exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDailyRoom.mockResolvedValue({ name: "K7P2" });
  });

  // -- Public posture --

  it("answers with no session and never consults the role gate", async () => {
    const response = await GET(existsRequest("?code=K7P2"));

    expect(response.status).toBe(204);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 when no code is given", async () => {
    const response = await GET(existsRequest(""));

    expect(response.status).toBe(400);
    expect(mockGetDailyRoom).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed code, before any Daily call", async () => {
    // Validating the code shape first is what stops a malformed value from
    // becoming a path-traversal request against Daily's API.
    const response = await GET(existsRequest("?code=../../admin"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid room code" });
    expect(mockGetDailyRoom).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("answers 204 with no body when the room exists", async () => {
    const response = await GET(existsRequest("?code=k7p2"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mockGetDailyRoom).toHaveBeenCalledWith("K7P2");
  });

  it("answers 404 with the entered code echoed back when the room does not exist", async () => {
    // The echo lets the lobby show the user what they typed, so a typo is
    // obvious. A never-minted code, an ended room and an expired one all
    // collapse to this one answer on purpose.
    mockGetDailyRoom.mockResolvedValue(null);

    const response = await GET(existsRequest("?code=K7P2"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "room_not_found",
      code: "K7P2",
    });
  });
});
