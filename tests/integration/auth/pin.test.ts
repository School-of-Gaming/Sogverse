import { describe, it, expect, vi, beforeEach } from "vitest";

// pin-session reads the secret lazily; set before importing the routes.
process.env.PIN_COOKIE_SECRET = "route-test-pin-secret";
// The forgot route builds the emailed reset link via getOrigin(), which falls
// back to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host (these
// mock requests don't). A fake value keeps the suite hermetic and exercises the
// production-representative path (untrusted Host → canonical origin).
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mockCookieSet, get: mockCookieGet })),
}));

const mockAdminRpc = vi.fn();
// The admin client reads customer_profiles.pin_hash (forgot mints / reset
// verifies the single-use token bound to it). Returns whatever mockPinHash is
// set to for the current test.
const mockPinHash = vi.fn<() => { data: { pin_hash: string | null } | null; error: unknown }>(
  () => ({ data: { pin_hash: null }, error: null }),
);
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mockPinHash() }) }),
    }),
  })),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("@/lib/email-templates/translator", () => ({
  getEmailTranslator: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/email-templates/pin-reset", () => ({
  buildPinResetEmail: vi.fn(() => "<html>pin reset</html>"),
}));

import { POST as verifyPost } from "@/app/api/auth/pin/verify/route";
import { POST as setPost } from "@/app/api/auth/pin/route";
import { POST as forgotPost } from "@/app/api/auth/pin/forgot/route";
import { POST as resetPost } from "@/app/api/auth/pin/reset/route";
import { createPinResetToken, pinTokenFor } from "@/lib/pin-session";
// Mocked above; imported here as a handle to assert the reset-link origin.
import { buildPinResetEmail } from "@/lib/email-templates/pin-reset";

// --- Helpers ---

const mockRpc = vi.fn();
const mockGetClaims = vi.fn();

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function authCustomer(overrides: { email?: string | null } = {}) {
  mockRequireRole.mockResolvedValue({
    user: { id: "u1", email: "p@test.local" },
    profile: {
      id: "u1",
      role: "customer",
      email: overrides.email === undefined ? "p@test.local" : overrides.email,
      locale: "en",
    },
    supabase: { rpc: mockRpc, auth: { getClaims: mockGetClaims } },
  });
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: "u1", session_id: "s1" } },
    error: null,
  });
}

/** Route RPCs are dispatched by name; configure per-name results. */
function setRpc(handlers: Record<string, { data?: unknown; error?: unknown }>) {
  mockRpc.mockImplementation((name: string) =>
    Promise.resolve(handlers[name] ?? { data: null, error: null }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, so restore the default pin_hash read.
  mockPinHash.mockReturnValue({ data: { pin_hash: null }, error: null });
});

// --- /api/auth/pin/verify ---

describe("POST /api/auth/pin/verify", () => {
  it("is reachable while locked (requireRole allowUnverified)", async () => {
    authCustomer();
    setRpc({ verify_my_pin: { data: true, error: null } });
    await verifyPost(request("/api/auth/pin/verify", { pin: "1234" }));
    expect(mockRequireRole).toHaveBeenCalledWith("customer", { allowUnverified: true });
  });

  it("sets the unlock cookie on a correct PIN", async () => {
    authCustomer();
    setRpc({ verify_my_pin: { data: true, error: null } });

    const res = await verifyPost(request("/api/auth/pin/verify", { pin: "1234" }));
    expect(res.status).toBe(200);
    expect(mockCookieSet).toHaveBeenCalledWith("sog_pin_verified", expect.any(String), expect.any(Object));
  });

  it("returns 200 verified:false and sets no cookie on an incorrect PIN", async () => {
    authCustomer();
    setRpc({ verify_my_pin: { data: false, error: null } });

    const res = await verifyPost(request("/api/auth/pin/verify", { pin: "9999" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ verified: false });
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed PIN", async () => {
    authCustomer();
    const res = await verifyPost(request("/api/auth/pin/verify", { pin: "12" }));
    expect(res.status).toBe(400);
  });
});

// --- /api/auth/pin (create / change) ---

describe("POST /api/auth/pin", () => {
  it("creates a PIN when none is set, and unlocks", async () => {
    authCustomer();
    setRpc({ pin_is_set: { data: false, error: null }, set_my_pin: { data: null, error: null } });

    const res = await setPost(request("/api/auth/pin", { pin: "1234" }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_my_pin", { p_pin: "1234" });
    expect(mockCookieSet).toHaveBeenCalled();
  });

  it("refuses to overwrite an existing PIN from a locked session (child-at-gate guard)", async () => {
    authCustomer();
    setRpc({ pin_is_set: { data: true, error: null } });
    mockCookieGet.mockReturnValue(undefined); // no valid unlock cookie

    const res = await setPost(request("/api/auth/pin", { pin: "0000" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PIN_LOCKED" });
    expect(mockRpc).not.toHaveBeenCalledWith("set_my_pin", expect.anything());
  });

  it("changes the PIN when the session is already unlocked", async () => {
    authCustomer();
    setRpc({ pin_is_set: { data: true, error: null }, set_my_pin: { data: null, error: null } });
    // A valid unlock cookie for this (user, session) proves the session is unlocked.
    mockCookieGet.mockReturnValue({ value: await pinTokenFor("u1", "s1") });

    const res = await setPost(request("/api/auth/pin", { pin: "5678" }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_my_pin", { p_pin: "5678" });
  });
});

// --- /api/auth/pin/forgot ---

describe("POST /api/auth/pin/forgot", () => {
  it("emails the reset link to the parent's address", async () => {
    authCustomer();
    const res = await forgotPost(request("/api/auth/pin/forgot", {}));
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ toEmail: "p@test.local" });
  });

  it("succeeds silently when the account has no email on file", async () => {
    authCustomer({ email: null });
    const res = await forgotPost(request("/api/auth/pin/forgot", {}));
    expect(res.status).toBe(200);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // Regression: the emailed link must be built off the trusted origin
  // (getOrigin → canonical NEXT_PUBLIC_SITE_URL here), never the attacker-
  // controllable Host header — otherwise a spoofed Host turns the reset link,
  // which carries a valid token, into a phishing URL.
  it("builds the reset link off the trusted origin, ignoring a spoofed Host", async () => {
    authCustomer();
    // Both the URL and the Host header carry the attacker value, as a genuinely
    // spoofed request would — so this fails if the route ever regresses to
    // either `new URL(request.url).origin` or a raw Host read.
    const spoofed = new Request("https://evil.com/api/auth/pin/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "evil.com" },
      body: "{}",
    });
    await forgotPost(spoofed);

    const link = vi.mocked(buildPinResetEmail).mock.calls[0][1];
    expect(link.startsWith("https://test.sogverse.local")).toBe(true);
    expect(link).not.toContain("evil.com");
  });
});

// --- /api/auth/pin/reset ---

describe("POST /api/auth/pin/reset", () => {
  it("rejects an invalid token and never touches the PIN", async () => {
    const res = await resetPost(request("/api/auth/pin/reset", { token: "bad.token.here", pin: "1234" }));
    expect(res.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("sets the PIN for the token's user via the admin RPC", async () => {
    mockAdminRpc.mockResolvedValue({ error: null });
    mockPinHash.mockReturnValue({ data: { pin_hash: "$2a$06$oldhash" }, error: null });
    const token = await createPinResetToken("reset-user", "$2a$06$oldhash", Date.now());

    const res = await resetPost(request("/api/auth/pin/reset", { token, pin: "4321" }));
    expect(res.status).toBe(200);
    expect(mockAdminRpc).toHaveBeenCalledWith("set_pin_for_user", {
      p_user_id: "reset-user",
      p_pin: "4321",
    });
  });

  it("is single-use: rejects a token once the PIN hash has rotated (replay)", async () => {
    mockAdminRpc.mockResolvedValue({ error: null });
    const token = await createPinResetToken("reset-user", "$2a$06$oldhash", Date.now());

    // First use: stored hash still matches the one the token was minted against.
    mockPinHash.mockReturnValue({ data: { pin_hash: "$2a$06$oldhash" }, error: null });
    expect((await resetPost(request("/api/auth/pin/reset", { token, pin: "4321" }))).status).toBe(200);

    // Replay: the reset rotated pin_hash, so the same token no longer validates.
    mockAdminRpc.mockClear();
    mockPinHash.mockReturnValue({ data: { pin_hash: "$2a$06$NEWhash" }, error: null });
    const replay = await resetPost(request("/api/auth/pin/reset", { token, pin: "0000" }));
    expect(replay.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed PIN", async () => {
    const token = await createPinResetToken("reset-user", "$2a$06$oldhash", Date.now());
    const res = await resetPost(request("/api/auth/pin/reset", { token, pin: "12" }));
    expect(res.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });
});
