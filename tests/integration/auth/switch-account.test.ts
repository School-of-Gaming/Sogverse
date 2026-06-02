import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/switch-account/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminGenerateLink = vi.fn();
const mockAdminGetUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockAdminGenerateLink(...args),
        getUserById: (...args: unknown[]) => mockAdminGetUserById(...args),
      },
    },
  })),
}));

const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
  })),
}));

// The route clears the parent-PIN unlock cookie on success.
const mockCookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: mockCookieDelete })),
}));

// --- Helpers ---

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/switch-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function mockAuthenticated(role: "customer" | "gamer", userId: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { id: userId, role, first_name: role === "customer" ? "Parent" : "Gamer" },
    supabase: { auth: { signOut: mockSignOut } },
  });
}

type TargetProfile = { id: string; role: string; username: string | null } | null;

/**
 * Configure the admin client to dispatch `from()` calls to per-table mock
 * builders. The profile lookup always responds the same way, but the
 * parent_gamer chain varies between tests (eq+eq+maybeSingle for direct
 * link checks, in() for sibling checks), so we let each test pass a
 * builder for it.
 */
function setupAdminFrom(args: {
  target: TargetProfile;
  parentGamerBuilder?: () => Record<string, unknown>;
}) {
  const profileChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue(
          args.target ? mockSupabaseSuccess(args.target) : mockSupabaseSuccess(null),
        ),
      }),
    }),
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "profiles") return profileChain;
    if (table === "parent_gamer") return args.parentGamerBuilder?.() ?? {};
    return {};
  });
}

/** Direct parent_gamer link check: .select('id').eq().eq().maybeSingle() */
function linkLookup(linked: boolean) {
  return () => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue(linked ? mockSupabaseSuccess({ id: "link-1" }) : mockSupabaseSuccess(null)),
        }),
      }),
    }),
  });
}

/** Sibling check: .select('parent_id, gamer_id').in('gamer_id', [...]) */
function siblingLookup(rows: Array<{ parent_id: string; gamer_id: string }>) {
  return () => ({
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue(mockSupabaseSuccess(rows)),
    }),
  });
}

function mockHappyPathSession(email: string) {
  mockAdminGenerateLink.mockResolvedValue({
    data: { properties: { email_otp: "123456" } },
    error: null,
  });
  mockVerifyOtp.mockResolvedValue({
    data: { session: { access_token: "new-token" } },
    error: null,
  });
  if (email.includes("@gamer.sogverse.internal")) {
    // Synthetic email — getUserById not called
    return;
  }
  mockAdminGetUserById.mockResolvedValue({
    data: { user: { id: "target", email } },
    error: null,
  });
}

const PARENT_A = "parent-a";
const PARENT_B = "parent-b";
const GAMER_A1 = "gamer-a1";
const GAMER_A2 = "gamer-a2";
const GAMER_B1 = "gamer-b1";

// --- Tests ---

describe("POST /api/auth/switch-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  describe("authentication & input validation", () => {
    it("returns 401 when not authenticated", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(401);
    });

    it("returns 403 when caller is admin or gedu (requireRole gates roles)", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(403);
    });

    it("requireRole is called with both customer and gamer roles", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({ target: null });

      await POST(createRequest({ userId: GAMER_A1 }));
      expect(mockRequireRole).toHaveBeenCalledWith(["customer", "gamer"], { allowUnverified: true });
    });

    it("returns 400 when body is invalid JSON", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest("not-json"));
      expect(response.status).toBe(400);
    });

    it("returns 400 when userId is missing", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest({}));
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe("userId is required");
    });

    it("returns 400 when userId is the caller itself", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe("Cannot switch to yourself");
    });
  });

  describe("target lookup", () => {
    it("returns 403 when target profile does not exist", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({ target: null });

      const response = await POST(createRequest({ userId: "ghost" }));
      expect(response.status).toBe(403);
      // No session mutation
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("parent → gamer", () => {
    it("allows parent to switch to their own linked gamer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", username: "alphaone" },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession("alphaone@gamer.sogverse.internal");

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSignOut).toHaveBeenCalledOnce();
      expect(mockAdminGenerateLink).toHaveBeenCalledWith({
        type: "magiclink",
        email: "alphaone@gamer.sogverse.internal",
      });
    });

    it("forbids parent from switching to a different parent's gamer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_B1, role: "gamer", username: "betaone" },
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: GAMER_B1 }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("forbids parent from switching to another customer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: PARENT_B, role: "customer", username: null },
        // parent_gamer should not even be checked when target role is wrong;
        // but if it were, configure as not-linked to be safe.
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: PARENT_B }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("forbids parent from switching to admin/gedu account", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: "admin-1", role: "admin", username: null },
      });

      const response = await POST(createRequest({ userId: "admin-1" }));
      expect(response.status).toBe(403);
    });
  });

  describe("gamer → parent", () => {
    it("allows gamer to switch to their own linked parent", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", username: null },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession("parent-a@example.com");

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdminGetUserById).toHaveBeenCalledWith(PARENT_A);
      expect(mockAdminGenerateLink).toHaveBeenCalledWith({
        type: "magiclink",
        email: "parent-a@example.com",
      });
    });

    it("forbids gamer from switching to an unrelated parent", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: PARENT_B, role: "customer", username: null },
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: PARENT_B }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("gamer → sibling", () => {
    it("allows sibling switch when both gamers share a parent", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", username: "alphatwo" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
      });
      mockHappyPathSession("alphatwo@gamer.sogverse.internal");

      const response = await POST(createRequest({ userId: GAMER_A2 }));
      expect(response.status).toBe(200);
    });

    it("forbids sibling switch when gamers belong to different parents", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: GAMER_B1, role: "gamer", username: "betaone" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_B, gamer_id: GAMER_B1 },
        ]),
      });

      const response = await POST(createRequest({ userId: GAMER_B1 }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("allows sibling switch even if siblings share only one of multiple parents (multi-parent family)", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", username: "alphatwo" },
        parentGamerBuilder: siblingLookup([
          // GAMER_A1 has both PARENT_A and PARENT_B as parents
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_B, gamer_id: GAMER_A1 },
          // GAMER_A2 only has PARENT_A — still in the family
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
      });
      mockHappyPathSession("alphatwo@gamer.sogverse.internal");

      const response = await POST(createRequest({ userId: GAMER_A2 }));
      expect(response.status).toBe(200);
    });
  });

  describe("session mutation failures", () => {
    it("returns 500 when generateLink fails — does NOT sign out the caller", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", username: "alphaone" },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGenerateLink.mockResolvedValue({
        data: null,
        error: { message: "boom" },
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("returns 500 when verifyOtp fails (sign-out was already called)", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", username: "alphaone" },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGenerateLink.mockResolvedValue({
        data: { properties: { email_otp: "123456" } },
        error: null,
      });
      mockVerifyOtp.mockResolvedValue({
        data: { session: null },
        error: { message: "OTP invalid" },
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    it("returns 500 when target gamer has no username (misconfigured)", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", username: null },
        parentGamerBuilder: linkLookup(true),
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      const data = await response.json();
      expect(response.status).toBe(500);
      expect(data.error).toBe("Gamer account is not properly configured");
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("returns 500 when parent email lookup fails", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", username: null },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGetUserById.mockResolvedValue({
        data: { user: null },
        error: { message: "User not found" },
      });

      const response = await POST(createRequest({ userId: PARENT_A }));
      expect(response.status).toBe(500);
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("admin client lookup errors", () => {
    it("returns 500 when target profile lookup throws a database error", async () => {
      mockAuthenticated("customer", PARENT_A);
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue(mockSupabaseError("DB exploded", "PG500")),
              }),
            }),
          };
        }
        return {};
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
    });
  });
});
