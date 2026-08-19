// NextResponse.next() checks `request.headers instanceof Headers`. Under jsdom,
// Headers is a polyfill that fails the instanceof check against Node's native
// Headers, so all proxy calls throw. Using the node environment avoids this.
// @vitest-environment node
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// pin-session reads PIN_COOKIE_SECRET lazily, so setting it before importing the
// proxy is enough for the HMAC unlock-token helpers used below.
process.env.PIN_COOKIE_SECRET = "test-pin-cookie-secret";

import { proxy } from "@/proxy";
import { PIN_COOKIE_NAME, pinTokenFor } from "@/lib/pin-session";

const TEST_USER_ID = "test-user-id";
const TEST_SESSION_ID = "test-session-id";

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

function createNextRequest(
  pathname: string,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const headers = { ...(cookie ? { cookie } : {}), ...extraHeaders };
  return new NextRequest(new URL(pathname, "http://localhost:3000"), {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

function mockUser(role: string) {
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: TEST_USER_ID, session_id: TEST_SESSION_ID } },
    error: null,
  });
  mockProfileQuery.mockResolvedValue({
    data: { role },
    error: null,
  });
}

// A request carrying a valid parent-PIN unlock cookie for the test customer —
// i.e. an UNLOCKED customer session (the normal state after entering the PIN).
async function unlockedCustomerRequest(pathname: string): Promise<NextRequest> {
  const token = await pinTokenFor(TEST_USER_ID, TEST_SESSION_ID);
  return createNextRequest(pathname, `${PIN_COOKIE_NAME}=${token}`);
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
    it.each(["/", "/shop", "/shop/some-product-id", "/api/some-endpoint"])(
      "passes through %s without auth",
      async (path) => {
        mockNoUser();
        const response = await proxy(createNextRequest(path));
        expect(response.status).toBe(200);
      }
    );
  });

  // --- (public) route-group ⇄ proxy PUBLIC_ROUTES drift guard ---
  //
  // A page lives in the `src/app/(public)` route group to declare itself
  // public, but the proxy gates by URL via its hand-maintained PUBLIC_ROUTES
  // array — the route group means nothing to it. The two drift silently: add a
  // page under (public) and forget to register its path, and it ships behind
  // the auth gate (the /schools regression, and not the first). This test
  // derives every (public) page's URL from the filesystem and asserts the
  // proxy passes an unauthenticated request through, so the next forgotten
  // registration fails CI instead of reaching production.
  //
  // Intentional exceptions live in PUBLIC_GROUP_CARVE_OUTS with their reason.
  // A page that is deliberately auth-gated despite living in (public) belongs
  // there; anything else must be reachable without a session.
  describe("(public) route group is registered as public in the proxy", () => {
    const PUBLIC_GROUP_DIR = join(process.cwd(), "src", "app", "(public)");

    // URL-path prefixes that are in (public) for layout/chrome reasons but are
    // deliberately NOT public — they have their own gate in the proxy.
    const PUBLIC_GROUP_CARVE_OUTS: { prefix: string; reason: string }[] = [
      { prefix: "/preview", reason: "admin-only mock surfaces, gated in the proxy" },
    ];

    function walkPages(dir: string): string[] {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks a fixed in-repo dir (the (public) route group), no external input
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walkPages(full);
        return entry.name === "page.tsx" ? [full] : [];
      });
    }

    // Convert a page.tsx path to the URL the proxy sees: drop route-group dirs
    // (parenthesized), and substitute a concrete value for dynamic segments so
    // the prefix matching in PUBLIC_ROUTES still lines up.
    function toUrlPath(pageFile: string): string {
      const segments = relative(PUBLIC_GROUP_DIR, pageFile)
        .replace(/page\.tsx$/, "")
        .split(/[\\/]/)
        .filter((s) => s && !/^\(.*\)$/.test(s))
        .map((s) => s.replace(/\[(?:\.\.\.)?.+?\]/g, "sample"));
      return "/" + segments.join("/");
    }

    const urls = walkPages(PUBLIC_GROUP_DIR).map(toUrlPath);
    const carvedOut = (url: string) =>
      PUBLIC_GROUP_CARVE_OUTS.some((c) => url === c.prefix || url.startsWith(`${c.prefix}/`));
    const publicUrls = urls.filter((url) => !carvedOut(url));

    it("found the (public) pages on disk", () => {
      // Sanity check so a broken glob doesn't make the suite vacuously pass.
      expect(publicUrls.length).toBeGreaterThan(0);
    });

    it.each(publicUrls)("passes %s through without auth", async (path) => {
      mockNoUser();
      const response = await proxy(createNextRequest(path));
      expect(response.status).toBe(200);
    });
  });

  // --- Auth routes (unauthenticated → allow) ---

  describe("auth routes (unauthenticated)", () => {
    it.each(["/login", "/register", "/register-gedu"])(
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

  // --- Forgot password (public in BOTH auth states) ---
  //
  // /forgot-password is a PUBLIC route, not an auth route, and the distinction
  // is load-bearing in both directions. Signed out, it is the page's main
  // audience — so it must not require a session. Signed in, it is where the
  // dead-link card on /reset-password sends someone whose emailed link expired
  // or was already used, and settings now mails those links to people who are
  // signed in; an auth route would bounce them to their dashboard and leave
  // them with no way to ask for a fresh one. Both halves are pinned, because
  // only the pair says anything: putting the path in neither list passes the
  // second assertion while locking every signed-out visitor out.

  describe("forgot password route", () => {
    it("passes through /forgot-password when not logged in", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/forgot-password"));
      expect(response.status).toBe(200);
    });

    it.each(["admin", "gedu", "gamer"])(
      "does not bounce a signed-in %s away from /forgot-password",
      async (role) => {
        mockUser(role);
        const response = await proxy(createNextRequest("/forgot-password"));
        expect(response.status).toBe(200);
      },
    );

    it("does not bounce an unlocked customer away from /forgot-password", async () => {
      mockUser("customer");
      const response = await proxy(
        await unlockedCustomerRequest("/forgot-password"),
      );
      expect(response.status).toBe(200);
    });
  });

  // --- Home page (authenticated → redirect to dashboard) ---
  // Every signed-in role is bounced off "/" to its own dashboard so the home
  // page isn't a dead-end. Admins are no exception — they go to /admin like
  // everyone else goes to theirs.

  describe("home page (authenticated)", () => {
    it.each([
      ["admin", "/admin"],
      ["gedu", "/gedu"],
      ["gamer", "/gamer"],
    ])("redirects %s from / to %s", async (role, dashboard) => {
      mockUser(role);
      const response = await proxy(createNextRequest("/"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe(dashboard);
    });

    it("redirects an unlocked customer from / to /parent", async () => {
      mockUser("customer");
      const response = await proxy(await unlockedCustomerRequest("/"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent");
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
      ["/gamer", "gamer"],
      ["/gedu", "gedu"],
    ])("allows %s for %s role", async (path, role) => {
      mockUser(role);
      const response = await proxy(createNextRequest(path));
      expect(response.status).toBe(200);
    });

    it("allows /parent for an unlocked customer (valid PIN cookie)", async () => {
      mockUser("customer");
      const response = await proxy(await unlockedCustomerRequest("/parent"));
      expect(response.status).toBe(200);
    });
  });

  // --- Protected routes (wrong role → redirect to correct dashboard) ---

  describe("protected routes (wrong role)", () => {
    it("redirects unlocked customer from /admin to /parent", async () => {
      mockUser("customer");
      const response = await proxy(await unlockedCustomerRequest("/admin"));
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
    it("allows admin to access /preview/products/...", async () => {
      mockUser("admin");
      const response = await proxy(
        createNextRequest("/preview/products/consumer-club"),
      );
      expect(response.status).toBe(200);
    });

    it("redirects unlocked customer from /preview/... to /parent", async () => {
      mockUser("customer");
      const response = await proxy(
        await unlockedCustomerRequest("/preview/products/consumer-club"),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent");
    });

    it("redirects unauthenticated from /preview/... to /login", async () => {
      mockNoUser();
      const response = await proxy(
        createNextRequest("/preview/products/consumer-club"),
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

  // --- Parent-PIN gate ---

  describe("parent PIN gate", () => {
    it("redirects a locked customer from /parent to the unlock gate", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/parent"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/parent/unlock");
      expect(url.searchParams.get("redirect")).toBe("/parent");
    });

    it("gates a locked customer even on a PUBLIC route (/shop)", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/shop"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent/unlock");
    });

    it("gates a locked customer before the wrong-role redirect (/admin → unlock)", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent/unlock");
    });

    it.each([
      "/parent/unlock",
      "/select-profile",
      "/reset-pin",
      "/forgot-password",
      "/reset-password",
    ])(
      "exempts %s so a locked customer is not trapped",
      async (path) => {
        mockUser("customer");
        const response = await proxy(createNextRequest(path));
        expect(response.status).toBe(200);
      },
    );

    // The password pages are exempt for a sharper reason than "not trapped":
    // the bounce carries `?redirect=<pathname>`, and a pathname has no query
    // string, so gating /reset-password silently drops the single-use
    // token_hash. The parent would enter their PIN and arrive at a bare reset
    // page that could only tell them the link had expired. Asserting the token
    // is still on the URL the proxy passes through is the half that would
    // survive someone "fixing" this by adding the search string to the
    // redirect instead.
    it("lets a locked customer through to /reset-password with the token intact", async () => {
      mockUser("customer");
      const request = createNextRequest(
        "/reset-password?token_hash=abc123&type=recovery",
      );
      const response = await proxy(request);
      expect(response.status).toBe(200);
      expect(request.nextUrl.searchParams.get("token_hash")).toBe("abc123");
    });

    it("treats a cookie bound to a different session as locked (stale after switch/re-login)", async () => {
      mockUser("customer");
      const staleToken = await pinTokenFor(TEST_USER_ID, "some-other-session");
      const response = await proxy(
        createNextRequest("/parent", `${PIN_COOKIE_NAME}=${staleToken}`),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/parent/unlock");
    });

    it("does not gate non-customer roles (signed-in gamer reaches /shop)", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/shop"));
      expect(response.status).toBe(200);
    });
  });

  // --- Referral attribution (?ref= → x-referral-code) ---
  //
  // The proxy mutates the request headers in place and hands the same request to
  // NextResponse.next(), which is how the root layout sees them — so reading the
  // header back off the request object after the call is reading exactly what
  // the layout would get.

  describe("referral code header", () => {
    function referralHeaderAfter(request: NextRequest) {
      return request.headers.get("x-referral-code");
    }

    it("emits the sanitised code for a ?ref= on the request", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?ref=Paris-Nord");
      await proxy(request);
      expect(referralHeaderAfter(request)).toBe("paris-nord");
    });

    it("emits nothing when there is no ?ref= at all", async () => {
      mockNoUser();
      const request = createNextRequest("/shop");
      await proxy(request);
      expect(referralHeaderAfter(request)).toBeNull();
    });

    it("collapses a repeated ?ref= to absent rather than taking the first", async () => {
      // `?ref=a&ref=b` is not a code. Reading it with `.get()` would silently
      // store the first value, which is how `?ref=good&ref=<junk>` would become
      // an attribution nobody authored.
      mockNoUser();
      const request = createNextRequest("/shop?ref=paris-nord&ref=lyon-sud");
      await proxy(request);
      expect(referralHeaderAfter(request)).toBeNull();
    });

    it("emits nothing for a malformed code", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?ref=%3DSUM(A1)");
      await proxy(request);
      expect(referralHeaderAfter(request)).toBeNull();
    });

    it("deletes a browser-supplied x-referral-code header", async () => {
      // The delete is unconditional and the set is conditional, so a header the
      // client sent itself can never reach the layout unsanitised. Asserting the
      // *deletion* rather than merely "we did not emit one" is the point: a
      // conditional set alone would leave this value in place.
      mockNoUser();
      const request = createNextRequest("/shop", undefined, {
        "x-referral-code": "forged-by-the-client",
      });
      await proxy(request);
      expect(referralHeaderAfter(request)).toBeNull();
    });

    it("overwrites a browser-supplied header with the sanitised param", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?ref=paris-nord", undefined, {
        "x-referral-code": "forged-by-the-client",
      });
      await proxy(request);
      expect(referralHeaderAfter(request)).toBe("paris-nord");
    });

    it("is set above every branch, so a redirecting request still carries it", async () => {
      // The seed runs before the auth, PIN and role branches — including the
      // ones that return early — so no path bypasses it.
      mockUser("admin");
      const request = createNextRequest("/parent?ref=paris-nord");
      const response = await proxy(request);
      expect(response.status).toBe(307);
      expect(referralHeaderAfter(request)).toBe("paris-nord");
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
