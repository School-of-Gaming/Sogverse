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
  // The identity re-read after an address move: `auth.identities.email` is a
  // generated column, and the update's own payload reports it stale.
  getUserById: vi.fn(),
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

const mockSendGamerWelcomeEmail = vi.fn();
vi.mock("@/lib/gamer-welcome.server", () => ({
  sendGamerWelcomeEmail: (...args: unknown[]) => mockSendGamerWelcomeEmail(...args),
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

/**
 * The child's current sign-in mode, as the credential logic reads it, plus the
 * update chain that writes a new one. `username` by default, because that is the
 * mode a password may be set in and most of this file's credential cases are
 * about passwords.
 */
let currentSignIn: "parent" | "username" | "email" = "username";
const mockSignInUpdate = vi.fn();

function gamerProfileTable() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { sign_in: currentSignIn }, error: null }),
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: { sign_in: currentSignIn }, error: null }),
      }),
    }),
    update: (...args: unknown[]) => {
      mockSignInUpdate(...args);
      return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
    },
  };
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
  mockAdminFrom.mockImplementation((table: string) => {
    // The sign-in mode lives on its own table and is read (and written)
    // outside the `profiles` sequence the counts below describe.
    if (table === "gamer_profiles") return gamerProfileTable();
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
    currentSignIn = "username";
    // The identity re-read echoes whatever address the auth write carried, which
    // is the honest default: a test that wants the trap asserts a stale one.
    mockAdminAuthAdmin.getUserById.mockImplementation(() => {
      const call = mockAdminAuthAdmin.updateUserById.mock.calls.find(
        ([, payload]) => "email" in payload,
      );
      const email = call ? call[1].email : "moved@example.com";
      return Promise.resolve({
        data: { user: { identities: [{ identity_data: { email } }] } },
        error: null,
      });
    });
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

  it("holds a child's password to the same bar as their parent's", async () => {
    // The account policy is one rule, shared with parent registration: a child's
    // credential guards the same kind of account, so a weaker bar here would be
    // a decision nobody made. It used to be six characters here and eight there.
    mockAuthenticated();

    const [req, ctx] = createRequest(GAMER_ID, { password: "1234567" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 8 characters");
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
      callCount++;
      if (callCount === 1) return roleCheck;
      return fetch;
    });

    mockAdminAuthAdmin.updateUserById.mockResolvedValue({
      data: { user: {} },
      error: null,
    });

    const [req, ctx] = createRequest(GAMER_ID, { password: "newpassword123" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.id).toBe(GAMER_ID);
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledWith(
      GAMER_ID,
      { password: "newpassword123" },
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
      password: "newpassword123",
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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
        mockAdminFrom.mockImplementation((table: string) => {
          // The sign-in mode lives on its own table and is read (and written)
          // outside the `profiles` sequence the counts below describe.
          if (table === "gamer_profiles") return gamerProfileTable();
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
    mockAdminFrom.mockImplementation((table: string) => {
      // The sign-in mode lives on its own table and is read (and written)
      // outside the `profiles` sequence the counts below describe.
      if (table === "gamer_profiles") return gamerProfileTable();
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

  // -- Sign-in mode transitions --
  //
  // The account's *address* is what a sign-in mode is, so each destination
  // rewrites `auth.users`, `profiles.email` and `gamer_profiles.sign_in`
  // together. What differs is what goes in them — and, on two of the three, what
  // happens to the password. Every case below asserts the trio.

  describe("sign-in mode transitions", () => {
    /**
     * Admin dispatch for a credential change: the role check, then the
     * `profiles.email` write, then the final fetch — with `gamer_profiles`
     * answered out of band by the shared table mock.
     */
    function mockCredentialChange() {
      const roleCheck = mockTargetProfile("gamer");
      const emailUpdate = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
      const finalFetch = mockProfileFetch({
        id: GAMER_ID,
        first_name: "Aino",
        role: "gamer",
      });

      let profilesCall = 0;
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "gamer_profiles") return gamerProfileTable();
        profilesCall++;
        if (profilesCall === 1) return roleCheck;
        // Whether the address moved decides how many `profiles` calls follow, so
        // the rest of them answer both shapes rather than being counted.
        return { ...emailUpdate, ...finalFetch };
      });

      mockAdminAuthAdmin.updateUserById.mockResolvedValue({
        data: { user: {} },
        error: null,
      });
      return { emailUpdate };
    }

    /** The one argument bag the route handed GoTrue. */
    function authWrite(): Record<string, unknown> {
      const call = mockAdminAuthAdmin.updateUserById.mock.calls.find(
        ([, payload]) => "email" in payload || "password" in payload,
      );
      expect(call, "no credential write reached GoTrue").toBeDefined();
      return call![1];
    }

    beforeEach(() => {
      mockAuthenticated("customer-123");
      mockParentGamerLookup(true);
      mockSendGamerWelcomeEmail.mockResolvedValue(undefined);
    });

    it("→ parent: a fresh synthetic handle, and the password scrambled away", async () => {
      currentSignIn = "username";
      const { emailUpdate } = mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { signIn: "parent" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      const written = authWrite();
      // A random handle rather than the one they had: the old address was a
      // username the family chose, and it should not stay attached to an account
      // that is no longer reachable through it.
      expect(written.email).toMatch(/@gamer\.sogverse\.internal$/);
      // GoTrue cannot unset a password, so it is overwritten with a value nobody
      // holds. That is what "switch-only" means here.
      expect(typeof written.password).toBe("string");
      expect(String(written.password).length).toBeGreaterThan(32);
      expect(emailUpdate.update).toHaveBeenCalledWith({ email: written.email });
      expect(mockSignInUpdate).toHaveBeenCalledWith({ sign_in: "parent" });
      expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
    });

    it("→ username: the address becomes the handle, and the password is set", async () => {
      currentSignIn = "parent";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "username",
        username: "Aino",
        password: "a good password",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      // Normalised on the way in, so one username is one address.
      expect(authWrite()).toEqual({
        email: "aino@gamer.sogverse.internal",
        email_confirm: true,
        password: "a good password",
      });
      expect(mockSignInUpdate).toHaveBeenCalledWith({ sign_in: "username" });
    });

    it("→ username: refuses without a password, because entering the mode needs one", async () => {
      currentSignIn = "parent";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "username",
        username: "aino",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("→ username: refuses without a username", async () => {
      currentSignIn = "parent";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "username",
        password: "a good password",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("within username mode: a password alone is a parent resetting a forgotten one", async () => {
      currentSignIn = "username";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { password: "a new password" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      // No address moved, so no identity re-read and no profiles write.
      expect(authWrite()).toEqual({ password: "a new password" });
      expect(mockAdminAuthAdmin.getUserById).not.toHaveBeenCalled();
      expect(mockSignInUpdate).not.toHaveBeenCalled();
    });

    it("within username mode: a new username moves the address", async () => {
      currentSignIn = "username";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { username: "aino2" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      expect(authWrite()).toEqual({
        email: "aino2@gamer.sogverse.internal",
        email_confirm: true,
      });
      // The mode did not change, so nothing was written to it.
      expect(mockSignInUpdate).not.toHaveBeenCalled();
    });

    it("→ email: the real address, the password scrambled, and the mail sent", async () => {
      currentSignIn = "username";
      const { emailUpdate } = mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "aino@example.com",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      const written = authWrite();
      expect(written.email).toBe("aino@example.com");
      // The password set against the OLD address must not survive the move.
      expect(typeof written.password).toBe("string");
      expect(emailUpdate.update).toHaveBeenCalledWith({ email: "aino@example.com" });
      expect(mockSignInUpdate).toHaveBeenCalledWith({ sign_in: "email" });
      expect(mockSendGamerWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ gamerId: GAMER_ID }),
      );
    });

    it("→ email: normalises the address before it becomes the account", async () => {
      // GoTrue lowercases on the way in, so a parent typing capitals must
      // produce the row GoTrue will actually hold. The verification token is
      // signed over the stored address, so a second spelling would mint a link
      // that could never verify.
      currentSignIn = "username";
      const { emailUpdate } = mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "  Aino@Example.COM ",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(200);
      expect(authWrite().email).toBe("aino@example.com");
      expect(emailUpdate.update).toHaveBeenCalledWith({ email: "aino@example.com" });
    });

    it("→ email: refuses an address in our own synthetic domain", async () => {
      // The domain is ours and no family types it. Landing there would promise a
      // mailbox nobody can read, or claim a username-mode handle that belongs to
      // another child — and the schema refuses before anything is written.
      currentSignIn = "username";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "AINO@gamer.sogverse.internal",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("→ email: refuses without an address", async () => {
      currentSignIn = "parent";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { signIn: "email" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("within email mode: an address change is refused, not written", async () => {
      // Changing an account's email address is not something the platform
      // supports for any role (owner ruling), and the route is where that is
      // enforced: it is the only layer that can tell a child *entering* the mode
      // from one already in it. The card offers no field for this, so a body
      // shaped like this is a caller working around the product decision.
      currentSignIn = "email";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { email: "new@example.com" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
      expect(mockSignInUpdate).not.toHaveBeenCalled();
      expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
    });

    it("within email mode: a restated signIn does not make it a transition", async () => {
      // `signIn: "email"` on an account that is already there changes nothing,
      // so the address beside it is still an address change and is refused the
      // same way. The rule keys on whether the mode moves, not on the key.
      currentSignIn = "email";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "new@example.com",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("→ email: a failed mail does not fail the mode change", async () => {
      currentSignIn = "username";
      mockCredentialChange();
      mockSendGamerWelcomeEmail.mockRejectedValue(new Error("brevo is down"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "aino@example.com",
      });
      const response = await PATCH(req, ctx);

      // The mode change is committed by the time the send runs, so a Brevo
      // outage must not unwind it — the parent can send the link again.
      expect(response.status).toBe(200);
      spy.mockRestore();
    });

    it("refuses a password on a gamer who is not, and is not becoming, username-mode", async () => {
      currentSignIn = "email";
      mockCredentialChange();

      const [req, ctx] = createRequest(GAMER_ID, { password: "a good password" });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(400);
      expect(mockAdminAuthAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it("answers 409 USERNAME_TAKEN when the handle is already an address", async () => {
      currentSignIn = "parent";
      mockCredentialChange();
      mockAdminAuthAdmin.updateUserById.mockResolvedValue({
        data: null,
        error: { code: "email_exists", message: "email already registered" },
      });

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "username",
        username: "taken",
        password: "a good password",
      });
      const response = await PATCH(req, ctx);
      const data = await response.json();

      expect(response.status).toBe(409);
      // In username mode the address IS the username, so naming the email field
      // would point at a form field this parent does not have.
      expect(data.code).toBe("USERNAME_TAKEN");
    });

    it("answers 409 EMAIL_TAKEN when the address already has an account", async () => {
      currentSignIn = "parent";
      mockCredentialChange();
      mockAdminAuthAdmin.updateUserById.mockResolvedValue({
        data: null,
        error: { code: "email_exists", message: "email already registered" },
      });

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "taken@example.com",
      });
      const response = await PATCH(req, ctx);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.code).toBe("EMAIL_TAKEN");
    });

    it("withdraws the credential when the sign-in mode cannot be recorded", async () => {
      // The invariant: a credential that opens a gamer account exists only where
      // `gamer_profiles.sign_in` says one does. The mode is written last —
      // it is the record of the auth writes rather than a part of them — so its
      // failure is the one that leaves a working username and password the
      // platform believes does not exist. That is exactly what the switch gate
      // is built to rule out: the child could sign in on any machine, and the
      // platform would classify that session by a mode that is a lie.
      currentSignIn = "parent";
      mockCredentialChange();
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      // Everything succeeds except the mode write, which is the last of the
      // three and the only one under test here.
      const profiles = {
        ...mockTargetProfile("gamer"),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
      mockAdminFrom.mockImplementation((table: string) => {
        if (table !== "gamer_profiles") return profiles;
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: { sign_in: "parent" }, error: null }),
            }),
          }),
          update: (...args: unknown[]) => {
            mockSignInUpdate(...args);
            return {
              eq: vi
                .fn()
                .mockResolvedValue({ data: null, error: { message: "row locked" } }),
            };
          },
        };
      });

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "username",
        username: "aino",
        password: "a good password",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(500);

      // Two auth writes: the credential, then the compensation that takes it
      // away again. The second carries a password nobody holds and no address —
      // the address is deliberately left where it landed, because moving it back
      // is another write that can fail the same way.
      const writes = mockAdminAuthAdmin.updateUserById.mock.calls.map(([, p]) => p);
      expect(writes).toHaveLength(2);
      expect(writes[0]).toMatchObject({ password: "a good password" });
      expect(Object.keys(writes[1])).toEqual(["password"]);
      expect(writes[1].password).not.toBe("a good password");
      expect(String(writes[1].password)).toHaveLength(64);

      spy.mockRestore();
    });

    it("fails loudly when auth.users moved and auth.identities did not", async () => {
      // The trap the hand operation checks for: sign-in would keep answering to
      // the OLD address while everything looks like it worked. Caught before
      // `profiles` is touched, so the two halves cannot silently disagree.
      currentSignIn = "parent";
      const { emailUpdate } = mockCredentialChange();
      mockAdminAuthAdmin.getUserById.mockResolvedValue({
        data: {
          user: { identities: [{ identity_data: { email: "stale@example.com" } }] },
        },
        error: null,
      });
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const [req, ctx] = createRequest(GAMER_ID, {
        signIn: "email",
        email: "aino@example.com",
      });
      const response = await PATCH(req, ctx);

      expect(response.status).toBe(500);
      expect(emailUpdate.update).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
