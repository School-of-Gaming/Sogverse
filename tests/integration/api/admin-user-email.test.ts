import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { PATCH } from "@/app/api/admin/users/[id]/email/route";

/**
 * An admin correcting another account's sign-in address.
 *
 * The route is two writes that must not drift apart, so beyond the usual gate
 * and input cases these tests pin the ORDER (auth, then a fresh identity read,
 * then profiles), what a failure at each step leaves behind, and that a retry
 * finishes a half-done change instead of tripping over it. The unverified reset
 * on the new address is the database's (`trg_reset_email_verification`, its own
 * DB test); what is pinned here is that the route writes through
 * `profiles.email`, which is what fires it.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const TARGET = "3f1d0e2a-9c44-4b6e-9a7d-1c2b3d4e5f60";
const OLD = "aino@gmial.com";
const NEW = "aino@gmail.com";

/** Every auth and profiles call, in the order the route made them. */
let calls: string[] = [];

const mockGetUserById = vi.fn();
const mockUpdateUserById = vi.fn();
const mockProfileUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => {
          calls.push("auth.getUserById");
          return mockGetUserById(...args);
        },
        updateUserById: (...args: unknown[]) => {
          calls.push("auth.updateUserById");
          return mockUpdateUserById(...args);
        },
      },
    },
    from: (table: string) => ({
      update: (values: unknown) => {
        calls.push(`${table}.update`);
        mockProfileUpdate(values);
        return {
          eq: () => Promise.resolve(profileWriteResult),
        };
      },
    }),
  }),
}));

let profileWriteResult: { error: { message: string } | null } = { error: null };

/** An auth user as `getUserById` answers, with its identities' addresses. */
function authUser(email: string, identityEmail: string = email) {
  return {
    data: {
      user: {
        id: TARGET,
        email,
        identities: [{ provider: "email", identity_data: { email: identityEmail } }],
      },
    },
    error: null,
  };
}

/** The target's profile as the user-bound client reads it. */
function mockAdmin(profile: { email: string } | null) {
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: profile, error: null }),
      }),
    }),
  }));
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: { role: "admin" },
    supabase: { from },
  });
  return { from };
}

function createRequest(
  userId: string,
  body: Record<string, unknown>,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/users/${userId}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: userId }) },
  ];
}

describe("PATCH /api/admin/users/[id]/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    profileWriteResult = { error: null };
  });

  // -- Auth --

  it("returns 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("returns 403 for a non-admin, and writes nothing", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("admin", expect.any(Object));
    expect(calls).toEqual([]);
  });

  // -- Input --

  it.each([
    ["not an address", "aino at gmail"],
    ["empty", "   "],
    ["our synthetic gamer domain", "aino@gamer.sogverse.internal"],
  ])("returns 400 for an address that is %s", async (_label, email) => {
    mockAdmin({ email: OLD });

    const response = await PATCH(...createRequest(TARGET, { email }));

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns 400 for a non-uuid user id", async () => {
    mockAdmin({ email: OLD });

    const response = await PATCH(...createRequest("not-a-uuid", { email: NEW }));

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns 404 when the target does not exist", async () => {
    mockAdmin(null);

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });

  // -- Happy path --

  it("moves auth, verifies the identity on a fresh read, then writes profiles", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById
      .mockResolvedValueOnce(authUser(OLD))
      .mockResolvedValueOnce(authUser(NEW));
    // The update's own payload carries the identities as they were BEFORE the
    // write — trusting it would fail every real run, so it must not be read.
    mockUpdateUserById.mockResolvedValue(authUser(NEW, OLD));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, email: NEW });
    expect(calls).toEqual([
      "auth.getUserById",
      "auth.updateUserById",
      "auth.getUserById",
      "profiles.update",
    ]);
    expect(mockUpdateUserById).toHaveBeenCalledWith(TARGET, {
      email: NEW,
      email_confirm: true,
    });
    // Through profiles.email and nothing else: that column's trigger is what
    // clears email_verified_at for the new address.
    expect(mockProfileUpdate).toHaveBeenCalledWith({ email: NEW });
  });

  it("normalises the address the way signup does before writing it", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById
      .mockResolvedValueOnce(authUser(OLD))
      .mockResolvedValueOnce(authUser(NEW));
    mockUpdateUserById.mockResolvedValue(authUser(NEW));

    const response = await PATCH(
      ...createRequest(TARGET, { email: "  Aino@GMAIL.com " }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      TARGET,
      expect.objectContaining({ email: NEW }),
    );
    expect(mockProfileUpdate).toHaveBeenCalledWith({ email: NEW });
  });

  it("accepts a gamer target — every role is editable", async () => {
    // The route never reads the target's role: a child is corrected like
    // anyone else, and the synthetic-domain fence is the body schema's.
    const { from } = mockAdmin({ email: "g0123456789abcdef@gamer.sogverse.internal" });
    mockGetUserById
      .mockResolvedValueOnce(authUser("g0123456789abcdef@gamer.sogverse.internal"))
      .mockResolvedValueOnce(authUser(NEW));
    mockUpdateUserById.mockResolvedValue(authUser(NEW));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(mockProfileUpdate).toHaveBeenCalledWith({ email: NEW });
  });

  // -- Failures --

  it("refuses an address another account holds with 409 and its code, leaving profiles untouched", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById.mockResolvedValueOnce(authUser(OLD));
    mockUpdateUserById.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", message: "A user with this email address has already been registered" },
    });

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("EMAIL_TAKEN");
    expect(calls).toEqual(["auth.getUserById", "auth.updateUserById"]);
  });

  it("recognises the duplicate refusal by its prose when the code is missing", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById.mockResolvedValueOnce(authUser(OLD));
    mockUpdateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(409);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it("fails without touching profiles when the auth write fails for any other reason", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById.mockResolvedValueOnce(authUser(OLD));
    mockUpdateUserById.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", message: "boom" },
    });

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(500);
    expect((await response.json()).code).toBeUndefined();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it("fails loudly when auth.users moved but the identity did not, leaving profiles untouched", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById
      .mockResolvedValueOnce(authUser(OLD))
      // The fresh read: auth.users holds the new address, the identity the old.
      .mockResolvedValueOnce(authUser(NEW, OLD));
    mockUpdateUserById.mockResolvedValue(authUser(NEW));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(500);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it("fails when the auth write cannot be verified, leaving profiles untouched", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById
      .mockResolvedValueOnce(authUser(OLD))
      .mockResolvedValueOnce({ data: { user: null }, error: { message: "timeout" } });
    mockUpdateUserById.mockResolvedValue(authUser(NEW));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(500);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it("reports a profiles failure after the auth move as a server error", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById
      .mockResolvedValueOnce(authUser(OLD))
      .mockResolvedValueOnce(authUser(NEW));
    mockUpdateUserById.mockResolvedValue(authUser(NEW));
    profileWriteResult = { error: { message: "connection reset" } };

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(500);
  });

  // -- Idempotence --

  it("finishes a half-done change: auth already moved, profiles brought into line", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById.mockResolvedValueOnce(authUser(NEW));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["auth.getUserById", "profiles.update"]);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockProfileUpdate).toHaveBeenCalledWith({ email: NEW });
  });

  it("still refuses a retry whose identity never moved", async () => {
    mockAdmin({ email: OLD });
    mockGetUserById.mockResolvedValueOnce(authUser(NEW, OLD));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(500);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  it("writes nothing when both halves already hold the address", async () => {
    mockAdmin({ email: NEW });
    mockGetUserById.mockResolvedValueOnce(authUser(NEW));

    const response = await PATCH(...createRequest(TARGET, { email: NEW }));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["auth.getUserById"]);
  });
});
