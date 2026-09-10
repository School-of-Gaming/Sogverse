import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/auth/callback/route";

// --- Mocks ---

const mockExchangeCodeForSession = vi.fn();
const mockGetClaims = vi.fn();
const mockProfileQuery = vi.fn();
/** The columns the route asked `profiles` for, as one string. */
const mockProfileSelect = vi.fn<(columns: string) => void>();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getClaims: mockGetClaims,
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

function createCallbackRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/auth/callback");
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return new Request(url.toString());
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  if (!location) throw new Error("No Location header on response");
  return new URL(location);
}

// --- Tests ---

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login error when no code param", async () => {
    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });

  it("redirects to login error when exchangeCodeForSession fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    });

    const response = await GET(
      createCallbackRequest({ code: "invalid-code" })
    );

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });

  it("redirects to /select-profile for customer role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "customer" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/select-profile");
  });

  it("redirects to /admin for admin role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/admin");
  });

  it("redirects to /gedu for gedu role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "gedu" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/gedu");
  });

  it("redirects to /gamer for gamer role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "gamer" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/gamer");
  });

  it("redirects to /select-profile when profile is null (fallback)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({ data: null, error: null });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/select-profile");
  });

  it("redirects to next param when set", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-123" } },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "customer" },
      error: null,
    });

    const response = await GET(
      createCallbackRequest({ code: "valid-code", next: "/some-page" })
    );

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/some-page");
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
      mockExchangeCodeForSession.mockResolvedValue({ error: null });
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: "user-123" } },
      });
      mockProfileQuery.mockResolvedValue({
        data: { role: "customer", locale },
        error: null,
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
      // No second round trip: `locale` joins the select that resolves the
      // post-login destination.
      await signedInWithLocale("fi");

      expect(mockProfileSelect).toHaveBeenCalledWith("role, locale");
    });
  });

  it("redirects to login error when the session has no claims", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetClaims.mockResolvedValue({ data: null });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });
});
