import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

// The admin's publication routes for landing pages and Library articles. Each
// runs the area's own service on the admin's session — mocked here at the
// service, so the route's own behaviour is what is under test: the role gate,
// the id, a database refusal reaching the client with its sentence and its
// code, and the IndexNow submission after a publish, which never fails it.

// The submission's URLs are built by the real path builder.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

// The submission is sent after the response; here it runs at once.
vi.mock("next/server", async (importOriginal) =>
  (await import("../../mocks/next-after")).nextServerWithImmediateAfter(importOriginal),
);
const { settleAfter } = await import("../../mocks/next-after");

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const landing = {
  publishPage: vi.fn(),
  unpublishPage: vi.fn(),
  getPublishedPage: vi.fn(),
};
vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: class {
    publishPage = landing.publishPage;
    unpublishPage = landing.unpublishPage;
    getPublishedPage = landing.getPublishedPage;
  },
}));

const library = {
  publishArticle: vi.fn(),
  unpublishArticle: vi.fn(),
  listPublishedArticles: vi.fn(),
};
vi.mock("@/services/library/library.service", () => ({
  LibraryService: class {
    publishArticle = library.publishArticle;
    unpublishArticle = library.unpublishArticle;
    listPublishedArticles = library.listPublishedArticles;
  },
}));

const landingRoute = await import("@/app/api/admin/landing-pages/[id]/publication/route");
const libraryRoute = await import("@/app/api/admin/library/[id]/publication/route");

const ID = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const SITE = "https://sogverse.test";
const KEY = "0123456789abcdef0123456789abcdef";

const fetchMock = vi.fn<typeof fetch>();

/** The JSON body of one recorded submission. */
function submission(call: Parameters<typeof fetch> | undefined) {
  return z
    .object({ urlList: z.array(z.string()) })
    .passthrough()
    .parse(JSON.parse(String(call?.[1]?.body)));
}


function request(path: string, method: string): Request {
  return new Request(`http://localhost:3000${path}`, { method });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function asAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: { role: "admin" },
    supabase: {},
  });
}

const LIVE_PAGE = {
  id: ID,
  firstPublishedAt: "2026-09-01T08:00:00Z",
  publishedAt: "2026-10-01T08:00:00Z",
  sections: [],
  pictures: {},
  versions: [{ locale: "fi", title: "Kerhot", summary: "S", slug: "kerhot-espoo", sectionTexts: {} }],
};

const LIVE_ARTICLE = {
  id: ID,
  category: "screen_time",
  coverPath: null,
  firstPublishedAt: "2026-05-01T08:00:00Z",
  publishedAt: "2026-05-01T08:00:00Z",
  versions: [{ locale: "en", title: "Screen time", summary: "S" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [landing.publishPage, landing.unpublishPage, library.publishArticle, library.unpublishArticle]) {
    fn.mockResolvedValue(undefined);
  }
  landing.getPublishedPage.mockResolvedValue(LIVE_PAGE);
  library.listPublishedArticles.mockResolvedValue([LIVE_ARTICLE]);
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ROUTES = [
  {
    name: "landing page",
    path: `/api/admin/landing-pages/${ID}/publication`,
    route: landingRoute,
    publish: landing.publishPage,
    unpublish: landing.unpublishPage,
    expectedUrl: `${SITE}/fi/tutustu/kerhot-espoo`,
  },
  {
    name: "Library article",
    path: `/api/admin/library/${ID}/publication`,
    route: libraryRoute,
    publish: library.publishArticle,
    unpublish: library.unpublishArticle,
    expectedUrl: `${SITE}/en/library/screen-time`,
  },
] as const;

describe.each(ROUTES)("the $name publication route", ({ path, route, publish, unpublish, expectedUrl }) => {
  it("refuses a caller who is not signed in", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await route.PUT(request(path, "PUT"), context(ID));

    expect(response.status).toBe(401);
    expect(publish).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const response = await route.DELETE(request(path, "DELETE"), context(ID));

    expect(response.status).toBe(403);
    expect(unpublish).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one", async () => {
    asAdmin();

    const response = await route.PUT(request(path, "PUT"), context("not-an-id"));

    expect(response.status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes, answering 204", async () => {
    asAdmin();

    const response = await route.PUT(request(path, "PUT"), context(ID));

    expect(response.status).toBe(204);
    expect(publish).toHaveBeenCalledWith(ID);
  });

  it("unpublishes, answering 204", async () => {
    asAdmin();

    const response = await route.DELETE(request(path, "DELETE"), context(ID));

    expect(response.status).toBe(204);
    expect(unpublish).toHaveBeenCalledWith(ID);
  });

  it("hands the database's refusal back with its sentence and its code", async () => {
    asAdmin();
    publish.mockRejectedValue({ code: "23514", message: "Nothing complete to publish" });

    const response = await route.PUT(request(path, "PUT"), context(ID));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Nothing complete to publish",
      code: "23514",
    });
  });

  it("on production with a key, tells IndexNow what the publish changed", async () => {
    asAdmin();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("INDEXNOW_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);

    const response = await route.PUT(request(path, "PUT"), context(ID));

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(submission(fetchMock.mock.calls[0]).urlList).toContain(expectedUrl);
  });

  it("still publishes when the submission fails", async () => {
    asAdmin();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("INDEXNOW_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await route.PUT(request(path, "PUT"), context(ID));

    expect(response.status).toBe(204);
    expect(publish).toHaveBeenCalledWith(ID);

    await settleAfter();
    expect(console.error).toHaveBeenCalledWith("[indexnow] the submission failed:", expect.any(TypeError));
  });

  it("off production, submits nothing", async () => {
    asAdmin();
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("INDEXNOW_KEY", KEY);

    const response = await route.DELETE(request(path, "DELETE"), context(ID));

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
