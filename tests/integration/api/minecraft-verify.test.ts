import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/minecraft/verify/route";

// --- Mocks ---
// The route is public (no requireRole) — it's a read-only passthrough to Mojang
// used by the public /register-gedu page, so only the Mojang lookup is mocked.

const mockLookupMinecraftUser = vi.fn();
const mockIsValidMinecraftUsername = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  isValidMinecraftUsername: (...args: unknown[]) =>
    mockIsValidMinecraftUsername(...args),
}));

// --- Helpers ---

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

  it("works without authentication (public registration uses it)", async () => {
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });

    const response = await GET(createRequest("Notch"));
    expect(response.status).toBe(200);
  });

  it("should return 400 when username is missing", async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("username");
  });

  it("should return 400 for invalid username format", async () => {
    const response = await GET(createRequest("ab")); // too short
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid username");
  });

  it("should return 404 when Mojang finds no account", async () => {
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await GET(createRequest("nonexistent_user"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("No Minecraft account found");
  });

  it("should return username and uuid on success", async () => {
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
