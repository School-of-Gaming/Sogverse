import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/roblox/verify/route";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

// --- Mocks ---
// The route is public (no requireRole) — it's a read-only passthrough to
// Roblox's own APIs, neither of which a browser can reach, so only the lookup
// itself is mocked. Nothing here touches the real Roblox API.

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async () => {
  // Only the network hop is replaced; the rest of the module is real. There is
  // no format rule left in it — Roblox alone decides what a Roblox handle is.
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
  headshotUrl: "https://tr.rbxcdn.com/abc/100/100/AvatarHeadshot/Png",
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

  /**
   * **The decision, on the read path: Roblox is asked about every handle.** Each
   * of these was a 400 here once, on the strength of a copy of Roblox's *current*
   * signup validator — a rule younger than the accounts it was judging, so live
   * handles were refused on Roblox's behalf and the refusal was wrong.
   */
  it.each(["ab", "a_b_c", "_abc", "abc_", "a-b", "Old Timer"])(
    "asks Roblox about %s rather than answering for it",
    async (username) => {
      mockLookupRobloxProfile.mockResolvedValue(null);

      const response = await GET(createRequest(username));

      expect(response.status).toBe(404);
      expect(mockLookupRobloxProfile).toHaveBeenCalledWith(username);
    },
  );

  // The one refusal left: a bound on our own request, not a claim about handles.
  it("returns 400 for a username past the length bound", async () => {
    const response = await GET(
      createRequest("a".repeat(GAME_USERNAME_MAX_LENGTH + 1)),
    );

    expect(response.status).toBe(400);
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  // Nothing to ask about — a read has no field to clear.
  it("returns 400 for a blank username", async () => {
    const response = await GET(createRequest("   "));

    expect(response.status).toBe(400);
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("returns 404 when Roblox has no such account", async () => {
    mockLookupRobloxProfile.mockResolvedValue(null);

    const response = await GET(createRequest("definitelynobody"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("No Roblox account found");
  });

  it("returns the account and both renders in one response", async () => {
    mockLookupRobloxProfile.mockResolvedValue(PROFILE);

    const response = await GET(createRequest("BUILDERMAN"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(PROFILE);
    // The lookup is handed the raw username; Roblox's own casing comes back.
    expect(mockLookupRobloxProfile).toHaveBeenCalledWith("BUILDERMAN");
  });

  it("serves a profile whose renders could not be resolved", async () => {
    mockLookupRobloxProfile.mockResolvedValue({
      ...PROFILE,
      avatarUrl: null,
      headshotUrl: null,
    });

    const response = await GET(createRequest("builderman"));
    const data = await response.json();

    // A pending or moderated render must not fail the verification, and that
    // holds for each independently — the two are separate upstream calls.
    expect(response.status).toBe(200);
    expect(data.avatarUrl).toBeNull();
    expect(data.headshotUrl).toBeNull();
  });

  it("serves a profile where only one of the two renders resolved", async () => {
    mockLookupRobloxProfile.mockResolvedValue({ ...PROFILE, headshotUrl: null });

    const response = await GET(createRequest("builderman"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.avatarUrl).toBe(PROFILE.avatarUrl);
    expect(data.headshotUrl).toBeNull();
  });
});
