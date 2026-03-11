import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/minecraft/verify/route";
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

// --- Helpers ---

function mockAuthenticated() {
  mockRequireRole.mockResolvedValue({
    user: { id: "user-123" },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(username?: string): Request {
  const url = username
    ? `http://localhost:3000/api/minecraft/verify?username=${encodeURIComponent(username)}`
    : "http://localhost:3000/api/minecraft/verify";
  return new Request(url, { method: "GET" });
}

// --- Tests ---

describe("GET /api/minecraft/verify", () => {
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

    const response = await GET(createRequest("Notch"));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-customer/gamer roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Not authorized" }, { status: 403 }),
    );

    const response = await GET(createRequest("Notch"));
    expect(response.status).toBe(403);
  });

  it("should accept customer and gamer roles", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });

    const response = await GET(createRequest("Notch"));
    expect(response.status).toBe(200);
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["customer", "gamer"],
      expect.any(Object),
    );
  });

  it("should return 400 when username is missing", async () => {
    mockAuthenticated();

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid username");
  });

  it("should return 400 for invalid username format", async () => {
    mockAuthenticated();

    const response = await GET(createRequest("ab")); // too short
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid username");
  });

  it("should return 404 when Mojang finds no account", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await GET(createRequest("nonexistent_user"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("No Minecraft account found");
  });

  it("should return username and uuid on success", async () => {
    mockAuthenticated();
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });

    const response = await GET(createRequest("notch"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.username).toBe("Notch");
    expect(data.uuid).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });
});
