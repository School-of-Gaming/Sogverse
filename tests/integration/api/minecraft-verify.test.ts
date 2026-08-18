import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/minecraft/verify/route";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

// --- Mocks ---
// The route is public (no requireRole) — it's a read-only passthrough to Mojang
// used by the public /register-gedu page, so only the Mojang lookup is mocked.

const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
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

  // **The decision, on the read path: Mojang is asked about every name.** A
  // two-character handle was a 400 here once, and Mojang has issued them — so the
  // route refused a real account on Mojang's behalf and got it wrong.
  it("asks Mojang about a name our old format rule called impossible", async () => {
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await GET(createRequest("ab"));

    expect(response.status).toBe(404);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("ab");
  });

  // The one refusal left: a bound on our own request, not a claim about names.
  it("should return 400 for a username past the length bound", async () => {
    const response = await GET(
      createRequest("a".repeat(GAME_USERNAME_MAX_LENGTH + 1)),
    );

    expect(response.status).toBe(400);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  // Nothing to ask about — a read has no field to clear, so an empty query is a
  // question with nothing in it.
  it("should return 400 for a blank username", async () => {
    const response = await GET(createRequest("   "));

    expect(response.status).toBe(400);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
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
