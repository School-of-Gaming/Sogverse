import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/minecraft/account/route";
import { NextResponse } from "next/server";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// Only the network hop is replaced. There is nothing else in this module the
// route's body schema depends on any more: the wire rule is a trim and a length
// bound, and Mojang alone decides whether a name resolves.
const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
}));

// The upsert runs on the USER-bound client: the caller may write exactly their
// own minecraft_accounts row, and the row key comes from the session rather than
// the request body. The mock therefore hangs off `supabase`.
const mockFrom = vi.fn();

// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/minecraft/account", {
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

// --- Tests ---

describe("PATCH /api/minecraft/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-gamer/gedu roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only gamers and gedus can update their Minecraft username" },
        { status: 403 },
      ),
    );

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith(["gamer", "gedu"], expect.any(Object));
  });

  it("should accept gamer role", async () => {
    mockAuthenticated("gamer-123", "gamer");
    mockLookupMinecraftUser.mockResolvedValue({ username: "Notch", uuid: "uuid-1" });
    mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(200);
  });

  it("should accept gedu role", async () => {
    mockAuthenticated("gedu-123", "gedu");
    mockLookupMinecraftUser.mockResolvedValue({ username: "Notch", uuid: "uuid-1" });
    mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(200);
  });

  /**
   * **The decision, on the wire: we do not judge the shape of a Minecraft name.**
   * A two-character handle was a 400 here once, and Mojang has issued them — so
   * the refusal was ours and it was wrong. Now it travels, Mojang is asked, and
   * a miss is an unverified account rather than an error.
   */
  it("accepts a name our old format rule called impossible and asks Mojang about it", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue(null);
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "ab" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("ab");
    expect(data.minecraft_username).toBe("ab");
    expect(data.minecraft_uuid).toBeNull();
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        minecraft_username: "ab",
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
  });

  // The one refusal left, and it is about our own request rather than about
  // names: an unbounded string must not reach Mojang, a URL, or a text column.
  it("should return 400 for a username past the length bound", async () => {
    mockAuthenticated();

    const response = await PATCH(
      createRequest({
        minecraftUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  // The row already trims before it commits, so this is the wire agreeing with
  // it rather than a second rule: whitespace around a name is not part of it.
  it("trims the name before looking it up or storing it", async () => {
    mockAuthenticated("gamer-123");
    mockLookupMinecraftUser.mockResolvedValue(null);
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "  Notch  " }));

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("Notch");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ minecraft_username: "Notch" }),
      { onConflict: "user_id" },
    );
  });

  // A field cleared to whitespace is a clear, exactly as an explicit null is —
  // the two spellings of "there is no name here" must not diverge.
  it("treats a trimmed-empty name as a clear", async () => {
    mockAuthenticated();
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "   " }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minecraft_username).toBeNull();
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        minecraft_username: null,
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  it("should upsert username and resolve UUID when Mojang finds account", async () => {
    mockAuthenticated("gamer-123");
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "notch" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.minecraft_username).toBe("notch");
    expect(data.minecraft_uuid).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        minecraft_username: "notch",
        minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      },
      { onConflict: "user_id" },
    );
  });

  it("should upsert username with null UUID when Mojang finds no account", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue(null);
    mockUpsertSuccess();

    const response = await PATCH(
      createRequest({ minecraftUsername: "unknown_player" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minecraft_username).toBe("unknown_player");
    expect(data.minecraft_uuid).toBeNull();
  });

  it("should clear both columns when minecraftUsername is null", async () => {
    mockAuthenticated();
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: null }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minecraft_username).toBeNull();
    expect(data.minecraft_uuid).toBeNull();
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gamer-123",
        minecraft_username: null,
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
    // Should NOT call Mojang API when clearing
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  // -- Sharing a Minecraft account with another Sogverse user --

  it("should link a Minecraft account another user already holds", async () => {
    // The minecraft_uuid UNIQUE is gone, so the same resolved uuid on a second
    // account is an ordinary write with no conflict path of its own.
    mockAuthenticated("gedu-123", "gedu");
    mockLookupMinecraftUser.mockResolvedValue({
      username: "SharedPlayer",
      uuid: "shared-uuid",
    });
    const { upsertMock } = mockUpsertSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "SharedPlayer" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minecraft_uuid).toBe("shared-uuid");
    expect(upsertMock).toHaveBeenCalledWith(
      {
        user_id: "gedu-123",
        minecraft_username: "SharedPlayer",
        minecraft_uuid: "shared-uuid",
      },
      { onConflict: "user_id" },
    );
  });
});
