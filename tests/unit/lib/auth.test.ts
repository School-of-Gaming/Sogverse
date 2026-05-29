import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// requireRole verifies identity via `supabase.auth.getClaims()` (local ES256
// JWKS verification — see docs/performance.md) and derives the user id from
// `claims.sub`. These tests mock the server client to pin that contract; every
// *route* test mocks requireRole wholesale, so this is the only coverage of
// requireRole's real body.
const mockGetClaims = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockClient = {
  auth: { getClaims: mockGetClaims },
  from: mockFrom,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockClient),
}));

import { requireRole } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireRole", () => {
  it("does not call getUser() — verifies via getClaims()", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { id: "u1", role: "admin" }, error: null });
    await requireRole("admin");
    expect(mockGetClaims).toHaveBeenCalledTimes(1);
    expect("getUser" in mockClient.auth).toBe(false);
  });

  it("returns 401 when getClaims errors", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error("invalid token") });
    const res = await requireRole("admin");
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 401 when the token carries no subject", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const res = await requireRole("admin");
    expect((res as NextResponse).status).toBe(401);
  });

  it("returns 500 when the profile lookup fails", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    mockSingle.mockResolvedValue({ data: null, error: new Error("db down") });
    const res = await requireRole("admin");
    expect((res as NextResponse).status).toBe(500);
  });

  it("returns 403 when the role is not allowed", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { id: "u1", role: "gamer" }, error: null });
    const res = await requireRole("admin");
    expect((res as NextResponse).status).toBe(403);
  });

  it("returns user (id from claims.sub) + profile on the happy path", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "u1", email: "admin@test.local" } },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: { id: "u1", role: "admin", first_name: "Ada" },
      error: null,
    });

    const res = await requireRole(["admin", "gedu"]);

    expect(res).not.toBeInstanceOf(NextResponse);
    if (res instanceof NextResponse) throw new Error("expected success");
    expect(res.user.id).toBe("u1");
    expect(res.user.email).toBe("admin@test.local");
    expect(res.profile.role).toBe("admin");
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
  });
});
