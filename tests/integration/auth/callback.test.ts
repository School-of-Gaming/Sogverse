import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/auth/callback/route";

// --- Mocks ---

const mockExchangeCodeForSession = vi.fn();
const mockGetClaims = vi.fn();
const mockSignOut = vi.fn();
const mockProfileQuery = vi.fn();
/** The columns the route asked `profiles` for, as one string. */
const mockProfileSelect = vi.fn<(columns: string) => void>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getClaims: mockGetClaims,
      signOut: mockSignOut,
    },
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        mockProfileSelect(columns);
        return {
          eq: vi.fn(() => ({
            single: mockProfileQuery,
          })),
        };
      }),
    })),
  })),
}));

// --- Helpers ---

const SITE_URL = "https://sogverse.example";

function createCallbackRequest(
  params: Record<string, string> = {},
  { host = "localhost:3000" }: { host?: string } = {},
): Request {
  const url = new URL(`http://${host}/api/auth/callback`);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return new Request(url.toString(), { headers: { host } });
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  if (!location) throw new Error("No Location header on response");
  return new URL(location);
}

/** Where the redirect goes, as a path plus query. */
function destination(response: Response): string {
  const url = getRedirectUrl(response);
  return `${url.pathname}${url.search}`;
}

/** A successful exchange for an account whose profile reads as given. */
function signedInAs(profile: Record<string, unknown> | null) {
  mockExchangeCodeForSession.mockResolvedValue({ error: null });
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: "user-123" } },
  });
  mockProfileQuery.mockResolvedValue({ data: profile, error: null });
}

/** A customer who has finished registering. */
const COMPLETED = "2026-09-01T12:00:00Z";

// --- Tests ---

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the origin", () => {
    it("keeps a trusted host", async () => {
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(getRedirectUrl(response).origin).toBe("http://localhost:3000");
    });

    it("falls back to the site URL for a spoofed host", async () => {
      // The Host header is the attacker's to choose; `getOrigin` refuses one
      // it does not trust rather than bouncing the session somewhere else.
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({ code: "valid-code" }, { host: "evil.example" }),
      );

      expect(getRedirectUrl(response).origin).toBe(SITE_URL);
    });
  });

  describe("errors from the provider", () => {
    it("tells a cancelled consent screen apart", async () => {
      const response = await GET(
        createCallbackRequest({ error: "access_denied" }),
      );

      expect(response.status).toBe(307);
      expect(destination(response)).toBe("/login?error=oauth_cancelled");
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("reports any other provider error generically", async () => {
      const response = await GET(
        createCallbackRequest({ error: "server_error", code: "valid-code" }),
      );

      expect(destination(response)).toBe("/login?error=auth_callback_error");
      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  it("redirects to login error when no code param", async () => {
    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(destination(response)).toBe("/login?error=auth_callback_error");
  });

  it("redirects to login error when exchangeCodeForSession fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    });

    const response = await GET(
      createCallbackRequest({ code: "invalid-code" })
    );

    expect(response.status).toBe(307);
    expect(destination(response)).toBe("/login?error=auth_callback_error");
  });

  it("redirects to login error when the session has no claims", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({ data: null });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(destination(response)).toBe("/login?error=auth_callback_error");
  });

  describe("a gamer account", () => {
    it("is signed out again and refused", async () => {
      signedInAs({ role: "gamer", registration_completed_at: COMPLETED });

      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      // Only this session: the gamer's sign-ins elsewhere did nothing wrong.
      expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
      expect(destination(response)).toBe("/login?error=google_gamer");
    });

    it("is refused even with an allowed next", async () => {
      signedInAs({ role: "gamer", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({ code: "valid-code", next: "/shop/abc-123" }),
      );

      expect(destination(response)).toBe("/login?error=google_gamer");
    });
  });

  describe("a customer who has not finished registering", () => {
    beforeEach(() => {
      signedInAs({ role: "customer", registration_completed_at: null });
    });

    it("goes to the finish page when no next was sent", async () => {
      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(destination(response)).toBe("/complete-registration");
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("keeps the locale the register page sent", async () => {
      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "/fi/complete-registration",
        }),
      );

      expect(destination(response)).toBe("/fi/complete-registration");
    });

    it("carries the Gedu variant only when next asked for it", async () => {
      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "/sv/complete-registration?as=gedu&extra=1",
        }),
      );

      expect(destination(response)).toBe("/sv/complete-registration?as=gedu");
    });

    // The Google round trip unloads the tab that held the landing link's
    // attribution in memory, so the register page puts it on `next` and the
    // callback carries it onto the finish page — sanitised, and nothing else.
    it("carries the landing link's attribution, sanitised", async () => {
      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "/fi/complete-registration?utm_source=Lynx&utm_medium=%3Dformula&utm_campaign=lynx-summer-a&extra=1",
        }),
      );

      expect(destination(response)).toBe(
        "/fi/complete-registration?utm_source=Lynx&utm_campaign=lynx-summer-a",
      );
    });

    it("puts the Gedu variant ahead of the attribution", async () => {
      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "/complete-registration?utm_campaign=recruit&as=gedu",
        }),
      );

      expect(destination(response)).toBe(
        "/complete-registration?as=gedu&utm_campaign=recruit",
      );
    });

    it("ignores any other next", async () => {
      const response = await GET(
        createCallbackRequest({ code: "valid-code", next: "/shop/abc-123" }),
      );

      expect(destination(response)).toBe("/complete-registration");
    });
  });

  describe("an account that has finished registering", () => {
    it("routes a customer to the family selector", async () => {
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(response.status).toBe(307);
      expect(destination(response)).toBe("/select-profile");
    });

    it.each([
      ["admin", "/admin"],
      ["gedu", "/gedu"],
    ])("routes a %s to their dashboard", async (role, path) => {
      signedInAs({ role, registration_completed_at: COMPLETED });

      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(destination(response)).toBe(path);
    });

    it("routes by the customer default when there is no profile", async () => {
      signedInAs(null);

      const response = await GET(createCallbackRequest({ code: "valid-code" }));

      expect(destination(response)).toBe("/select-profile");
    });

    it("honours an allowlisted product-page next", async () => {
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({ code: "valid-code", next: "/fi/kauppa/abc-123" }),
      );

      expect(destination(response)).toBe("/fi/kauppa/abc-123");
    });

    it("ignores a next outside the allowlist", async () => {
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({ code: "valid-code", next: "/admin" }),
      );

      expect(destination(response)).toBe("/select-profile");
    });

    it("ignores an off-site next", async () => {
      signedInAs({ role: "customer", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "//evil.example/shop/abc",
        }),
      );

      expect(getRedirectUrl(response).origin).toBe("http://localhost:3000");
      expect(destination(response)).toBe("/select-profile");
    });

    it("skips the finish page it no longer needs", async () => {
      // An existing account pressing a register page's Google button sends
      // the finish page as `next`; it has nothing left to finish.
      signedInAs({ role: "gedu", registration_completed_at: COMPLETED });

      const response = await GET(
        createCallbackRequest({
          code: "valid-code",
          next: "/en/complete-registration?as=gedu",
        }),
      );

      expect(destination(response)).toBe("/gedu");
    });
  });

  /**
   * **A completed OAuth sign-in seeds the `locale` cookie from the profile.**
   * The redirect above goes to a bare path, which the proxy resolves by the
   * cookie → `Accept-Language` → English ladder — so a Finnish reader signing
   * in on a fresh device lands on `/fi/parent` only because this response
   * carried their stored language with it.
   */
  describe("the locale cookie", () => {
    function signedInWithLocale(locale: string | null) {
      signedInAs({
        role: "customer",
        locale,
        registration_completed_at: COMPLETED,
      });
      return GET(createCallbackRequest({ code: "valid-code" }));
    }

    it("carries the profile's locale on the redirect", async () => {
      const response = await signedInWithLocale("fi");

      expect(response.headers.get("set-cookie")).toContain("locale=fi");
    });

    it("writes nothing when the profile says auto-detect", async () => {
      // Null means "follow the browser", and the ladder's header leg is
      // exactly that. Writing a guess here would freeze it into a preference
      // the reader never expressed.
      const response = await signedInWithLocale(null);

      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("ignores a stored value we do not ship", async () => {
      // The column is plain nullable text, so a value can outlive the locale
      // it named; writing it would put a segment in the URL that resolves to
      // no locale at all.
      const response = await signedInWithLocale("de");

      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("reads it on the profile query the route already made", async () => {
      // No second round trip: `locale` and the registration stamp join the
      // select that resolves the post-login destination.
      await signedInWithLocale("fi");

      expect(mockProfileSelect).toHaveBeenCalledWith(
        "role, locale, registration_completed_at",
      );
    });
  });
});
