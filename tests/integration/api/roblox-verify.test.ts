import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/roblox/verify/route";

// --- Mocks ---
// The route is public (no requireRole) — it's a read-only passthrough to
// Roblox's own APIs, neither of which a browser can reach, so only the lookup
// itself is mocked. Nothing here touches the real Roblox API.

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async () => {
  // The contracts module refines its username schema with the real validator,
  // so that one stays genuine — the 400 cases below are the real rules.
  const actual = await vi.importActual<typeof import("@/lib/roblox")>(
    "@/lib/roblox",
  );
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

// --- Helpers ---

function createRequest(username?: string): Request {
  const url =
    username === undefined
      ? "http://localhost:3000/api/roblox/verify"
      : `http://localhost:3000/api/roblox/verify?username=${encodeURIComponent(username)}`;
  return new Request(url, { method: "GET" });
}

const PROFILE = {
  username: "builderman",
  userId: 156,
  displayName: "builderman",
  avatarUrl: "https://tr.rbxcdn.com/abc/420/420/AvatarBust/Png",
};

// --- Tests ---

describe("GET /api/roblox/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("works without authentication (a username is checked before any account exists)", async () => {
    mockLookupRobloxProfile.mockResolvedValue(PROFILE);

    const response = await GET(createRequest("builderman"));
    expect(response.status).toBe(200);
  });

  it("returns 400 when username is missing", async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("username");
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("returns 400 for a username that breaks the Roblox format rules", async () => {
    for (const bad of ["ab", "a".repeat(21), "a_b_c", "_abc", "abc_", "a-b"]) {
      const response = await GET(createRequest(bad));

      expect(response.status).toBe(400);
    }
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("returns 404 when Roblox has no such account", async () => {
    mockLookupRobloxProfile.mockResolvedValue(null);

    const response = await GET(createRequest("definitelynobody"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("No Roblox account found");
  });

  it("returns the account and its avatar in one response", async () => {
    mockLookupRobloxProfile.mockResolvedValue(PROFILE);

    const response = await GET(createRequest("BUILDERMAN"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(PROFILE);
    // The lookup is handed the raw username; Roblox's own casing comes back.
    expect(mockLookupRobloxProfile).toHaveBeenCalledWith("BUILDERMAN");
  });

  it("serves a profile whose avatar could not be resolved", async () => {
    mockLookupRobloxProfile.mockResolvedValue({ ...PROFILE, avatarUrl: null });

    const response = await GET(createRequest("builderman"));
    const data = await response.json();

    // A pending or moderated avatar must not fail the verification.
    expect(response.status).toBe(200);
    expect(data.avatarUrl).toBeNull();
  });
});
