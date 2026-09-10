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
import {
  decodeExternalPathname,
  localizeInternalPath,
  normalizeExternalPath,
  toInternalPathname,
} from "@/lib/navigation/locale-path";

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

/** A request for exactly the URL given — no locale prefix added. */
function createBareRequest(
  pathname: string,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const headers = { ...(cookie ? { cookie } : {}), ...extraHeaders };
  return new NextRequest(new URL(pathname, "http://localhost:3000"), {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

/**
 * A request for a page, as a browser inside the app makes it: locale-prefixed.
 *
 * Every page URL carries its locale now, so the prefix is applied here rather
 * than restated in a hundred cases — what those cases are about is the gate,
 * not the language. A path that already carries a prefix is left alone, and so
 * is `/api/*`, which is outside the intl system entirely. Tests about the
 * ladder itself use `createBareRequest`, because a bare path is exactly their
 * subject.
 */
function createNextRequest(
  pathname: string,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): NextRequest {
  const [path, search] = pathname.split("?");
  const url =
    path.startsWith("/api/") || normalizeExternalPath(path).locale !== null
      ? pathname
      : localizeInternalPath(path, "en") + (search ? `?${search}` : "");
  return createBareRequest(url, cookie, extraHeaders);
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
  // A page lives in the `src/app/[locale]/(public)` route group to declare itself
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
    const PUBLIC_GROUP_DIR = join(
      process.cwd(),
      "src",
      "app",
      "[locale]",
      "(public)",
    );

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

    // Convert a page.tsx path to the **internal** pathname: drop route-group
    // dirs (parenthesized), and substitute a concrete value for dynamic
    // segments so the prefix matching in PUBLIC_ROUTES still lines up.
    //
    // The `[locale]` segment is not walked — it is the parent this walk starts
    // under — because substituting a sample value there would test a locale
    // nobody ships. It is put back below, as a real prefix.
    function toInternalPath(pageFile: string): string {
      const segments = relative(PUBLIC_GROUP_DIR, pageFile)
        .replace(/page\.tsx$/, "")
        .split(/[\\/]/)
        .filter((s) => s && !/^\(.*\)$/.test(s))
        .map((s) => s.replace(/\[(?:\.\.\.)?.+?\]/g, "sample"));
      return "/" + segments.join("/");
    }

    const internalPaths = walkPages(PUBLIC_GROUP_DIR).map(toInternalPath);
    const carvedOut = (url: string) =>
      PUBLIC_GROUP_CARVE_OUTS.some((c) => url === c.prefix || url.startsWith(`${c.prefix}/`));
    const publicPaths = internalPaths.filter((url) => !carvedOut(url));

    // **The URL a user actually hits, in one real locale.** The filesystem
    // yields internal segments (`shop`), and asserting on `/fi/shop` would
    // green-light a path nobody can reach — so each page is resolved through
    // the pathnames map to the external URL that locale serves it under.
    // Finnish rather than English because it is a locale whose public slugs
    // are all translated: under `en` the internal and external forms coincide,
    // so an untranslated bug would pass.
    const publicUrls = publicPaths.map((path) =>
      localizeInternalPath(path, "fi"),
    );

    it("found the (public) pages on disk", () => {
      // Sanity check so a broken glob doesn't make the suite vacuously pass.
      expect(publicUrls.length).toBeGreaterThan(0);
    });

    it.each(publicUrls)("passes %s through without auth", async (path) => {
      mockNoUser();
      const response = await proxy(createNextRequest(path));
      expect(response.status).toBe(200);
    });

    // The other half of the same claim: a **bare** page URL never serves a
    // document. It is the detector, and it redirects into the reader's locale.
    // Without this the walk above would still pass if the ladder stopped
    // firing and bare paths quietly started rendering again.
    it.each(publicPaths)("redirects the bare %s rather than serving it", async (path) => {
      mockNoUser();
      const response = await proxy(createBareRequest(path));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe(
        localizeInternalPath(path, "en"),
      );
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
      expect(getRedirectUrl(response).pathname).toBe("/en/parent");
    });

    it("redirects admin from /login to /admin", async () => {
      mockUser("admin");
      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/admin");
    });

    it("redirects gedu from /register to /gedu", async () => {
      mockUser("gedu");
      const response = await proxy(createNextRequest("/register"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/gedu");
    });

    it("redirects gamer from /login to /gamer", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/login"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/gamer");
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
      expect(getRedirectUrl(response).pathname).toBe(`/en${dashboard}`);
    });

    it("redirects an unlocked customer from / to /parent", async () => {
      mockUser("customer");
      const response = await proxy(await unlockedCustomerRequest("/"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/parent");
    });
  });

  // --- Protected routes (unauthenticated → login with redirect) ---

  describe("protected routes (unauthenticated)", () => {
    it("redirects /admin to /login with redirect param", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/en/login");
      expect(url.searchParams.get("redirect")).toBe("/en/admin");
    });

    it("redirects /parent/purchases to /login with redirect param", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/parent/purchases"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/en/login");
      expect(url.searchParams.get("redirect")).toBe("/en/parent/purchases");
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
      expect(getRedirectUrl(response).pathname).toBe("/en/parent");
    });

    it("redirects admin from /parent to /admin", async () => {
      mockUser("admin");
      const response = await proxy(createNextRequest("/parent"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/admin");
    });

    it("redirects gamer from /gedu to /gamer", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/gedu"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/gamer");
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
      expect(getRedirectUrl(response).pathname).toBe("/en/parent");
    });

    it("redirects unauthenticated from /preview/... to /login", async () => {
      mockNoUser();
      const response = await proxy(
        createNextRequest("/preview/products/consumer-club"),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/login");
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
      expect(url.pathname).toBe("/en/login");
      expect(url.searchParams.get("redirect")).toBe("/en/settings");
    });
  });

  // --- Parent-PIN gate ---

  describe("parent PIN gate", () => {
    it("redirects a locked customer from /parent to the unlock gate", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/parent"));
      expect(response.status).toBe(307);
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/en/parent/unlock");
      expect(url.searchParams.get("redirect")).toBe("/en/parent");
    });

    it("gates a locked customer even on a PUBLIC route (/shop)", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/shop"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/parent/unlock");
    });

    it("gates a locked customer before the wrong-role redirect (/admin → unlock)", async () => {
      mockUser("customer");
      const response = await proxy(createNextRequest("/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/parent/unlock");
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
    // the unlock bounce carries `?redirect=<pathname>`, and a pathname has no
    // query string, so gating /reset-password would silently drop the
    // single-use token_hash — the parent would enter their PIN and arrive at
    // a bare reset page that could only tell them the link had expired. The
    // it.each above pins the exemption itself; this pins its premise, on a
    // path that IS still gated: the bounce really does lose the query. If
    // this fails because the bounce learned to carry the search string, the
    // exemption is no longer what protects the token — revisit the comment on
    // isPinExemptPath rather than just updating the assertion.
    it("drops the query string when bouncing a gated path to the unlock gate", async () => {
      mockUser("customer");
      const response = await proxy(
        createNextRequest("/parent?token_hash=abc123&type=recovery"),
      );
      expect(response.status).toBe(307);
      const redirect = getRedirectUrl(response);
      expect(redirect.pathname).toBe("/en/parent/unlock");
      expect(redirect.searchParams.get("redirect")).toBe("/en/parent");
    });

    it("treats a cookie bound to a different session as locked (stale after switch/re-login)", async () => {
      mockUser("customer");
      const staleToken = await pinTokenFor(TEST_USER_ID, "some-other-session");
      const response = await proxy(
        createNextRequest("/parent", `${PIN_COOKIE_NAME}=${staleToken}`),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/parent/unlock");
    });

    it("does not gate non-customer roles (signed-in gamer reaches /shop)", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/shop"));
      expect(response.status).toBe(200);
    });
  });

  // --- UTM attribution (utm_* params -> x-utm) ---
  //
  // The proxy mutates the request headers in place and hands the same request to
  // NextResponse.next(), which is how the root layout sees them — so reading the
  // header back off the request object after the call is reading exactly what
  // the layout would get.

  describe("utm attribution header", () => {
    function utmHeaderAfter(request: NextRequest) {
      return request.headers.get("x-utm");
    }

    it("emits the sanitised fields for utm params on the request", async () => {
      mockNoUser();
      const request = createNextRequest(
        "/shop?utm_source=Lynx&utm_medium=email&utm_campaign=lynx-summer-a",
      );
      await proxy(request);
      expect(utmHeaderAfter(request)).toBe(
        "source=Lynx&medium=email&campaign=lynx-summer-a",
      );
    });

    it("emits only the fields that were present", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?utm_campaign=lynx-summer-a");
      await proxy(request);
      expect(utmHeaderAfter(request)).toBe("campaign=lynx-summer-a");
    });

    it("emits nothing when there are no utm params at all", async () => {
      mockNoUser();
      const request = createNextRequest("/shop");
      await proxy(request);
      expect(utmHeaderAfter(request)).toBeNull();
    });

    it("collapses a repeated param to absent rather than taking the first", async () => {
      // `?utm_campaign=a&utm_campaign=b` is not a campaign. Reading it with
      // `.get()` would silently store the first value, which is how
      // `?utm_campaign=good&utm_campaign=<junk>` would become an attribution
      // nobody authored. The fields are independent, so the well-formed source
      // beside it still comes through.
      mockNoUser();
      const request = createNextRequest(
        "/shop?utm_source=lynx&utm_campaign=good&utm_campaign=junk",
      );
      await proxy(request);
      expect(utmHeaderAfter(request)).toBe("source=lynx");
    });

    it("emits nothing for a malformed value", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?utm_campaign=%3DSUM(A1)");
      await proxy(request);
      expect(utmHeaderAfter(request)).toBeNull();
    });

    it("sets no header at all when the encoded value blows the budget", async () => {
      // Each field is 200 code points — inside the per-field cap — and each of
      // those characters encodes to 12 bytes, so the three together serialise
      // to roughly 7,200. A request header a stranger controls through the
      // query string must not be able to push the request past a hop's own
      // ceiling, and the attribution is dropped whole rather than truncated: a
      // truncated campaign is a different campaign.
      mockNoUser();
      const wide = encodeURIComponent("𝔸".repeat(200));
      const request = createNextRequest(
        `/shop?utm_source=${wide}&utm_medium=${wide}&utm_campaign=${wide}`,
      );
      await proxy(request);
      expect(utmHeaderAfter(request)).toBeNull();
    });

    it("percent-encodes a value no raw header could carry", async () => {
      // A Meta macro expands to an ad's own name — spaces and accents included
      // — and the header has to stay ASCII whatever the value was.
      mockNoUser();
      const request = createNextRequest(
        "/shop?utm_campaign=" + encodeURIComponent("Rentrée scolaire"),
      );
      await proxy(request);
      const header = utmHeaderAfter(request);
      expect(header).toBe("campaign=Rentr%C3%A9e+scolaire");
      expect(header).toMatch(/^[\x20-\x7E]*$/);
    });

    it("deletes a browser-supplied x-utm header", async () => {
      // The delete is unconditional and the set is conditional, so a header the
      // client sent itself can never reach the layout unsanitised. Asserting the
      // *deletion* rather than merely "we did not emit one" is the point: a
      // conditional set alone would leave this value in place.
      mockNoUser();
      const request = createNextRequest("/shop", undefined, {
        "x-utm": "campaign=forged-by-the-client",
      });
      await proxy(request);
      expect(utmHeaderAfter(request)).toBeNull();
    });

    it("overwrites a browser-supplied header with the sanitised params", async () => {
      mockNoUser();
      const request = createNextRequest("/shop?utm_campaign=lynx-summer-a", undefined, {
        "x-utm": "campaign=forged-by-the-client",
      });
      await proxy(request);
      expect(utmHeaderAfter(request)).toBe("campaign=lynx-summer-a");
    });

    it("is set above every branch, so a redirecting request still carries it", async () => {
      // The seed runs before the auth, PIN and role branches — including the
      // ones that return early — so no path bypasses it.
      mockUser("admin");
      const request = createNextRequest("/parent?utm_campaign=lynx-summer-a");
      const response = await proxy(request);
      expect(response.status).toBe(307);
      expect(utmHeaderAfter(request)).toBe("campaign=lynx-summer-a");
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
      expect(getRedirectUrl(response).pathname).toBe("/en/login");
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

  // --- Locale in the URL ----------------------------------------------------
  //
  // Every page URL carries its locale, English included. A bare path is never a
  // page: it is the detector, and it redirects. Two properties are worth
  // separating, because a bug in either looks like a bug in the other:
  //
  // 1. **The normalizer** turns what is in the address bar into the internal
  //    pathname every gate in the proxy was written against. Unstripped,
  //    `/fi/admin` sails past the `/admin` role gate; unstripped *and*
  //    untranslated, `/fr/boutique` never matches the public-route list.
  // 2. **The ladder** decides which locale a bare path becomes, and it runs
  //    before every gate — so a bounce is already in the right language.

  describe("the path normalizer", () => {
    it("strips a locale prefix and untranslates the slug", () => {
      expect(normalizeExternalPath("/fi/kauppa")).toEqual({
        locale: "fi",
        pathname: "/shop",
        template: "/shop",
      });
      expect(normalizeExternalPath("/fr/boutique/abc")).toEqual({
        locale: "fr",
        pathname: "/shop/abc",
        template: "/shop/[id]",
      });
    });

    it("keeps a dashboard path recognisable under every prefix", () => {
      for (const url of ["/en/admin", "/fi/admin", "/tlh/admin"]) {
        expect(toInternalPathname(url)).toBe("/admin");
      }
    });

    it("prefers a static child over the dynamic sibling it shares a shape with", () => {
      // `/kauppa/vahvistus` and `/kauppa/<product id>` are the same shape; the
      // App Router's own precedence has to hold here too, or the confirmation
      // page resolves as a product whose id is the word "vahvistus".
      expect(toInternalPathname("/fi/kauppa/vahvistus")).toBe(
        "/shop/confirmation",
      );
    });

    it("leaves a path matching no template alone but still unprefixed", () => {
      expect(normalizeExternalPath("/fi/nothing-here")).toEqual({
        locale: "fi",
        pathname: "/nothing-here",
        template: null,
      });
    });

    it("does not mistake a first segment that merely looks like a locale", () => {
      // Membership in the locale list, never a two-letter shape — which is what
      // keeps a future `es-mx` a one-line change instead of a regex hunt.
      expect(normalizeExternalPath("/de/shop").locale).toBeNull();
      expect(normalizeExternalPath("/xx/shop").locale).toBeNull();
      // And a route whose own first segment is two letters is not a prefix.
      expect(normalizeExternalPath("/about")).toEqual({
        locale: null,
        pathname: "/about",
        template: "/about",
      });
    });

    it("decodes the way next-intl does, so both ends match one string", () => {
      // Next delivers the pathname still percent-encoded and next-intl opens by
      // decoding it. Anything matched before that decode is a different URL
      // from the one that will actually be served.
      expect(toInternalPathname("/fi/%61dmin")).toBe("/admin");
      expect(toInternalPathname("/fi/kau%70pa")).toBe("/shop");
    });

    it("leaves %2F encoded, exactly as decodeURI does", () => {
      // `decodeURI` does not touch the reserved set, so an encoded slash is not
      // a separator — at either end. Decoding it here would invent a locale
      // prefix the rewrite never sees.
      expect(normalizeExternalPath("/fi%2Fadmin")).toEqual({
        locale: null,
        pathname: "/fi%2Fadmin",
        template: null,
      });
    });

    it("answers null for a pathname it cannot decode", () => {
      expect(decodeExternalPathname("/fi/%E0%A4%A")).toBeNull();
      expect(decodeExternalPathname("/fi/kauppa")).toBe("/fi/kauppa");
    });

    it("round-trips an internal path back to the URL a locale serves", () => {
      expect(localizeInternalPath("/shop/abc", "fi")).toBe("/fi/kauppa/abc");
      expect(localizeInternalPath("/shop/abc", "en")).toBe("/en/shop/abc");
      expect(localizeInternalPath("/parent", "sv")).toBe("/sv/parent");
      // A path behind no template is prefixed anyway, so a Finnish visitor
      // gets a Finnish 404 rather than an English one.
      expect(localizeInternalPath("/nothing-here", "fi")).toBe(
        "/fi/nothing-here",
      );
    });
  });

  describe("the bare-path locale ladder", () => {
    it("follows the locale cookie", async () => {
      mockNoUser();
      const response = await proxy(createBareRequest("/shop", "locale=fi"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/kauppa");
    });

    it("falls back to Accept-Language when there is no cookie", async () => {
      mockNoUser();
      const response = await proxy(
        createBareRequest("/shop", undefined, {
          "accept-language": "sv-SE,sv;q=0.9",
        }),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/sv/butik");
    });

    it("falls back to English when the browser asks for nothing we ship", async () => {
      mockNoUser();
      const response = await proxy(
        createBareRequest("/shop", undefined, { "accept-language": "de-DE,de" }),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/shop");
    });

    it("prefers the cookie over the header", async () => {
      mockNoUser();
      const response = await proxy(
        createBareRequest("/shop", "locale=fr", {
          "accept-language": "sv-SE,sv;q=0.9",
        }),
      );
      expect(getRedirectUrl(response).pathname).toBe("/fr/boutique");
    });

    it("preserves the query string", async () => {
      mockNoUser();
      const response = await proxy(
        createBareRequest("/shop?category=camps&topic=minecraft", "locale=fi"),
      );
      const url = getRedirectUrl(response);
      expect(url.pathname).toBe("/fi/kauppa");
      expect(url.search).toBe("?category=camps&topic=minecraft");
    });

    it("prefixes a path matching no route at all", async () => {
      mockNoUser();
      const response = await proxy(createBareRequest("/nonexistent", "locale=fi"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/nonexistent");
    });

    it("leaves /api/* alone", async () => {
      // An API response has no locale, and a 307'd `fetch` would break every
      // client-side API call for a non-English user.
      mockNoUser();
      const response = await proxy(
        createBareRequest("/api/some-endpoint", "locale=fi"),
      );
      expect(response.status).toBe(200);
    });

    it("runs before the gates, so a locked parent's bounce is already localized", async () => {
      mockUser("customer");
      const first = await proxy(createBareRequest("/parent", "locale=fi"));
      expect(first.status).toBe(307);
      expect(getRedirectUrl(first).pathname).toBe("/fi/parent");

      const second = await proxy(createBareRequest("/fi/parent", "locale=fi"));
      expect(second.status).toBe(307);
      const unlock = getRedirectUrl(second);
      expect(unlock.pathname).toBe("/fi/parent/unlock");
      // The `redirect=` value is the raw external path the reader was on, so
      // entering the PIN returns them to the Finnish page, not its English twin.
      expect(unlock.searchParams.get("redirect")).toBe("/fi/parent");
    });
  });

  describe("a prefixed visit", () => {
    it("renders without writing a locale cookie", async () => {
      // Following a link is reading; touching the picker is choosing. A visit
      // to somebody else's shared link must not rewrite the reader's stored
      // preference — which is also why next-intl's own locale cookie is off.
      mockNoUser();
      const response = await proxy(createNextRequest("/fr/boutique", "locale=fi"));
      expect(response.status).toBe(200);
      const names = response.cookies.getAll().map((cookie) => cookie.name);
      expect(names).not.toContain("locale");
      expect(names).not.toContain("NEXT_LOCALE");
    });

    it("resolves a translated public slug as the public route it is", async () => {
      mockNoUser();
      for (const url of ["/fi/kauppa", "/sv/butik", "/fr/ecoles", "/en/shop"]) {
        const response = await proxy(createNextRequest(url));
        expect(response.status, url).toBe(200);
      }
    });

    it("still role-gates a dashboard under a locale prefix", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/fi/admin"));
      expect(response.status).toBe(307);
      // Bounced to their own dashboard, in the locale they were browsing in.
      expect(getRedirectUrl(response).pathname).toBe("/fi/gamer");
    });

    it("still requires a session on a prefixed protected route", async () => {
      mockNoUser();
      const response = await proxy(createNextRequest("/sv/settings"));
      expect(response.status).toBe(307);
      const login = getRedirectUrl(response);
      expect(login.pathname).toBe("/sv/login");
      expect(login.searchParams.get("redirect")).toBe("/sv/settings");
    });

    it("still bounces a signed-in reader off the prefixed home page", async () => {
      mockUser("gedu");
      const response = await proxy(createNextRequest("/fi/"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/gedu");
    });

    it("still gates /preview/* to admins under a prefix", async () => {
      mockUser("gedu");
      const response = await proxy(
        createNextRequest("/fi/preview/products/consumer-club"),
      );
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/gedu");
    });

    it("carries the CSP header onto the rewritten response", async () => {
      // The nonce the SSR pipeline is about to use is stamped on the request,
      // and the rewrite next-intl issues has to come back carrying the policy
      // that names it — otherwise production renders with a nonce the policy
      // never saw and `strict-dynamic` blocks every script.
      mockNoUser();
      const response = await proxy(createNextRequest("/fi/kauppa"));
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "script-src",
      );
    });
  });
  // --- One string, matched by both ends -------------------------------------
  //
  // Next hands the proxy a pathname still percent-encoded; next-intl's
  // middleware opens by decoding and sanitizing it. A gate that matched the raw
  // form while the rewrite resolved the decoded one is a bypass, not a
  // mismatch: `/fi/%61dmin` matches no `/admin` prefix, so a signed-in gamer
  // would fall through to the rewrite and land in the admin tree. Each case
  // below pins the gate's outcome, because "it did not crash" is exactly what
  // the bypass looked like.

  describe("encoded and malformed paths", () => {
    it("gates a percent-encoded dashboard path exactly like the plain one", async () => {
      mockUser("gamer");
      const encoded = await proxy(createNextRequest("/fi/%61dmin"));
      const plain = await proxy(createNextRequest("/fi/admin"));
      expect(encoded.status).toBe(307);
      expect(getRedirectUrl(encoded).pathname).toBe("/fi/gamer");
      expect(getRedirectUrl(encoded).pathname).toBe(
        getRedirectUrl(plain).pathname,
      );
    });

    it("gates a path carrying a character the URL parser deletes", async () => {
      // `%09` decodes to a TAB, which next-intl strips before matching (the
      // WHATWG parser would have) — so the rewrite resolves `/fi/admin`, and
      // anything gating the undecoded string is gating a URL that never runs.
      mockUser("gamer");
      const response = await proxy(createNextRequest("/fi/%09admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/gamer");
    });

    it("does not read %2F as a separator, so /fi%2Fadmin carries no prefix", async () => {
      // `decodeURI` leaves the reserved set encoded, next-intl included, so
      // this is one opaque segment rather than a Finnish prefix. It is
      // therefore a bare path, and the ladder prefixes it — it must not resolve
      // to the admin route at either end.
      mockUser("gamer");
      const response = await proxy(createBareRequest("/fi%2Fadmin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/en/fi%2Fadmin");
    });

    it("strips one locale prefix, not two", async () => {
      // `/fi/fi/admin` is the Finnish prefix on a path whose own first segment
      // is `fi`. Stripping twice would hand every gate `/admin`; stripping once
      // leaves `/fi/admin`, which is a route the app does not have — so the
      // request is served (and 404s) rather than being mistaken for the
      // dashboard in either direction.
      expect(toInternalPathname("/fi/fi/admin")).toBe("/fi/admin");
      mockUser("gamer");
      const response = await proxy(createNextRequest("/fi/fi/admin"));
      expect(response.status).toBe(200);
    });

    it("gates an upper-case locale prefix, which next-intl matches too", async () => {
      // next-intl matches its prefixes case-insensitively and canonicalizes
      // them, so `/FI/admin` is the Finnish `/admin` to the rewrite. Reading it
      // as a bare path here would gate a URL nobody serves.
      mockUser("gamer");
      const response = await proxy(createNextRequest("/FI/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/gamer");
    });

    it("does not case-fold the route segment itself", async () => {
      // The prefix is matched against a list; the slug is matched against the
      // filesystem, which is case-sensitive at both ends. `/fi/Admin` is a path
      // the app does not have, and it must not become `/admin` here only to
      // 404 there.
      expect(toInternalPathname("/fi/Admin")).toBe("/Admin");
      mockUser("gamer");
      const response = await proxy(createNextRequest("/fi/Admin"));
      expect(response.status).toBe(200);
    });

    it("gates a trailing slash like the path without one", async () => {
      mockUser("gamer");
      const response = await proxy(createNextRequest("/fi/admin/"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/fi/gamer");
    });

    it("refuses a pathname it cannot decode instead of guessing at it", async () => {
      // `decodeURI` throws on a bad escape, and next-intl answers that by
      // forwarding to Next.js for a 400. There is no string for the two ends to
      // agree on, so the proxy mirrors the outcome rather than gating a raw
      // path the rewrite would have read differently.
      mockUser("gamer");
      const response = await proxy(createBareRequest("/fi/%E0%A4%A"));
      expect(response.status).toBe(400);
    });
  });

  // --- Refreshed auth cookies keep their attributes -------------------------

  describe("refreshed auth cookies", () => {
    // What Supabase writes when it refreshes a near-expiry token: a
    // root-scoped, HttpOnly cookie. Copying it by name and value alone would
    // re-issue it with no Path — which defaults to the request's own directory,
    // now `/fi` on every page URL — and no HttpOnly, minting a locale-scoped,
    // script-readable shadow of the session cookie.
    const REFRESHED = {
      name: "sb-access-token",
      value: "new-access",
      options: {
        path: "/",
        httpOnly: true,
        sameSite: "lax" as const,
        maxAge: 3600,
      },
    };

    function refreshOnClaims() {
      mockGetClaims.mockImplementation(async () => {
        capturedCookieHandlers!.setAll([REFRESHED]);
        return { data: null, error: null };
      });
    }

    it("survives the rewrite with its attributes intact", async () => {
      refreshOnClaims();
      const response = await proxy(createNextRequest("/fi/kauppa"));
      expect(response.status).toBe(200);
      expect(response.cookies.get(REFRESHED.name)).toEqual(
        expect.objectContaining({
          value: "new-access",
          path: "/",
          httpOnly: true,
        }),
      );
    });

    it("survives the redirect with its attributes intact", async () => {
      refreshOnClaims();
      const response = await proxy(createNextRequest("/fi/settings"));
      expect(response.status).toBe(307);
      expect(response.cookies.get(REFRESHED.name)).toEqual(
        expect.objectContaining({
          value: "new-access",
          path: "/",
          httpOnly: true,
        }),
      );
    });
  });

  // --- Paths that are not pages ---------------------------------------------

  describe("non-page paths", () => {
    // The ladder fires on anything that is not carved out, and a 307 to
    // `/en/_vercel/insights/script.js` is a 404 for the analytics script. The
    // matcher excludes neither prefix, so the carve-out is what does the work,
    // and it has to be the same one the rewrite reads.
    it.each([
      "/_vercel/insights/script.js",
      "/_vercel/speed-insights/script.js",
      "/.well-known/security.txt",
    ])("passes %s through untouched", async (path) => {
      mockNoUser();
      const response = await proxy(createBareRequest(path));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    });

    it("does not bounce one to the unlock gate for a locked customer", async () => {
      // A script tag is not a surface a parent can act through; gating it only
      // breaks the page it was requested from.
      mockUser("customer");
      const response = await proxy(
        createBareRequest("/_vercel/insights/script.js"),
      );
      expect(response.status).toBe(200);
    });
  });

  // --- A slug the URL's own locale does not serve ---------------------------

  describe("a foreign locale's slug", () => {
    // `/sv/kauppa` is the Finnish slug under the Swedish prefix. It normalizes
    // to `/kauppa`, which matches no route — so before this branch existed the
    // outcome depended on who was asking: anonymous readers failed the
    // public-route list and were bounced to login, while signed-in ones reached
    // the rewrite and were redirected to `/sv/butik`. Both halves are pinned,
    // because only the pair says "one behaviour".
    it("redirects an anonymous reader to the slug that locale serves", async () => {
      mockNoUser();
      const response = await proxy(createBareRequest("/sv/kauppa"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/sv/butik");
    });

    it("redirects a signed-in reader to exactly the same place", async () => {
      mockUser("gamer");
      const response = await proxy(createBareRequest("/sv/kauppa"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/sv/butik");
    });

    it("preserves the query string", async () => {
      mockNoUser();
      const response = await proxy(
        createBareRequest("/sv/kauppa?category=camps"),
      );
      expect(getRedirectUrl(response).search).toBe("?category=camps");
    });

    it("leaves an untranslated protected route to its own gate", async () => {
      // The assumption this branch rests on: only a translated public route can
      // be this shape. Dashboards, auth and settings declare one slug for every
      // locale, so there is no foreign template to match and nothing can stand
      // in front of their gates.
      mockUser("gamer");
      const response = await proxy(createNextRequest("/sv/admin"));
      expect(response.status).toBe(307);
      expect(getRedirectUrl(response).pathname).toBe("/sv/gamer");
    });
  });

});
