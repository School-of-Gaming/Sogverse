import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/switch-to-gamer/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminGenerateLink = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockAdminGenerateLink(...args),
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

// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/auth/switch-to-gamer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { id: userId, role: "customer", first_name: "Parent" },
    supabase: { auth: { signOut: mockSignOut } },
  });
}

function mockParentGamerLink(found: boolean) {
  const maybeSingle = vi.fn().mockResolvedValue(
    found
      ? mockSupabaseSuccess({ id: "link-1" })
      : mockSupabaseSuccess(null),
  );
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });

  return { select, eq1, eq2, maybeSingle };
}

function mockGamerProfile(profile: { role: string; username: string | null } | null) {
  const single = vi.fn().mockResolvedValue(
    profile
      ? mockSupabaseSuccess(profile)
      : mockSupabaseError("Not found", "PGRST116"),
  );
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });

  return { select, eq, single };
}

/** Wire up mockAdminFrom to dispatch per-table mocks */
function setupAdminFrom(
  linkFound: boolean,
  gamerProfile: { role: string; username: string | null } | null,
) {
  const parentGamer = mockParentGamerLink(linkFound);
  const profiles = mockGamerProfile(gamerProfile);

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "parent_gamer") return { select: parentGamer.select };
    if (table === "profiles") return { select: profiles.select };
    return {};
  });

  return { parentGamer, profiles };
}

// --- Tests ---

describe("POST /api/auth/switch-to-gamer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-customer role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    expect(response.status).toBe(403);
  });

  it("returns 400 when gamerId is missing", async () => {
    mockAuthenticated("parent-1");

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("gamerId is required");
  });

  it("returns 403 when parent is not linked to gamer", async () => {
    mockAuthenticated("parent-1");
    setupAdminFrom(false, null);

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 403 when target is not a gamer role", async () => {
    mockAuthenticated("parent-1");
    setupAdminFrom(true, { role: "customer", username: "notgamer" });

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 500 when generateLink fails", async () => {
    mockAuthenticated("parent-1");
    setupAdminFrom(true, { role: "gamer", username: "testgamer" });
    mockAdminGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "Generate failed" },
    });

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to generate session");
    // sign-out should NOT have been called since we failed before session mutation
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("returns 500 when verifyOtp fails (sign-out was still called)", async () => {
    mockAuthenticated("parent-1");
    setupAdminFrom(true, { role: "gamer", username: "testgamer" });
    mockAdminGenerateLink.mockResolvedValue({
      data: { properties: { email_otp: "123456" } },
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "OTP invalid" },
    });

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create gamer session");
    // sign-out WAS called because we got past step 5
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it("returns 200 on happy path with correct flow", async () => {
    mockAuthenticated("parent-1");
    setupAdminFrom(true, { role: "gamer", username: "testgamer" });
    mockAdminGenerateLink.mockResolvedValue({
      data: { properties: { email_otp: "654321" } },
      error: null,
    });
    mockVerifyOtp.mockResolvedValue({
      data: { session: { access_token: "new-token" } },
      error: null,
    });

    const response = await POST(createRequest({ gamerId: "gamer-1" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify the flow order
    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(mockAdminGenerateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "testgamer@gamer.sogverse.internal",
    });
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "testgamer@gamer.sogverse.internal",
      token: "654321",
      type: "magiclink",
    });
  });
});
