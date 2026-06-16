import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/voice/token/locked/route";
import { mockSupabaseSuccess } from "../../mocks/supabase";

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
const ZONE_ID = "99999999-8888-7777-6666-555555555555";
const WINDOW_OPENS_AT = new Date("2026-06-16T10:55:00.000Z");

function lockedRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/voice/token/locked", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authAs(userId: string, profile: { role: string; first_name: string }) {
  if (profile.role === "customer") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "You do not have permission to join voice rooms" },
        { status: 403 },
      ),
    );
    return;
  }
  mockRequireRole.mockResolvedValue({ user: { id: userId }, profile, supabase: {} });
}

function mockTables(opts: {
  group?: { is_remote?: boolean } | null;
  zone?: { id: string } | null;
  placement?: { zone_id: string; session_opens_at: string } | null;
  geduAssignment?: { group_id: string } | null;
}) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "product_groups") {
      const row =
        opts.group === null
          ? null
          : {
              id: GROUP_ID,
              product_id: PRODUCT_ID,
              product: {
                id: PRODUCT_ID,
                timezone: "Europe/Helsinki",
                is_remote: opts.group?.is_remote ?? true,
                slots: [{ weekday: 1, start_time: "14:00", duration_minutes: 60 }],
              },
            };
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess(row)),
          }),
        }),
      };
    }
    if (table === "voice_zones") {
      const row = opts.zone === undefined ? { id: ZONE_ID } : opts.zone;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess(row)),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "voice_locked_placements") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue(mockSupabaseSuccess(opts.placement ?? null)),
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
            maybeSingle: vi.fn().mockResolvedValue(mockSupabaseSuccess(null)),
          }),
        }),
      };
    }
    return {};
  });
}

// --- Tests ---

describe("POST /api/voice/token/locked", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = "testdomain";
    mockCreateMeetingToken.mockResolvedValue("mock-daily-token");
    mockGetOrCreateDailyRoom.mockResolvedValue({
      id: "room-id",
      name: "locked-room",
      url: "https://testdomain.daily.co/locked-room",
      privacy: "private",
      created_at: new Date().toISOString(),
    });
    mockComputeSessionWindow.mockReturnValue({
      isOpen: true,
      nextSessionStart: WINDOW_OPENS_AT,
      windowOpensAt: WINDOW_OPENS_AT,
      windowClosesAt: new Date(Date.now() + 3600_000),
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DAILY_DOMAIN = originalEnv;
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for customer role", async () => {
    authAs("customer-id", { role: "customer", first_name: "Parent" });
    const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when zoneId is missing", async () => {
    authAs("gedu-id", { role: "gedu", first_name: "Edu" });
    const res = await POST(lockedRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the locked zone does not exist (or isn't locked)", async () => {
    authAs("admin-id", { role: "admin", first_name: "Boss" });
    mockTables({ zone: null });
    const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when no session window is open", async () => {
    authAs("admin-id", { role: "admin", first_name: "Boss" });
    mockTables({});
    mockComputeSessionWindow.mockReturnValue({
      isOpen: false,
      nextSessionStart: new Date(Date.now() + 86400_000),
      windowOpensAt: new Date(Date.now() + 86100_000),
      windowClosesAt: new Date(Date.now() + 90000_000),
    });
    const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
    expect(res.status).toBe(403);
  });

  describe("locked gate", () => {
    it("refuses a gamer with no placement row", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({ placement: null });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toBe("You are not placed in this zone");
    });

    it("refuses a gamer whose placement is for a different zone", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        placement: {
          zone_id: "00000000-0000-0000-0000-000000000000",
          session_opens_at: WINDOW_OPENS_AT.toISOString(),
        },
      });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(403);
    });

    it("refuses a gamer whose placement is from a prior session window", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        placement: {
          zone_id: ZONE_ID,
          session_opens_at: "2026-06-09T10:55:00.000Z", // last week
        },
      });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(403);
    });

    it("grants a gamer with a matching placement (non-owner token)", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        placement: {
          zone_id: ZONE_ID,
          session_opens_at: WINDOW_OPENS_AT.toISOString(),
        },
      });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: false }),
      );
    });

    it("always grants an assigned gedu (moderator bypass, owner token)", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({ geduAssignment: { group_id: GROUP_ID } });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true }),
      );
    });

    it("refuses a gedu not assigned to the product", async () => {
      authAs("gedu-id", { role: "gedu", first_name: "Edu" });
      mockTables({ geduAssignment: null });
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(403);
    });

    it("admin passes through without a placement", async () => {
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({});
      const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
      expect(res.status).toBe(200);
    });
  });

  it("requests the locked room name (group room + -z-{zoneId})", async () => {
    authAs("admin-id", { role: "admin", first_name: "Boss" });
    mockTables({});
    const res = await POST(lockedRequest({ groupId: GROUP_ID, zoneId: ZONE_ID }));
    expect(res.status).toBe(200);
    expect(mockGetOrCreateDailyRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(
          new RegExp(`^g-${GROUP_ID}-\\d{12}-z-${ZONE_ID}$`),
        ),
      }),
    );
  });
});
