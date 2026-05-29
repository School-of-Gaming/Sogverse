// NextResponse.next() checks `request.headers instanceof Headers`. Under jsdom,
// Headers is a polyfill that fails the instanceof check against Node's native
// Headers, so all proxy calls throw. Using the node environment avoids this.
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// --- Mocks ---

const mockGetClaims = vi.fn();
const mockProfileQuery = vi.fn();
let capturedCookieHandlers: {
  getAll: () => { name: string; value: string }[];
  setAll: (
    cookies: { name: string; value: string; options?: Record<string, unknown> }[]
  ) => void;
} | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (_url: string, _key: string, options: { cookies: typeof capturedCookieHandlers }) => {
      capturedCookieHandlers = options.cookies;
      return {
        auth: { getClaims: mockGetClaims },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockProfileQuery,
            })),
          })),
        })),
      };
    }
  ),
}));

// --- Helpers ---

function createNextRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

function mockUser(role: string) {
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: "test-user-id" } },
    error: null,
  });
  mockProfileQuery.mockResolvedValue({
    data: { role },
    error: null,
  });
}

function mockNoUser() {
  mockGetClaims.mockResolvedValue({
    data: null,
    error: null,
  });
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  if (!location) throw new Error("No Location header on response");
  return new URL(location);
}

// --- Tests ---

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCookieHandlers = null;
  });

  // --- Public routes ---

  describe("public routes (pass through regardless of auth)", () => {
    it.each(["/", "/clubs", "/clubs/some-club-id", "/api/some-endpoint"])(
      "passes through %s without auth",
      async (path) => {
        mockNoUser();
        const response = await proxy(createNextRequest(path));
        expect(response.status).toBe(200);
      }
    );
  });

  // --- Auth routes (unauthenticated → allow) ---

  describe("auth routes (unauthenticated)", () => {
    it.each(["/login", "/register", "/forgot-password"])(
      "passes through %s when not logged in",
      async (path) => {
        mockNoUser();
        const response = await proxy(createNextRequest(path));
        expect(response.status).toBe(200);
      }
    );
  });

  // --- Auth routes (authenticated → redirect to dashboard) ---

  describe("auth routes (authenticated)", () => {
    it("redirects customer from /login to /parent", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent");
    });

    it("redirects admin from /login to /admin", async () => {
      mockUser("admin");
      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/admin");
    });

    it("redirects gedu from /register to /gedu", async () => {
      mockUser("gedu");
      const response = await proxy(createNextRequest("/register"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/gedu");
    });

    it("redirects gamer from /login to /gamer", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/gamer");
    });
  });

  // --- Protected routes (unauthenticated → login with redirect) ---

  describe("protected routes (unauthenticated)", () => {
    it("redirects /admin to /login with redirect param", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("redirect")).toBe("/admin");
    });

    it("redirects /parent/purchases to /login with redirect param", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/parent/purchases"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("redirect")).toBe("/parent/purchases");
    });
  });

  // --- Protected routes (correct role → allow) ---

  describe("protected routes (correct role)", () => {
    it.each([
      ["/admin", "admin"],
      ["/parent", "customer"],
      ["/gamer", "gamer"],
      ["/gedu", "gedu"],
    ])("allows %s for %s role", async (path, role) => {
      mockUser(role);
      const response = await proxy(createNextRequest(path));
      expect(response.status).toBe(200);
    });
  });

  // --- Protected routes (wrong role → redirect to correct dashboard) ---

  describe("protected routes (wrong role)", () => {
    it("redirects customer from /admin to /parent", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent");
    });

    it("redirects admin from /parent to /admin", async () => {
      mockUser("admin");
      const response = await proxy(createNextRequest("/parent"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/admin");
    });

    it("redirects gamer from /gedu to /gamer", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/gedu"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/gamer");
    });
  });

  // --- Preview routes (admin-only mock UI under (public) layout) ---

  describe("preview routes", () => {
    it("allows admin to access /preview/products-v2/...", async () => {
      mockUser("admin");
      const response = await proxy(
        createNextRequest("/preview/products-v2/consumer_club/open"),
      );
      expect(response.status).toBe(200);
    });

    it("redirects customer from /preview/... to /parent", async () => {
      mockUser("customer");
      const response = await proxy(
        createNextRequest("/preview/products-v2/consumer_club/open"),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent");
    });

    it("redirects unauthenticated from /preview/... to /login", async () => {
      mockNoUser();
      const response = await proxy(
        createNextRequest("/preview/products-v2/consumer_club/open"),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/login");
    });
  });

  // --- Settings (shared protected route) ---

  describe("settings route", () => {
    it("allows admin to access /settings", async () => {
      mockUser("admin");
      const response = await proxy(createNextRequest("/settings"));
      expect(response.status).toBe(200);
    });

    it("allows gamer to access /settings", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/settings"));
      expect(response.status).toBe(200);
    });

    it("redirects unauthenticated from /settings to /login", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/settings"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("redirect")).toBe("/settings");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    it("redirects to /login when authenticated but no profile row", async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: "test-user-id" } },
        error: null,
      });
      mockProfileQuery.mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });

      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/login");
    });

    it("passes through auth route when authenticated but profile query fails", async () => {
      mockGetClaims.mockResolvedValue({
        data: { claims: { sub: "test-user-id" } },
        error: null,
      });
      mockProfileQuery.mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      });

      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(200);
    });

    it("preserves refreshed auth cookies on redirect responses", async () => {
      // Simulate Supabase SSR refreshing tokens during getClaims — its internal
      // getSession() refreshes a near-expiry token and writes new cookies.
      mockGetClaims.mockImplementation(async () => {
        capturedCookieHandlers!.setAll([
          { name: "sb-access-token", value: "new-access", options: { path: "/" } },
          { name: "sb-refresh-token", value: "new-refresh", options: { path: "/" } },
        ]);
        return { data: null, error: null };
      });

      const response = await proxy(createNextRequest("/admin"));

      expect(response.status).toBe(307);
      const cookies = response.cookies.getAll();
      expect(cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "sb-access-token", value: "new-access" }),
          expect.objectContaining({ name: "sb-refresh-token", value: "new-refresh" }),
        ])
      );
    });
  });
});
