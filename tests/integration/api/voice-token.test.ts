import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/voice/token/route";
import { DailyApiError } from "@/lib/daily";
import { mockSupabaseSuccess } from "../../mocks/supabase";
import { VOICE_CONFIG } from "@/lib/constants/voice";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

const mockCreateMeetingToken = vi.fn();
const mockGetOrCreateDailyRoom = vi.fn();
vi.mock("@/lib/daily", async () => {
  const actual = await vi.importActual<typeof import("@/lib/daily")>("@/lib/daily");
  return {
    ...actual,
    createMeetingToken: (...args: unknown[]) => mockCreateMeetingToken(...args),
    getOrCreateDailyRoom: (...args: unknown[]) => mockGetOrCreateDailyRoom(...args),
  };
});

const mockComputeSessionWindow = vi.fn();
vi.mock("@/lib/session-schedule", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-schedule")>(
    "@/lib/session-schedule",
  );
  return {
    ...actual,
    computeSessionWindow: (...args: unknown[]) => mockComputeSessionWindow(...args),
  };
});

// --- Helpers ---

const GROUP_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PRODUCT_ID = "11111111-2222-3333-4444-555555555555";

function tokenRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authAs(
  userId: string,
  profile: { role: string; first_name: string },
) {
  if (profile.role === "customer") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "You do not have permission to join voice rooms" },
        { status: 403 },
      ),
    );
    return;
  }
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile,
    supabase: {},
  });
}

/**
 * Build the `from(...)` router used by the route. Three tables in order:
 * `product_groups`, `participations` (gamer-only), and
 * `gedu_group_assignments` (gedu-only) — the mock dispatches by table
 * name and returns the matching thenable shape.
 */
function mockTables(opts: {
  group: {
    timezone?: string;
    is_remote?: boolean;
    slots?: Array<{ weekday: number; start_time: string; duration_minutes: number }>;
  } | null;
  participation?: { id: string } | null;
  geduAssignment?: { group_id: string } | null;
  minecraftAccount?: { minecraft_username: string | null; minecraft_uuid: string | null } | null;
}) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "product_groups") {
      const row = opts.group
        ? {
            id: GROUP_ID,
            product_id: PRODUCT_ID,
            product: {
              id: PRODUCT_ID,
              timezone: opts.group.timezone ?? "Europe/Helsinki",
              is_remote: opts.group.is_remote ?? true,
              slots: opts.group.slots ?? [
                { weekday: 1, start_time: "14:00", duration_minutes: 60 },
              ],
            },
          }
        : null;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess(row)),
          }),
        }),
      };
    }
    if (table === "participations") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi
                    .fn()
                    .mockResolvedValue(mockSupabaseSuccess(opts.participation ?? null)),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "gedu_group_assignments") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue(mockSupabaseSuccess(opts.geduAssignment ?? null)),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "minecraft_accounts") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue(mockSupabaseSuccess(opts.minecraftAccount ?? null)),
          }),
        }),
      };
    }
    return {};
  });
}

// --- Tests ---

describe("POST /api/voice/token", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = "testdomain";
    mockCreateMeetingToken.mockResolvedValue("mock-daily-token");
    mockGetOrCreateDailyRoom.mockResolvedValue({
      id: "room-id",
      name: "test-room",
      url: "https://testdomain.daily.co/test-room",
      privacy: "private",
      created_at: new Date().toISOString(),
    });
    // Default window: open right now, closes in an hour.
    const nextStart = new Date(Date.now() - 60_000);
    mockComputeSessionWindow.mockReturnValue({
      isOpen: true,
      nextSessionStart: nextStart,
      windowOpensAt: new Date(nextStart.getTime() - 300_000),
      windowClosesAt: new Date(nextStart.getTime() + 3600_000),
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(tokenRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for customer role", async () => {
    authAs("customer-id", { role: "customer", first_name: "Parent" });
    const res = await POST(tokenRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when groupId is missing", async () => {
    authAs("gedu-id", { role: "gedu", first_name: "Edu" });
    const res = await POST(tokenRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the group does not exist", async () => {
    authAs("gedu-id", { role: "gedu", first_name: "Edu" });
    mockTables({ group: null });
    const res = await POST(tokenRequest({ groupId: GROUP_ID }));
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Room not found");
  });

  it("returns 404 when the product is in-person (is_remote = false)", async () => {
    authAs("gedu-id", { role: "gedu", first_name: "Edu" });
    mockTables({ group: { is_remote: false }, geduAssignment: { group_id: GROUP_ID } });
    const res = await POST(tokenRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(404);
  });

  describe("membership gate", () => {
    it("rejects a gamer with no active participation", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({ group: {}, participation: null });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toBe("You are not enrolled in this group");
    });

    it("rejects a gedu not assigned to the product", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({ group: {}, geduAssignment: null });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toBe("You are not assigned to this group");
    });

    it("admin bypasses the membership check", async () => {
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({ group: {} });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
    });

    it("allows an active participant regardless of how recently they signed up", async () => {
      // v2 dropped the v1 mid-session enrollment gate — active membership
      // is the binary access predicate, so a gamer who joined 30s ago
      // gets in just like one who joined a week ago.
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: {},
        participation: { id: "participation-1" },
      });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
    });
  });

  describe("session window gate", () => {
    it("rejects when no slot has an open window", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({ group: {}, geduAssignment: { group_id: GROUP_ID } });
      mockComputeSessionWindow.mockReturnValue({
        isOpen: false,
        nextSessionStart: new Date(Date.now() + 86400_000),
        windowOpensAt: new Date(Date.now() + 86100_000),
        windowClosesAt: new Date(Date.now() + 90000_000),
      });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toBe("Room is not open yet");
    });

    it("picks the first slot whose window is open when multiple slots exist", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({
        group: {
          slots: [
            { weekday: 1, start_time: "23:00", duration_minutes: 60 }, // Mon 11pm
            { weekday: 2, start_time: "05:00", duration_minutes: 60 }, // Tue 5am
          ],
        },
        geduAssignment: { group_id: GROUP_ID },
      });
      const closedWindow = {
        isOpen: false,
        nextSessionStart: new Date(Date.now() + 86400_000),
        windowOpensAt: new Date(Date.now() + 86100_000),
        windowClosesAt: new Date(Date.now() + 90000_000),
      };
      const openWindow = {
        isOpen: true,
        nextSessionStart: new Date(Date.now() - 60_000),
        windowOpensAt: new Date(Date.now() - 300_000),
        windowClosesAt: new Date(Date.now() + 3600_000),
      };
      mockComputeSessionWindow
        .mockReturnValueOnce(closedWindow)
        .mockReturnValueOnce(openWindow);
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
    });
  });

  describe("happy path + Daily mechanics", () => {
    it("requests the deterministic room with exp = windowClosesAt + grace, then mints a gamer non-owner token", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: {},
        participation: { id: "participation-1" },
      });
      const windowClosesAt = new Date(Date.now() + 3600_000);
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: new Date(Date.now() - 60_000),
        windowOpensAt: new Date(Date.now() - 300_000),
        windowClosesAt,
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.role).toBe("gamer");
      expect(data.token).toBe("mock-daily-token");

      const expectedExp =
        Math.round(windowClosesAt.getTime() / 1000) +
        VOICE_CONFIG.TOKEN_EXPIRY_GRACE_SECONDS;

      expect(mockGetOrCreateDailyRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(
            /^g-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-\d{12}$/,
          ),
          expUnix: expectedExp,
        }),
      );
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
          expUnix: expectedExp,
          // No Minecraft account → empty trailing slots, which the client
          // renders as the "(Unknown)" badge.
          userName: "gamer-id|gamer|Kid||",
        }),
      );
    });

    it("embeds the joiner's Minecraft username + uuid in the token user_name", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: {},
        participation: { id: "participation-1" },
        minecraftAccount: {
          minecraft_username: "Steve123",
          minecraft_uuid: "abc-uuid",
        },
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: "gamer-id|gamer|Kid|Steve123|abc-uuid",
        }),
      );
    });

    it("mints an owner token for an assigned gedu", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({
        group: {},
        geduAssignment: { group_id: GROUP_ID },
      });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true }),
      );
    });

    it("returns 500 when Daily fails (errors are not swallowed at the route)", async () => {
      // The duplicate-name race is handled inside getOrCreateDailyRoom and
      // never surfaces here. Any error that does escape the helper is a
      // real Daily failure (outage, auth error) — bubble it as a 500.
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({ group: {} });
      mockGetOrCreateDailyRoom.mockRejectedValue(
        new DailyApiError(500, "Daily down"),
      );

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(500);
    });
  });

  describe("response shape", () => {
    it("returns {token, roomUrl, role}", async () => {
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({ group: {} });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(data).toEqual(
        expect.objectContaining({
          token: "mock-daily-token",
          roomUrl: expect.stringContaining(
            "testdomain.daily.co/g-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-",
          ),
          role: "admin",
        }),
      );
    });
  });
});
