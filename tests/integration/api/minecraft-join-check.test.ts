import { describe, it, expect, vi, beforeEach } from "vitest";
import { type SessionWindow } from "@/lib/session-schedule";

// --- Mocks ---

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

const mockComputeSessionWindow = vi.fn();
const mockIsEnrolledForSession = vi.fn();
vi.mock("@/lib/session-schedule", () => ({
  computeSessionWindow: (...args: unknown[]) => mockComputeSessionWindow(...args),
  isEnrolledForSession: (...args: unknown[]) => mockIsEnrolledForSession(...args),
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
  if (apiKey !== null) {
    headers["Authorization"] = apiKey ?? `Bearer ${API_KEY}`;
  }
  return new Request(url, { method: "GET", headers });
}

function makeSessionWindow(isOpen: boolean): SessionWindow {
  const now = new Date();
  return {
    isOpen,
    nextSessionStart: new Date(now.getTime() - 10 * 60_000),
    windowOpensAt: new Date(now.getTime() - 15 * 60_000),
    windowClosesAt: new Date(now.getTime() + 45 * 60_000),
  };
}

const SCHEDULE = {
  name: "Intro to Redstone",
  day_of_week: 3,
  start_time: "14:00",
  timezone: "America/New_York",
  duration_minutes: 60,
};

function mockPlayerLookup(profile: { id: string; display_name: string; role: string } | null) {
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
    return mockAdminFrom(table);
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
    return mockAdminFrom(table);
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

  // --- Gedu ---

  describe("gedu", () => {
    const geduProfile = { id: "gedu-1", display_name: "GeduSteve", role: "gedu" };

    it("allowed when assigned to group with active session", async () => {
      // Step 1: player lookup returns gedu
      // Step 2: product_groups query returns a group
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "minecraft_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: geduProfile.id, profiles: geduProfile },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "product_groups") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "group-1", products: SCHEDULE }],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      mockComputeSessionWindow.mockReturnValue(makeSessionWindow(true));

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
      expect(data.role).toBe("gedu");
      expect(data.displayName).toBe("GeduSteve");
      expect(data.endTime).toBeDefined();
      expect(data.reason).toBe("Intro to Redstone with GeduSteve");
    });

    it("denied when no groups assigned", async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "minecraft_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: geduProfile.id, profiles: geduProfile },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "product_groups") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      });

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
      expect(data.reason).toBe("No active session");
    });

    it("denied when session is not open", async () => {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "minecraft_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: geduProfile.id, profiles: geduProfile },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "product_groups") {
          return {
            select: () => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "group-1", products: SCHEDULE }],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      mockComputeSessionWindow.mockReturnValue(makeSessionWindow(false));

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
      expect(data.reason).toBe("No active session");
    });
  });

  // --- Gamer ---

  describe("gamer", () => {
    const gamerProfile = { id: "gamer-1", display_name: "CoolKid", role: "gamer" };

    function mockGamerWithEnrollments(
      enrollments: Array<{
        created_at: string;
        product_groups: {
          gedu_id: string;
          products: typeof SCHEDULE;
          profiles: { display_name: string };
        } | null;
      }>,
    ) {
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "minecraft_accounts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { user_id: gamerProfile.id, profiles: gamerProfile },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "group_enrollments") {
          return {
            select: () => ({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: enrollments,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });
    }

    it("allowed when enrolled with active session", async () => {
      mockGamerWithEnrollments([
        {
          created_at: "2025-01-01T00:00:00Z",
          product_groups: {
            gedu_id: "gedu-1",
            products: SCHEDULE,
            profiles: { display_name: "GeduSteve" },
          },
        },
      ]);
      mockComputeSessionWindow.mockReturnValue(makeSessionWindow(true));
      mockIsEnrolledForSession.mockReturnValue(true);

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
      expect(data.role).toBe("gamer");
      expect(data.displayName).toBe("CoolKid");
      expect(data.endTime).toBeDefined();
      expect(data.reason).toBe("Intro to Redstone with GeduSteve");
    });

    it("denied when no active enrollments", async () => {
      mockGamerWithEnrollments([]);

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
      expect(data.reason).toBe("No active session");
    });

    it("denied when session is not open", async () => {
      mockGamerWithEnrollments([
        {
          created_at: "2025-01-01T00:00:00Z",
          product_groups: {
            gedu_id: "gedu-1",
            products: SCHEDULE,
            profiles: { display_name: "GeduSteve" },
          },
        },
      ]);
      mockComputeSessionWindow.mockReturnValue(makeSessionWindow(false));

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
      expect(data.reason).toBe("No active session");
    });

    it("skips enrollment where gamer enrolled after session started", async () => {
      mockGamerWithEnrollments([
        {
          created_at: "2025-06-01T00:00:00Z",
          product_groups: {
            gedu_id: "gedu-1",
            products: SCHEDULE,
            profiles: { display_name: "GeduSteve" },
          },
        },
      ]);
      mockComputeSessionWindow.mockReturnValue(makeSessionWindow(true));
      mockIsEnrolledForSession.mockReturnValue(false);

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(false);
      expect(data.reason).toBe("No active session");
    });

    it("uses first active session from multiple groups", async () => {
      const SCHEDULE_2 = { ...SCHEDULE, name: "Advanced Building" };
      mockGamerWithEnrollments([
        {
          created_at: "2025-01-01T00:00:00Z",
          product_groups: {
            gedu_id: "gedu-1",
            products: SCHEDULE,
            profiles: { display_name: "GeduSteve" },
          },
        },
        {
          created_at: "2025-01-01T00:00:00Z",
          product_groups: {
            gedu_id: "gedu-2",
            products: SCHEDULE_2,
            profiles: { display_name: "GeduAlex" },
          },
        },
      ]);
      // First group: not open. Second group: open.
      mockComputeSessionWindow
        .mockReturnValueOnce(makeSessionWindow(false))
        .mockReturnValueOnce(makeSessionWindow(true));
      mockIsEnrolledForSession.mockReturnValue(true);

      const response = await GET(createRequest(MC_UUID_DASHED));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.allowed).toBe(true);
      expect(data.reason).toBe("Advanced Building with GeduAlex");
    });
  });

  // --- Error handling ---

  it("returns 500 on DB error during player lookup", async () => {
    mockPlayerLookupError();
    const response = await GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(500);
  });
});
