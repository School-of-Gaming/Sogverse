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

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mockCookieGet })),
}));

// pin-session reads the secret lazily; set it before importing requireRole.
process.env.PIN_COOKIE_SECRET = "auth-test-pin-secret";

import { requireRole } from "@/lib/auth";
import { pinTokenFor } from "@/lib/pin-session";

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

describe("requireRole parent-PIN gate", () => {
  function mockCustomer() {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "u1", email: "p@test.local", session_id: "s1" } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: { id: "u1", role: "customer" }, error: null });
  }

  it("returns 403 PIN_REQUIRED for a customer with no unlock cookie", async () => {
    mockCustomer();
    mockCookieGet.mockReturnValue(undefined);

    const res = await requireRole("customer");
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(403);
    expect(await (res as NextResponse).json()).toMatchObject({ code: "PIN_REQUIRED" });
  });

  it("returns 403 for a customer whose cookie is bound to a different session", async () => {
    mockCustomer();
    mockCookieGet.mockReturnValue({ value: await pinTokenFor("u1", "other-session") });

    const res = await requireRole("customer");
    expect((res as NextResponse).status).toBe(403);
  });

  it("passes a customer with a valid unlock cookie", async () => {
    mockCustomer();
    mockCookieGet.mockReturnValue({ value: await pinTokenFor("u1", "s1") });

    const res = await requireRole("customer");
    expect(res).not.toBeInstanceOf(NextResponse);
  });

  it("passes a locked customer when allowUnverified is set", async () => {
    mockCustomer();
    mockCookieGet.mockReturnValue(undefined);

    const res = await requireRole("customer", { allowUnverified: true });
    expect(res).not.toBeInstanceOf(NextResponse);
  });

  it("never gates non-customer roles (gamer passes with no cookie)", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "g1", session_id: "s1" } },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: { id: "g1", role: "gamer" }, error: null });
    mockCookieGet.mockReturnValue(undefined);

    const res = await requireRole(["customer", "gamer"]);
    expect(res).not.toBeInstanceOf(NextResponse);
  });
});
