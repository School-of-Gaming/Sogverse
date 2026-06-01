import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

// Import after mocks
import { GET } from "@/app/api/minecraft/join-check/route";

// --- Constants ---

const API_KEY = "test-api-key-32chars-minimum-here";
const MC_UUID_DASHED = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
const MC_UUID_UNDASHED = "069a79f444e94726a5befca90e38aaf5";

// --- Helpers ---

function createRequest(uuid?: string, apiKey?: string | null): Request {
  const url = uuid
    ? `http://localhost:3000/api/minecraft/join-check?uuid=${uuid}`
    : "http://localhost:3000/api/minecraft/join-check";
  const headers: Record<string, string> = {};
  // eslint-disable-next-line security/detect-possible-timing-attacks -- test helper, not an auth comparison; `apiKey !== null` just distinguishes "omit header" (null) from "use this value" (string)
  if (apiKey !== null) {
    headers["Authorization"] = apiKey ?? `Bearer ${API_KEY}`;
  }
  return new Request(url, { method: "GET", headers });
}

function mockPlayerLookup(profile: { id: string; first_name: string; role: string } | null) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "minecraft_accounts") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: profile
                ? { user_id: profile.id, profiles: profile }
                : null,
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

function mockPlayerLookupError() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "minecraft_accounts") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "DB connection failed" },
            }),
          }),
        }),
      };
    }
    return {};
  });
}

// --- Tests ---

describe("GET /api/minecraft/join-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", API_KEY);
  });

  // --- Auth ---

  it("returns 401 for missing Authorization header", async () => {
    const response = await GET(createRequest(MC_UUID_DASHED, null));
    expect(response.status).toBe(401);
  });

  it("returns 401 for non-Bearer format", async () => {
    const response = await GET(createRequest(MC_UUID_DASHED, `Basic ${API_KEY}`));
    expect(response.status).toBe(401);
  });

  it("returns 401 for wrong API key", async () => {
    const response = await GET(createRequest(MC_UUID_DASHED, "Bearer wrong-key"));
    expect(response.status).toBe(401);
  });

  it("returns 500 when MINECRAFT_SERVER_API_KEY is not set", async () => {
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", "");
    const response = await GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Server misconfigured");
  });

  // --- Validation ---

  it("returns 400 for missing uuid param", async () => {
    const response = await GET(createRequest(undefined));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("uuid");
  });

  it("returns 400 for malformed uuid", async () => {
    const response = await GET(createRequest("not-a-uuid"));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid");
  });

  // --- Lookup ---

  it("returns 404 for unknown UUID", async () => {
    mockPlayerLookup(null);
    const response = await GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(404);
  });

  it("normalizes undashed UUID before query", async () => {
    mockPlayerLookup(null);
    const response = await GET(createRequest(MC_UUID_UNDASHED));
    expect(response.status).toBe(404);
    // The mock chain verifies it reached the DB — the normalization
    // happens in normalizeMcUuid before the query.
    expect(mockAdminFrom).toHaveBeenCalledWith("minecraft_accounts");
  });

  // --- Session access: pending migration to the current product system ---
  //
  // The gedu/gamer session-gating queried the dropped v1 product/group/
  // enrollment tables. Until it's rebuilt against participations /
  // product_groups, those roles get a 501. See the route for the spec.

  it("returns 501 for a gedu (session access not yet implemented)", async () => {
    mockPlayerLookup({ id: "gedu-1", first_name: "GeduSteve", role: "gedu" });
    const response = await GET(createRequest(MC_UUID_DASHED));
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.role).toBe("gedu");
    expect(data.firstName).toBe("GeduSteve");
    expect(data.error).toMatch(/pending migration/i);
  });

  it("returns 501 for a gamer (session access not yet implemented)", async () => {
    mockPlayerLookup({ id: "gamer-1", first_name: "CoolKid", role: "gamer" });
    const response = await GET(createRequest(MC_UUID_DASHED));
    const data = await response.json();

    expect(response.status).toBe(501);
    expect(data.role).toBe("gamer");
    expect(data.firstName).toBe("CoolKid");
    expect(data.error).toMatch(/pending migration/i);
  });

  it("returns allowed=false for non-session roles (admin/customer)", async () => {
    mockPlayerLookup({ id: "cust-1", first_name: "Parent", role: "customer" });
    const response = await GET(createRequest(MC_UUID_DASHED));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.allowed).toBe(false);
    expect(data.reason).toBe("No active session");
  });

  // --- Error handling ---

  it("returns 500 on DB error during player lookup", async () => {
    mockPlayerLookupError();
    const response = await GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(500);
  });
});
