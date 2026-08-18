import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/gamers/[id]/route";
import { NextResponse } from "next/server";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import { INVISIBLE_ONLY_NAME } from "../../helpers/invisible-characters";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminAuthAdmin = {
  updateUserById: vi.fn(),
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    auth: { admin: mockAdminAuthAdmin },
  })),
}));

// Only the network hop is replaced. Neither platform module carries a format
// rule any more — the wire schema is a trim and a length bound, and the platform
// alone decides whether a name resolves.
const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
}));

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbiddenRole() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only customers can update gamer accounts" },
      { status: 403 },
    ),
  );
}

const mockSupabaseFrom = vi.fn();

// Real gamer ids are auth-user uuids, and the route validates the path
// segment as one — so the fixtures are uuids too.
const GAMER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

function mockAuthenticated(userId = "customer-123") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role: "customer" },
    supabase: {
      from: (...args: unknown[]) => mockSupabaseFrom(...args),
    },
  });
}

function createRequest(
  gamerId: string,
  body: Record<string, unknown>,
): [Request, { params: Promise<{ id: string }> }] {
  const request = new Request(
    `http://localhost:3000/api/gamers/${gamerId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const context = { params: Promise.resolve({ id: gamerId }) };
  return [request, context];
}

/** Mock the RLS-protected parent_gamer lookup */
function mockParentGamerLookup(found: boolean) {
  const maybeSingleMock = vi.fn().mockResolvedValue(
    found
      ? { data: { id: "link-1" }, error: null }
      : { data: null, error: null },
  );
  const eqGamerMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const eqParentMock = vi.fn().mockReturnValue({ eq: eqGamerMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqParentMock });
  mockSupabaseFrom.mockReturnValue({ select: selectMock });
}

/** Mock the admin profiles lookup for role verification */
function mockTargetProfile(role: string | null) {
  const singleMock = vi.fn().mockResolvedValue(
    role
      ? { data: { role }, error: null }
      : { data: null, error: { message: "Not found" } },
  );
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { select: selectMock };
}

/** Mock the admin profiles update — supports the post-update SELECT.single()
 *  chain the route uses to read back first_name/last_name for metadata sync. */
function mockProfileUpdate(
  success = true,
  returnedRow: Record<string, unknown> = { first_name: "New Name", last_name: "" },
) {
  const singleMock = vi.fn().mockResolvedValue(
    success
      ? { data: returnedRow, error: null }
      : { data: null, error: { message: "Update failed" } },
  );
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  const eqMock = vi.fn().mockReturnValue({ select: selectMock });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { update: updateMock };
}

/** Mock the admin profiles final fetch */
function mockProfileFetch(profile: Record<string, unknown>) {
  const singleMock = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { select: selectMock };
}

/**
 * Sets up mockAdminFrom to handle the sequence of admin client calls:
 * 1. profiles (select role) — role check
 * 2. profiles (update) — first name update
 * 3. profiles (select *) — final fetch
 */
function mockAdminSuccess(
  targetRole = "gamer",
  updatedProfile: Record<string, unknown> = {
    id: GAMER_ID,
    first_name: "Updated Name",
    role: "gamer",
  },
) {
  const roleCheck = mockTargetProfile(targetRole);
  const update = mockProfileUpdate();
  const fetch = mockProfileFetch(updatedProfile);

  let callCount = 0;
  mockAdminFrom.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return roleCheck;
    if (callCount === 2) return update;
    return fetch;
  });

  mockAdminAuthAdmin.updateUserById.mockResolvedValue({
    data: { user: {} },
    error: null,
  });
}

// --- Tests ---

describe("PATCH /api/gamers/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth & authorization --

  it("should return 401 when unauthenticated", async () => {
    mockUnauthenticated();

    const [req, ctx] = createRequest(GAMER_ID, { firstName: "New Name" });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it("should enforce customer role and return 403 for non-customers", async () => {
    mockForbiddenRole();

    const [req, ctx] = createRequest(GAMER_ID, { firstName: "New Name" });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("customer", expect.any(Object));
  });

  // -- Input validation --

  it("should return 400 when body is empty", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest(GAMER_ID, {});
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("At least one");
    expect(data.error).toContain("minecraftUsername");
  });

  it("should return 400 when firstName is too short", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest(GAMER_ID, { firstName: "A" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("between 2 and 32 characters");
  });

  it("should return 400 when password is too short", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest(GAMER_ID, { password: "12345" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 6 characters");
  });

  // -- IDOR / parent-child verification --

  it("should return 403 when customer is NOT parent of the target gamer", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(false);

    const [req, ctx] = createRequest(GAMER_ID, { firstName: "New Name" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Not authorized to manage this gamer");
  });

  it("should return 403 when target is a non-gamer user", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("admin"); // target is admin, not gamer

    const [req, ctx] = createRequest(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      { firstName: "New Name" },
    );
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Not authorized to manage this account");
  });

  // -- Happy paths --

  it("should update first name only", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("gamer", {
      id: GAMER_ID,
      first_name: "New Name",
      role: "gamer",
    });

    const [req, ctx] = createRequest(GAMER_ID, { firstName: "New Name" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.first_name).toBe("New Name");
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledWith(
      GAMER_ID,
      { user_metadata: { first_name: "New Name", display_name: "New Name" } },
    );
  });

  it("should update password only", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);

    // For password-only, admin calls: role check → final fetch (no profile update)
    const roleCheck = mockTargetProfile("gamer");
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      return fetch;
    });

    mockAdminAuthAdmin.updateUserById.mockResolvedValue({
      data: { user: {} },
      error: null,
    });

    const [req, ctx] = createRequest(GAMER_ID, { password: "newpass123" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.id).toBe(GAMER_ID);
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledWith(
      GAMER_ID,
      { password: "newpass123" },
    );
  });

  it("should update both first name and password", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("gamer", {
      id: GAMER_ID,
      first_name: "New Name",
      role: "gamer",
    });

    const [req, ctx] = createRequest(GAMER_ID, {
      firstName: "New Name",
      password: "newpass123",
    });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.first_name).toBe("New Name");
    // Should have been called twice: once for first_name metadata, once for password
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledTimes(2);
  });

  // -- Minecraft username --

  it("should accept minecraftUsername as sole update field", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });

    // Admin calls: role check → minecraft_accounts upsert → profiles final fetch
    const roleCheck = mockTargetProfile("gamer");
    const mcUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return mcUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, {
      minecraftUsername: "notch",
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("notch");
    expect(mcUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        minecraft_username: "notch",
        minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      },
      { onConflict: "user_id" },
    );
  });

  it("should clear minecraft fields when minecraftUsername is null", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);

    const roleCheck = mockTargetProfile("gamer");
    const mcUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return mcUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, {
      minecraftUsername: null,
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    // Should NOT call Mojang API when clearing
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  /**
   * **The decision, on a parent's edit: no name is refused for its shape.** A
   * two-character handle was a 400 here once and Mojang has issued them, so a
   * parent typing their child's real name was told it could not exist. Now it
   * goes to Mojang and a miss is stored unverified — the name is still the
   * child's answer.
   */
  it("stores a name our old format rule called impossible, unverified", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockLookupMinecraftUser.mockResolvedValue(null);

    const roleCheck = mockTargetProfile("gamer");
    const mcUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return mcUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, { minecraftUsername: "ab" });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("ab");
    expect(mcUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        minecraft_username: "ab",
        minecraft_uuid: null,
      },
      { onConflict: "user_id" },
    );
  });

  // The one refusal left: a bound on our own request, not a claim about names.
  it("should return 400 for a minecraft username past the length bound", async () => {
    mockAuthenticated("customer-123");

    const [req, ctx] = createRequest(GAMER_ID, {
      minecraftUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(400);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  // -- Roblox username --

  it("should accept robloxUsername as sole update field", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });

    // Admin calls: role check → roblox_accounts upsert → profiles final fetch.
    const roleCheck = mockTargetProfile("gamer");
    const robloxUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return robloxUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, {
      robloxUsername: "builderman",
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(mockLookupRobloxProfile).toHaveBeenCalledWith("builderman");
    expect(robloxUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        roblox_username: "builderman",
        roblox_user_id: 156,
      },
      { onConflict: "user_id" },
    );
    // The parent named no Minecraft key, so that link is left entirely alone.
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  it("should store a handle Roblox cannot resolve with a null account id", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockLookupRobloxProfile.mockResolvedValue(null);

    const roleCheck = mockTargetProfile("gamer");
    const robloxUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return robloxUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, {
      robloxUsername: "nobody_here",
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(robloxUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        roblox_username: "nobody_here",
        roblox_user_id: null,
      },
      { onConflict: "user_id" },
    );
  });

  it("should clear roblox fields when robloxUsername is null", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);

    const roleCheck = mockTargetProfile("gamer");
    const robloxUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return robloxUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, { robloxUsername: null });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(robloxUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        roblox_username: null,
        roblox_user_id: null,
      },
      { onConflict: "user_id" },
    );
    // Nothing to look up when clearing.
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  /**
   * **A blank field clears, and that is the direction that changed.** It used to
   * be a 400 on both platforms; it now empties the child's stored account, so
   * each spelling of "nothing here" has to be pinned as the destructive write it
   * is — both columns null, no lookup — and not as a no-op leaving the old name
   * in place. The invisible case is the one `.trim()` alone would let through.
   */
  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    ["only invisible characters", INVISIBLE_ONLY_NAME],
  ])(
    "clears both platforms' columns for %s, without a lookup",
    async (_label, name) => {
      for (const platform of ["minecraft", "roblox"] as const) {
        vi.clearAllMocks();
        mockAuthenticated("customer-123");
        mockParentGamerLookup(true);

        const roleCheck = mockTargetProfile("gamer");
        const accountUpsert = {
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        const fetch = mockProfileFetch({
          id: GAMER_ID,
          first_name: "Existing",
          role: "gamer",
        });

        let callCount = 0;
        mockAdminFrom.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return roleCheck;
          if (callCount === 2) return accountUpsert;
          return fetch;
        });

        const [req, ctx] = createRequest(
          GAMER_ID,
          platform === "minecraft"
            ? { minecraftUsername: name }
            : { robloxUsername: name },
        );
        const response = await PATCH(req, ctx);

        expect(response.status).toBe(200);
        expect(accountUpsert.upsert).toHaveBeenCalledWith(
          platform === "minecraft"
            ? {
                user_id: GAMER_ID,
                minecraft_username: null,
                minecraft_uuid: null,
              }
            : {
                user_id: GAMER_ID,
                roblox_username: null,
                roblox_user_id: null,
              },
          { onConflict: "user_id" },
        );
        expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
        expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
      }
    },
  );

  /**
   * The Roblox half of the same decision. A handle with a space is the sharpest
   * case: Roblox's signup validator refuses one today, and Roblox has had live
   * accounts holding one for longer than that validator has existed.
   */
  it("stores a handle our old format rule called impossible, unverified", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockLookupRobloxProfile.mockResolvedValue(null);

    const roleCheck = mockTargetProfile("gamer");
    const robloxUpsert = {
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const fetch = mockProfileFetch({
      id: GAMER_ID,
      first_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return robloxUpsert;
      return fetch;
    });

    const [req, ctx] = createRequest(GAMER_ID, { robloxUsername: "Old Timer" });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(mockLookupRobloxProfile).toHaveBeenCalledWith("Old Timer");
    expect(robloxUpsert.upsert).toHaveBeenCalledWith(
      {
        user_id: GAMER_ID,
        roblox_username: "Old Timer",
        roblox_user_id: null,
      },
      { onConflict: "user_id" },
    );
  });

  // The one refusal left: a bound on our own request, not a claim about handles.
  it("should return 400 for a roblox username past the length bound", async () => {
    mockAuthenticated("customer-123");

    const [req, ctx] = createRequest(GAMER_ID, {
      robloxUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(400);
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });
});
