import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/gamer/minecraft/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockLookupMinecraftUser = vi.fn();
const mockIsValidMinecraftUsername = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  isValidMinecraftUsername: (...args: unknown[]) =>
    mockIsValidMinecraftUsername(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/gamer/minecraft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId = "gamer-123") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role: "gamer" },
    supabase: {},
  });
}

function mockUpdateSuccess() {
  const eqMock = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  mockAdminFrom.mockReturnValue({ update: updateMock });
  return { updateMock, eqMock };
}

// --- Tests ---

describe("PATCH /api/gamer/minecraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsValidMinecraftUsername.mockImplementation(
      (u: string) => /^[a-zA-Z0-9_]{3,16}$/.test(u),
    );
  });

  it("should return 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-gamer roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only gamers can update their Minecraft username" },
        { status: 403 },
      ),
    );

    const response = await PATCH(createRequest({ minecraftUsername: "Notch" }));
    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("gamer", expect.any(Object));
  });

  it("should return 400 for invalid minecraft username", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ minecraftUsername: "ab" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid Minecraft username");
  });

  it("should set username and resolve UUID when Mojang finds account", async () => {
    mockAuthenticated("gamer-123");
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    const { updateMock, eqMock } = mockUpdateSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: "notch" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.minecraft_username).toBe("notch");
    expect(data.minecraft_uuid).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
    expect(updateMock).toHaveBeenCalledWith({
      minecraft_username: "notch",
      minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    expect(eqMock).toHaveBeenCalledWith("user_id", "gamer-123");
  });

  it("should set username with null UUID when Mojang finds no account", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue(null);
    mockUpdateSuccess();

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
    const { updateMock } = mockUpdateSuccess();

    const response = await PATCH(createRequest({ minecraftUsername: null }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.minecraft_username).toBeNull();
    expect(data.minecraft_uuid).toBeNull();
    expect(updateMock).toHaveBeenCalledWith({
      minecraft_username: null,
      minecraft_uuid: null,
    });
    // Should NOT call Mojang API when clearing
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });
});
