import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/gamers/[id]/route";
import { NextResponse } from "next/server";

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

const mockLookupMinecraftUser = vi.fn();
const mockIsValidMinecraftUsername = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  isValidMinecraftUsername: (...args: unknown[]) =>
    mockIsValidMinecraftUsername(...args),
}));

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

/** Mock the admin profiles update */
function mockProfileUpdate(success = true) {
  const eqMock = vi.fn().mockResolvedValue(
    success
      ? { data: null, error: null }
      : { data: null, error: { message: "Update failed" } },
  );
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
 * 2. profiles (update) — display name update
 * 3. profiles (select *) — final fetch
 */
function mockAdminSuccess(
  targetRole = "gamer",
  updatedProfile: Record<string, unknown> = {
    id: "gamer-1",
    display_name: "Updated Name",
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
    mockIsValidMinecraftUsername.mockImplementation(
      (u: string) => /^[a-zA-Z0-9_]{3,16}$/.test(u),
    );
  });

  // -- Auth & authorization --

  it("should return 401 when unauthenticated", async () => {
    mockUnauthenticated();

    const [req, ctx] = createRequest("gamer-1", { displayName: "New Name" });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(401);
  });

  it("should enforce customer role and return 403 for non-customers", async () => {
    mockForbiddenRole();

    const [req, ctx] = createRequest("gamer-1", { displayName: "New Name" });
    const response = await PATCH(req, ctx);
    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("customer", expect.any(Object));
  });

  // -- Input validation --

  it("should return 400 when body is empty", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest("gamer-1", {});
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("At least one");
    expect(data.error).toContain("minecraftUsername");
  });

  it("should return 400 when displayName is too short", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest("gamer-1", { displayName: "A" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 2 characters");
  });

  it("should return 400 when password is too short", async () => {
    mockAuthenticated();

    const [req, ctx] = createRequest("gamer-1", { password: "12345" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 6 characters");
  });

  // -- IDOR / parent-child verification --

  it("should return 403 when customer is NOT parent of the target gamer", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(false);

    const [req, ctx] = createRequest("gamer-1", { displayName: "New Name" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Not authorized to manage this gamer");
  });

  it("should return 403 when target is a non-gamer user", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("admin"); // target is admin, not gamer

    const [req, ctx] = createRequest("admin-1", { displayName: "New Name" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Not authorized to manage this account");
  });

  // -- Happy paths --

  it("should update display name only", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("gamer", {
      id: "gamer-1",
      display_name: "New Name",
      role: "gamer",
    });

    const [req, ctx] = createRequest("gamer-1", { displayName: "New Name" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.display_name).toBe("New Name");
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledWith(
      "gamer-1",
      { user_metadata: { display_name: "New Name" } },
    );
  });

  it("should update password only", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);

    // For password-only, admin calls: role check → final fetch (no profile update)
    const roleCheck = mockTargetProfile("gamer");
    const fetch = mockProfileFetch({
      id: "gamer-1",
      display_name: "Existing",
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

    const [req, ctx] = createRequest("gamer-1", { password: "newpass123" });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.id).toBe("gamer-1");
    expect(mockAdminAuthAdmin.updateUserById).toHaveBeenCalledWith(
      "gamer-1",
      { password: "newpass123" },
    );
  });

  it("should update both display name and password", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);
    mockAdminSuccess("gamer", {
      id: "gamer-1",
      display_name: "New Name",
      role: "gamer",
    });

    const [req, ctx] = createRequest("gamer-1", {
      displayName: "New Name",
      password: "newpass123",
    });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gamer.display_name).toBe("New Name");
    // Should have been called twice: once for display_name metadata, once for password
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

    // Admin calls: role check → gamer_profiles update → profiles final fetch
    const roleCheck = mockTargetProfile("gamer");
    const mcUpdate = mockProfileUpdate(); // reuse mock shape for gamer_profiles update
    const fetch = mockProfileFetch({
      id: "gamer-1",
      display_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return mcUpdate;
      return fetch;
    });

    const [req, ctx] = createRequest("gamer-1", {
      minecraftUsername: "notch",
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("notch");
  });

  it("should clear minecraft fields when minecraftUsername is null", async () => {
    mockAuthenticated("customer-123");
    mockParentGamerLookup(true);

    const roleCheck = mockTargetProfile("gamer");
    const mcUpdate = mockProfileUpdate();
    const fetch = mockProfileFetch({
      id: "gamer-1",
      display_name: "Existing",
      role: "gamer",
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return roleCheck;
      if (callCount === 2) return mcUpdate;
      return fetch;
    });

    const [req, ctx] = createRequest("gamer-1", {
      minecraftUsername: null,
    });
    const response = await PATCH(req, ctx);

    expect(response.status).toBe(200);
    // Should NOT call Mojang API when clearing
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid minecraft username format", async () => {
    mockAuthenticated("customer-123");

    const [req, ctx] = createRequest("gamer-1", {
      minecraftUsername: "ab",
    });
    const response = await PATCH(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid Minecraft username");
  });
});
