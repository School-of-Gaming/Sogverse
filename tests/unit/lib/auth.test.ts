import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// requireRole verifies identity via `supabase.auth.getClaims()` (local ES256
// JWKS verification — see docs/architecture/performance.md) and derives the user id from
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

import { readSessionProvenance, requireRole } from "@/lib/auth";
import {
  FAMILY_SESSION_COOKIE_NAME,
  mintFamilySessionToken,
  pinTokenFor,
} from "@/lib/pin-session";

/**
 * Narrow requireRole's union result to its error branch. instanceof is the
 * honest runtime check — the success side is a plain object, never a
 * NextResponse — so a wrong branch fails the test loudly instead of slipping
 * through a cast.
 */
function expectResponse(res: unknown): NextResponse {
  if (!(res instanceof NextResponse)) {
    throw new Error("expected a NextResponse");
  }
  return res;
}

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
    expect(expectResponse(res).status).toBe(401);
  });

  it("returns 401 when the token carries no subject", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const res = await requireRole("admin");
    expect(expectResponse(res).status).toBe(401);
  });

  it("returns 500 when the profile lookup fails", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    mockSingle.mockResolvedValue({ data: null, error: new Error("db down") });
    const res = await requireRole("admin");
    expect(expectResponse(res).status).toBe(500);
  });

  it("returns 403 when the role is not allowed", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { id: "u1", role: "gamer" }, error: null });
    const res = await requireRole("admin");
    expect(expectResponse(res).status).toBe(403);
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
    expect(expectResponse(res).status).toBe(403);
    expect(await expectResponse(res).json()).toMatchObject({ code: "PIN_REQUIRED" });
  });

  it("returns 403 for a customer whose cookie is bound to a different session", async () => {
    mockCustomer();
    mockCookieGet.mockReturnValue({ value: await pinTokenFor("u1", "other-session") });

    const res = await requireRole("customer");
    expect(expectResponse(res).status).toBe(403);
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

/**
 * The one place a session is classified, and the reason it is a function rather
 * than a claim read: `family` means "the switch route minted a marker for THIS
 * session", and nothing about the token can say that. A password-recovery
 * session carries `otp` in its `amr` exactly as a switch-created one does, so a
 * caller that trusted the claim — or merely checked the cookie's presence —
 * would hand a child a PIN-only path into their parent's account.
 */
describe("readSessionProvenance", () => {
  const CLAIMS = { sub: "g1", session_id: "s1", amr: [{ method: "otp" }] };

  function cookieHolding(value: string | undefined) {
    return {
      get: (name: string) =>
        name === FAMILY_SESSION_COOKIE_NAME && value !== undefined
          ? { value }
          : undefined,
    };
  }

  it("is `family` for a session the switch route marked", async () => {
    const marker = await mintFamilySessionToken("g1", "s1");
    expect(
      await readSessionProvenance({ claims: CLAIMS, cookies: cookieHolding(marker) }),
    ).toBe("family");
  });

  it("is `own` for an otp session with no marker", async () => {
    // The recovery case: the same `amr`, and no mint. It costs the target's
    // password rather than four digits.
    expect(
      await readSessionProvenance({
        claims: CLAIMS,
        cookies: cookieHolding(undefined),
      }),
    ).toBe("own");
  });

  it("is `own` when the marker belongs to a session that has been replaced", async () => {
    const marker = await mintFamilySessionToken("g1", "previous-session");
    expect(
      await readSessionProvenance({ claims: CLAIMS, cookies: cookieHolding(marker) }),
    ).toBe("own");
  });

  it("is `own` when the marker belongs to somebody else", async () => {
    const marker = await mintFamilySessionToken("g2", "s1");
    expect(
      await readSessionProvenance({ claims: CLAIMS, cookies: cookieHolding(marker) }),
    ).toBe("own");
  });

  it("is `own` for a forged marker", async () => {
    expect(
      await readSessionProvenance({
        claims: CLAIMS,
        cookies: cookieHolding("f".repeat(64)),
      }),
    ).toBe("own");
  });

  it("is `own` for a token carrying no session_id", async () => {
    // The guard lives here rather than in each caller so the API gates and the
    // server component that seeds the profile grid cannot answer the same
    // session differently. A marker binds a session id; with no id there is
    // nothing to validate one against, so the answer is the stronger gate.
    const marker = await mintFamilySessionToken("g1", "s1");
    expect(
      await readSessionProvenance({
        claims: { sub: "g1", amr: [{ method: "otp" }] },
        cookies: cookieHolding(marker),
      }),
    ).toBe("own");
  });

  it("is `own` when the marker cannot be validated at all", async () => {
    // This runs on every gated request, so a missing PIN_COOKIE_SECRET would
    // otherwise turn one misconfiguration into a 500 on every request a marked
    // session makes. It answers the stronger gate instead — the failure is
    // loud in the logs and cannot hand anybody the cheaper one.
    const marker = await mintFamilySessionToken("g1", "s1");
    const secret = process.env.PIN_COOKIE_SECRET;
    delete process.env.PIN_COOKIE_SECRET;
    try {
      expect(
        await readSessionProvenance({ claims: CLAIMS, cookies: cookieHolding(marker) }),
      ).toBe("own");
    } finally {
      process.env.PIN_COOKIE_SECRET = secret;
    }
  });

  it("is `own` for a password session even holding a valid marker", async () => {
    // Unreachable today — a password sign-in mints a new session id and only the
    // switch route mints markers — and asserted anyway, because it is the guard
    // against a future mint site looser than that one.
    const marker = await mintFamilySessionToken("g1", "s1");
    expect(
      await readSessionProvenance({
        claims: { ...CLAIMS, amr: [{ method: "password" }] },
        cookies: cookieHolding(marker),
      }),
    ).toBe("own");
  });
});

describe("requireRole certified-gedu gate", () => {
  // The route handlers mock requireRole wholesale, so this is the only coverage
  // of the uncertified-gedu boundary's actual 403/500 logic. requireRole reads
  // two rows for a gedu under the gate: the profile, then
  // gedu_profiles.certified — both go through the same mocked
  // from→select→eq→single chain, so the two `mockSingle` results are sequenced
  // with mockResolvedValueOnce.
  function gedu(sub = "ed1") {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub } }, error: null });
  }

  it("passes a certified gedu when requireCertifiedGedu is set", async () => {
    gedu();
    mockSingle
      .mockResolvedValueOnce({ data: { id: "ed1", role: "gedu" }, error: null })
      .mockResolvedValueOnce({ data: { certified: true }, error: null });

    const res = await requireRole(["admin", "gedu"], { requireCertifiedGedu: true });
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(mockFrom).toHaveBeenCalledWith("gedu_profiles");
    expect(mockEq).toHaveBeenCalledWith("user_id", "ed1");
  });

  it("returns 403 GEDU_UNCERTIFIED for an uncertified gedu", async () => {
    gedu();
    mockSingle
      .mockResolvedValueOnce({ data: { id: "ed1", role: "gedu" }, error: null })
      .mockResolvedValueOnce({ data: { certified: false }, error: null });

    const res = await requireRole(["admin", "gedu"], { requireCertifiedGedu: true });
    expect(expectResponse(res).status).toBe(403);
    expect(await expectResponse(res).json()).toMatchObject({ code: "GEDU_UNCERTIFIED" });
  });

  it("returns 500 when the gedu_profiles lookup errors", async () => {
    gedu();
    mockSingle
      .mockResolvedValueOnce({ data: { id: "ed1", role: "gedu" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("db down") });

    const res = await requireRole(["admin", "gedu"], { requireCertifiedGedu: true });
    expect(expectResponse(res).status).toBe(500);
  });

  it("does not gate a gedu when requireCertifiedGedu is not set (no second lookup)", async () => {
    gedu();
    mockSingle.mockResolvedValue({ data: { id: "ed1", role: "gedu" }, error: null });

    const res = await requireRole(["admin", "gedu"]);
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(mockFrom).not.toHaveBeenCalledWith("gedu_profiles");
  });

  it("never gates an admin, even with requireCertifiedGedu set (no gedu lookup)", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: "a1" } }, error: null });
    mockSingle.mockResolvedValue({ data: { id: "a1", role: "admin" }, error: null });

    const res = await requireRole(["admin", "gedu"], { requireCertifiedGedu: true });
    expect(res).not.toBeInstanceOf(NextResponse);
    expect(mockFrom).not.toHaveBeenCalledWith("gedu_profiles");
  });
});
