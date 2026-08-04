import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/roblox/account/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// Only the network hop is replaced. `isValidRobloxUsername` is a pure regex that
// the body schema imports, and mocking it would mean the format rule this route
// really enforces is never exercised here.
const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

// The upsert runs on the USER-bound client: the caller may write exactly their
// own roblox_accounts row, and the row key comes from the session rather than
// the request body. The mock therefore hangs off `supabase`.
const mockFrom = vi.fn();

// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/roblox/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId = "gamer-123", role = "gamer") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role },
    supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  });
}

function mockUpsertSuccess() {
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });
  mockFrom.mockReturnValue({ upsert: upsertMock });
  return { upsertMock };
}

function robloxProfile(userId: number) {
  return {
    username: "builderman",
    userId,
    displayName: "builderman",
    avatarUrl: "https://tr.rbxcdn.com/bust.png",
    headshotUrl: "https://tr.rbxcdn.com/headshot.png",
  };
}

// --- Tests ---

describe("PATCH /api/roblox/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-gamer/gedu roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only gamers and gedus can update their Roblox username" },
        { status: 403 },
      ),
    );

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["gamer", "gedu"],
      expect.any(Object),
    );
  });

  it("should accept gamer role", async () => {
    mockAuthenticated("gamer-123", "gamer");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(156));
    mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    expect(response.status).toBe(200);
  });

  it("should accept gedu role", async () => {
    mockAuthenticated("gedu-123", "gedu");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(156));
    mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    expect(response.status).toBe(200);
  });

  it("should return 400 for an invalid roblox username", async () => {
    mockAuthenticated();

    // Two underscores; Roblox permits at most one, and never at either end.
    const response = await PATCH(createRequest({ robloxUsername: "a_b_c" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid Roblox username");
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("should upsert the handle and the resolved account id", async () => {
    mockAuthenticated("gamer-123");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(156));
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.roblox_username).toBe("builderman");
    expect(data.roblox_user_id).toBe(156);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        roblox_username: "builderman",
        roblox_user_id: 156,
      },
      { onConflict: "user_id" },
    );
  });

  it("stores the typed spelling, not the canonical one", async () => {
    // The row already adopted the canonical casing before it committed, so what
    // arrives here is what the person meant. The route stores what it was sent
    // and uses the lookup only for the account id — a route that quietly
    // rewrote the name would be answering a question nobody asked it.
    mockAuthenticated("gamer-123");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(156));
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "BuilderMan" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.roblox_username).toBe("BuilderMan");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ roblox_username: "BuilderMan" }),
      { onConflict: "user_id" },
    );
  });

  it("should store the handle with a null account id when Roblox finds nothing", async () => {
    mockAuthenticated();
    mockLookupRobloxProfile.mockResolvedValue(null);
    mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "nobody_here" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.roblox_username).toBe("nobody_here");
    expect(data.roblox_user_id).toBeNull();
  });

  it("should clear both columns when robloxUsername is null", async () => {
    mockAuthenticated();
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: null }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.roblox_username).toBeNull();
    expect(data.roblox_user_id).toBeNull();
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        roblox_username: null,
        roblox_user_id: null,
      },
      { onConflict: "user_id" },
    );
    // Nothing to look up when clearing — and nothing spent against a rate limit
    // the whole serverless fleet shares.
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("should link a Roblox account another user already holds", async () => {
    // roblox_user_id carries no UNIQUE, deliberately: two siblings on separate
    // Sogverse accounts may share one Roblox account, exactly as they may share
    // a Minecraft one. There is no conflict path here to exercise.
    mockAuthenticated("gedu-123", "gedu");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(999));
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ robloxUsername: "builderman" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.roblox_user_id).toBe(999);
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gedu-123",
        roblox_username: "builderman",
        roblox_user_id: 999,
      },
      { onConflict: "user_id" },
    );
  });

  it("never reads the target row from the request body", async () => {
    // The row key is the session's user id. A body naming somebody else changes
    // nothing — and if it ever did, the self-write RLS policies would refuse it.
    mockAuthenticated("gamer-123");
    mockLookupRobloxProfile.mockResolvedValue(robloxProfile(156));
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman", user_id: "someone-else" }),
    );

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "gamer-123" }),
      { onConflict: "user_id" },
    );
  });
});
