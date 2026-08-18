import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/admin/users/[id]/game-account/route";
import { NextResponse } from "next/server";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import {
  INVISIBLE_ONLY_NAME,
  RIGHT_TO_LEFT_OVERRIDE,
  ZERO_WIDTH_SPACE,
} from "../../helpers/invisible-characters";

/**
 * The admin's edit of somebody else's game username.
 *
 * Two things are worth protecting here beyond the usual four. The first is that
 * the route names a *target* and therefore has to authorize one: an id nobody
 * owns is a 404, and an id belonging to an account that cannot hold a game
 * identity at all is a 400. The second is that the write runs on the user-bound
 * client — the admin RLS policy is what actually permits it — so a test that
 * quietly let a service-role client in would be testing a different route.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mojang")>();
  return {
    ...actual,
    lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  };
});

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

const TARGET = "3f1d0e2a-9c44-4b6e-9a7d-1c2b3d4e5f60";

const mockFrom = vi.fn();

function createRequest(
  userId: string,
  body: Record<string, unknown>,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(
      `http://localhost:3000/api/admin/users/${userId}/game-account`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: userId }) },
  ];
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: { role: "admin" },
    supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  });
}

/** The target-profile read, then the upsert, in that order. */
function mockTarget(role: string | null) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: role === null ? null : { role },
                error: null,
              }),
          }),
        }),
      };
    }
    return { upsert };
  });
  return { upsert };
}

describe("PATCH /api/admin/users/[id]/game-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("returns 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username: "Notch" }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 for every non-admin role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can edit another user's game username" },
        { status: 403 },
      ),
    );

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "roblox", username: "builderman" }),
    );

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("admin", expect.any(Object));
  });

  // -- Input --

  it("returns 400 for an unknown platform", async () => {
    mockAdmin();

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "fortnite", username: "someone" }),
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  /**
   * **The decision, on the admin's edit: neither branch judges the shape of a
   * name.** A handle with two underscores was refused on the Roblox branch here
   * once, on the strength of that platform's current signup validator — a rule
   * younger than the accounts it judges. Both branches now carry the same wire
   * rule (a trim and a length bound), because it is a rule about our request
   * rather than about either platform's names.
   */
  it.each([
    ["minecraft", "minecraft_username", () => mockLookupMinecraftUser],
    ["roblox", "roblox_username", () => mockLookupRobloxProfile],
  ] as const)(
    "sends a %s name our old format rule called impossible to the lookup and stores it",
    async (platform, column, lookup) => {
      mockAdmin();
      mockLookupMinecraftUser.mockResolvedValue(null);
      mockLookupRobloxProfile.mockResolvedValue(null);
      const { upsert } = mockTarget("gamer");

      const response = await PATCH(
        ...createRequest(TARGET, { platform, username: "Old Timer" }),
      );

      expect(response.status).toBe(200);
      // The name reaches the platform verbatim, and the same string is what
      // lands in the row — the two assertions the sibling route suites make, and
      // the only ones that prove nothing rewrote or refused it on the way.
      expect(lookup()).toHaveBeenCalledWith("Old Timer");
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: TARGET, [column]: "Old Timer" }),
        { onConflict: "user_id" },
      );
    },
  );

  // The one refusal left, and it holds on both branches.
  it.each(["minecraft", "roblox"])(
    "returns 400 for a %s username past the length bound",
    async (platform) => {
      mockAdmin();

      const response = await PATCH(
        ...createRequest(TARGET, {
          platform,
          username: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
        }),
      );

      expect(response.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for a non-uuid user id", async () => {
    mockAdmin();

    const response = await PATCH(
      ...createRequest("not-a-uuid", {
        platform: "minecraft",
        username: "Notch",
      }),
    );

    expect(response.status).toBe(400);
  });

  // -- Target authorization --

  it("returns 404 when the target does not exist", async () => {
    mockAdmin();
    const { upsert } = mockTarget(null);

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username: "Notch" }),
    );

    expect(response.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(["customer", "admin"])(
    "returns 400 when the target is a %s — only players hold game identities",
    async (role) => {
      mockAdmin();
      const { upsert } = mockTarget(role);

      const response = await PATCH(
        ...createRequest(TARGET, { platform: "roblox", username: "builderman" }),
      );

      expect(response.status).toBe(400);
      expect(upsert).not.toHaveBeenCalled();
      // Refused before either platform was asked about the name.
      expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
    },
  );

  // -- Happy paths --

  it("writes a gamer's Minecraft row with the uuid it resolved", async () => {
    mockAdmin();
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    const { upsert } = mockTarget("gamer");

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username: "notch" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      platform: "minecraft",
      username: "notch",
      externalId: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: TARGET,
        minecraft_username: "notch",
        minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      },
      { onConflict: "user_id" },
    );
  });

  it("writes a gedu's Roblox row with the account id it resolved", async () => {
    mockAdmin();
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });
    const { upsert } = mockTarget("gedu");

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "roblox", username: "builderman" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      platform: "roblox",
      username: "builderman",
      externalId: 156,
    });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: TARGET,
        roblox_username: "builderman",
        roblox_user_id: 156,
      },
      { onConflict: "user_id" },
    );
  });

  it("stores a handle the platform cannot resolve, with no account id", async () => {
    mockAdmin();
    mockLookupRobloxProfile.mockResolvedValue(null);
    const { upsert } = mockTarget("gamer");

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "roblox", username: "nobody_here" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.externalId).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ roblox_user_id: null }),
      { onConflict: "user_id" },
    );
  });

  it("clears both columns on a null username, without a lookup", async () => {
    mockAdmin();
    const { upsert } = mockTarget("gamer");

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username: null }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.username).toBeNull();
    expect(data.externalId).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: TARGET,
        minecraft_username: null,
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  /**
   * **The direction this changed in is the one worth a test.** A blank username
   * used to be a 400; it is now a clear, which means the same request that used
   * to be refused outright now *destroys* a stored account. Pinning it here is
   * what stops a future normalization tweak turning a clear back into a no-op —
   * which would silently leave a name on a row somebody asked to have emptied.
   */
  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    // `.trim()` leaves every format character in place, so without the strip
    // this stores a name that renders as an empty-looking row.
    ["only invisible characters", INVISIBLE_ONLY_NAME],
  ])("clears both columns for %s, without a lookup", async (_label, username) => {
    mockAdmin();
    const { upsert } = mockTarget("gamer");

    const response = await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.username).toBeNull();
    expect(data.externalId).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: TARGET,
        minecraft_username: null,
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  it.each([
    ["a zero-width space", ZERO_WIDTH_SPACE],
    ["a right-to-left override", RIGHT_TO_LEFT_OVERRIDE],
  ])(
    "strips %s out of a name before the lookup and the write",
    async (_label, character) => {
      mockAdmin();
      mockLookupMinecraftUser.mockResolvedValue(null);
      const { upsert } = mockTarget("gamer");

      const response = await PATCH(
        ...createRequest(TARGET, {
          platform: "minecraft",
          username: `Old${character}Timer`,
        }),
      );

      expect(response.status).toBe(200);
      // One name, in all three places: what Mojang was asked about, what the
      // row holds, and what the response echoes. The invisible character is in
      // none of them, so the stored name and the drawn name are the same name.
      expect(mockLookupMinecraftUser).toHaveBeenCalledWith("OldTimer");
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ minecraft_username: "OldTimer" }),
        { onConflict: "user_id" },
      );
      expect((await response.json()).username).toBe("OldTimer");
    },
  );

  it("writes on the user-bound client, so the admin RLS policy is what permits it", async () => {
    // The gate's `supabase` is the only client this route ever touches. If it
    // ever reached for the service-role client the policy would stop being the
    // thing that authorizes the write, and this assertion is what would notice.
    mockAdmin();
    mockLookupMinecraftUser.mockResolvedValue({ username: "Notch", uuid: "u" });
    mockTarget("gamer");

    await PATCH(
      ...createRequest(TARGET, { platform: "minecraft", username: "Notch" }),
    );

    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockFrom).toHaveBeenCalledWith("minecraft_accounts");
  });
});
