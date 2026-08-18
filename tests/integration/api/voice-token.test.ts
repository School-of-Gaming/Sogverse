import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/voice/token/route";
import { DailyApiError } from "@/lib/daily";
import { mockSupabaseSuccess } from "../../mocks/supabase";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import type { ProductTopic } from "@/types";

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

// Inspectable spies for the self-healing prune chain
// (voice_private_zone_occupants.delete().eq().lt()).
const placementLt = vi.fn();
const placementEq = vi.fn();
const placementDelete = vi.fn();

// Spies for the occupancy read that bakes canReceive
// (voice_private_zone_occupants.select().eq().eq()).
const occupantEq2 = vi.fn();
const occupantEq1 = vi.fn();
const occupantSelect = vi.fn();

// Which game-account table the route actually touched on a join. A topic about
// no single game account must read *neither* — "no row found" and "never asked"
// produce the same empty identity, and only this can tell them apart.
const gameAccountReads: string[] = [];

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
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile,
    supabase: {},
  });
}

/**
 * Build the `from(...)` router used by the route. Three tables in order:
 * `product_groups`, `participations` (seat-holders — gamer or customer), and
 * `gedu_group_assignments` (gedu-only) — the mock dispatches by table
 * name and returns the matching thenable shape.
 */
function mockTables(opts: {
  group: {
    timezone?: string;
    is_remote?: boolean;
    /** Drives which game identity (if any) the token carries. Defaults to the
     *  Minecraft Java topic, which is what most remote clubs are. */
    topic?: ProductTopic;
    slots?: Array<{ weekday: number; start_time: string; duration_minutes: number }>;
  } | null;
  participation?: { id: string } | null;
  geduAssignment?: { group_id: string } | null;
  minecraftAccount?: { minecraft_username: string | null; minecraft_uuid: string | null } | null;
  robloxAccount?: { roblox_username: string | null; roblox_user_id: number | null } | null;
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
              topic: opts.group.topic ?? "minecraft_java",
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
      gameAccountReads.push(table);
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
    if (table === "roblox_accounts") {
      gameAccountReads.push(table);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue(mockSupabaseSuccess(opts.robloxAccount ?? null)),
          }),
        }),
      };
    }
    if (table === "voice_private_zone_occupants") {
      // Two uses on join: the self-healing prune (delete().eq().lt()) and the
      // current-window occupancy read that bakes canReceive (select().eq().eq()).
      return { delete: placementDelete, select: occupantSelect };
    }
    return {};
  });
}

// --- Tests ---

describe("POST /api/voice/token", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DAILY_DOMAIN;

  beforeEach(() => {
    vi.clearAllMocks();
    gameAccountReads.length = 0;
    // Rebuild the prune chain each test (clearAllMocks wipes return values).
    placementLt.mockResolvedValue({ error: null });
    placementEq.mockReturnValue({ lt: placementLt });
    placementDelete.mockReturnValue({ eq: placementEq });
    // Occupancy read defaults to empty (no private occupants → no canReceive).
    occupantEq2.mockResolvedValue({ data: [], error: null });
    occupantEq1.mockReturnValue({ eq: occupantEq2 });
    occupantSelect.mockReturnValue({ eq: occupantEq1 });
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

  it("returns 403 when the role gate refuses (e.g. a PIN-locked parent)", async () => {
    // Customers are admitted to this route, but `requireRole` still applies the
    // parent-PIN gate to them. A locked parent session never reaches the
    // handler — pinned here so the PIN interaction isn't lost when someone
    // reads the roles list and assumes every customer gets in.
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "PIN verification required", code: "PIN_REQUIRED" },
        { status: 403 },
      ),
    );
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

    it("rejects a customer with no seat of their own on the group", async () => {
      // A parent whose *child* holds the seat lands here too: the child's row
      // is keyed to the child's id, so the participant-keyed query finds
      // nothing for the parent and the room is refused. Their route to the
      // child's room is the switch-to-gamer flow, not this one.
      authAs("customer-id", { role: "customer", first_name: "Parent" });
      mockTables({ group: {}, participation: null });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toBe("You are not enrolled in this group");
    });

    it("admits a customer holding their own active seat, on the same participant-keyed query", async () => {
      authAs("customer-id", { role: "customer", first_name: "Parent" });
      mockTables({ group: {}, participation: { id: "participation-1" } });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      // The query is keyed on the caller's own id — a parent can only ever
      // satisfy it with a seat they occupy themselves.
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "customer-id" }),
      );
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
          // Daily `user_id` = our profile id, so peers' `participant.user_id`
          // matches what `canReceive.byUserId` keys on.
          userId: "gamer-id",
          // No private-zone occupants → no receive block baked.
          canReceive: undefined,
          // A Minecraft topic with no linked account → the platform slot is
          // present and the identity slots are empty, which the client renders
          // as the "(Unknown)" row.
          userName: "gamer-id|gamer|Kid|minecraft||",
        }),
      );
    });

    it("bakes a canReceive block for a private-zone occupant the joiner isn't with", async () => {
      // The privacy boundary baked at join time: a joiner who isn't in a private
      // zone must not be sent its occupants' media, enforced by the SFU before
      // they connect (no leak window). One occupant, in a zone the joiner isn't
      // in → the joiner's token blocks receiving that occupant.
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({ group: {}, participation: { id: "participation-1" } });
      occupantEq2.mockResolvedValue({
        data: [{ user_id: "confined-gamer", zone_id: "zone-private" }],
        error: null,
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "gamer-id",
          canReceive: { base: true, byUserId: { "confined-gamer": false } },
        }),
      );
    });

    it("bakes no block for the occupant themselves (they receive their zone-mates)", async () => {
      // The placed gamer's own token: they're co-zoned with themselves, so the
      // projection blocks nobody — base true, no byUserId entries → undefined.
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({ group: {}, participation: { id: "participation-1" } });
      occupantEq2.mockResolvedValue({
        data: [{ user_id: "gamer-id", zone_id: "zone-private" }],
        error: null,
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ canReceive: undefined }),
      );
    });

    // Which identity a room carries is the *product's* decision, not the
    // joiner's: the topic picks the platform, the platform picks the table, and
    // a topic about no single game account reads nothing at all. Three topics,
    // three outcomes — the whole of the branch.
    it("embeds the joiner's Minecraft username + uuid on a Minecraft topic", async () => {
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: { topic: "minecraft_java" },
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
          userName: "gamer-id|gamer|Kid|minecraft|Steve123|abc-uuid",
        }),
      );
      expect(gameAccountReads).toEqual(["minecraft_accounts"]);
    });

    it("embeds the joiner's Roblox handle + numeric id on a Roblox topic", async () => {
      // The account key crosses as text either way — a Mojang UUID already is
      // one, a Roblox int64 goes over as its decimal string and the client
      // parses it back to a number.
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: { topic: "roblox_studio" },
        participation: { id: "participation-1" },
        robloxAccount: {
          roblox_username: "BuilderKid",
          roblox_user_id: 1583920471,
        },
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userName: "gamer-id|gamer|Kid|roblox|BuilderKid|1583920471",
        }),
      );
      expect(gameAccountReads).toEqual(["roblox_accounts"]);
    });

    it("mints no game slots — and reads no account table — on a topic about no game account", async () => {
      // An Esports club is about whichever game the product is about, so there
      // is no single handle to show. The token is the same 3-slot shape an
      // instant room mints, and the row hides its identity slot entirely rather
      // than showing "(Unknown)" for an account nobody was ever asked for.
      authAs("gamer-id", { role: "gamer", first_name: "Kid" });
      mockTables({
        group: { topic: "esports" },
        participation: { id: "participation-1" },
        minecraftAccount: {
          minecraft_username: "Steve123",
          minecraft_uuid: "abc-uuid",
        },
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ userName: "gamer-id|gamer|Kid" }),
      );
      expect(gameAccountReads).toEqual([]);
    });

    it("self-heals: prunes the group's prior-session private-zone occupancy on join", async () => {
      // The non-obvious cleanup path — easy to drop in a refactor. Joining must
      // delete this group's occupancy from windows before the current one, so
      // stale rows can't block re-occupying or over-block a returning user's
      // joiners (and a user who never left is reaped on the next join).
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({ group: {} });
      const windowOpensAt = new Date(Date.now() - 300_000);
      mockComputeSessionWindow.mockReturnValue({
        isOpen: true,
        nextSessionStart: new Date(Date.now() - 60_000),
        windowOpensAt,
        windowClosesAt: new Date(Date.now() + 3600_000),
      });

      const res = await POST(tokenRequest({ groupId: GROUP_ID }));

      expect(res.status).toBe(200);
      expect(placementDelete).toHaveBeenCalled();
      expect(placementEq).toHaveBeenCalledWith("group_id", GROUP_ID);
      // Strictly older than the current window — current-session rows survive.
      expect(placementLt).toHaveBeenCalledWith(
        "session_opens_at",
        windowOpensAt.toISOString(),
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

    it("mints an owner token for an admin", async () => {
      authAs("admin-id", { role: "admin", first_name: "Boss" });
      mockTables({ group: {} });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      expect(res.status).toBe(200);
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({ isOwner: true }),
      );
    });

    it("mints a NON-owner token for a customer, and carries `customer` in the role slot", async () => {
      // The security half of admitting customers. `isOwner` is a positive
      // gedu/admin allow-list, not "role !== gamer" — and because the Daily
      // helper feeds that one flag to both `is_owner` and `enable_screenshare`,
      // false here is also what withholds screen share (see the daily.ts unit
      // test that pins the doubling over the real request body).
      authAs("customer-id", { role: "customer", first_name: "Parent" });
      mockTables({ group: {}, participation: { id: "participation-1" } });
      const res = await POST(tokenRequest({ groupId: GROUP_ID }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.role).toBe("customer");
      expect(mockCreateMeetingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
          userName: "customer-id|customer|Parent|minecraft||",
        }),
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
