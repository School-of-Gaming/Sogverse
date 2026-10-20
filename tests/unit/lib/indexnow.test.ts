import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { PublishedLandingPageSummary } from "@/services/landing-pages/landing-pages.contracts";
import type { PublishedLibraryArticleSummary } from "@/services/library/library.contracts";

// The URL sets are *about* which locale's path each address names, so this
// file takes the real path builder — and the module it is built on — rather
// than the setup's locale-blind stub.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));

const {
  INDEXNOW_ENDPOINT,
  changeAndSubmit,
  indexNowKey,
  indexNowTarget,
  submitToIndexNow,
} = await import("@/lib/indexnow/indexnow");
const { landingPageChangeUrls, publishLandingPage, unpublishLandingPage } =
  await import("@/lib/indexnow/landing-pages");
const { libraryChangeUrls, publishLibraryArticle, unpublishLibraryArticle } =
  await import("@/lib/indexnow/library");

const SITE = "https://sogverse.test";
const KEY = "0123456789abcdef0123456789abcdef";

const DISCOVER_INDEX = [
  `${SITE}/en/discover`,
  `${SITE}/fi/tutustu`,
  `${SITE}/sv/upptack`,
  `${SITE}/fr/decouvrir`,
];
const LIBRARY_INDEX = [
  `${SITE}/en/library`,
  `${SITE}/fi/kirjasto`,
  `${SITE}/sv/bibliotek`,
  `${SITE}/fr/bibliotheque`,
];

const fetchMock = vi.fn<typeof fetch>();

/** The JSON body of one recorded submission. */
function submission(call: Parameters<typeof fetch> | undefined) {
  return z
    .object({ urlList: z.array(z.string()) })
    .passthrough()
    .parse(JSON.parse(String(call?.[1]?.body)));
}


function production({ key = KEY }: { key?: string } = {}) {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("INDEXNOW_KEY", key);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
}

/** The URL list of the one submission made. */
function submitted(): string[] {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = submission(fetchMock.mock.calls[0]);
  expect(body).toMatchObject({ host: "sogverse.test", key: KEY });
  return body.urlList;
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("the gate", () => {
  it("submits from production with a key", () => {
    production();
    expect(indexNowTarget()).toEqual({ key: KEY, siteUrl: SITE });
  });

  it("skips every deployment but production, saying so", () => {
    production();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(indexNowTarget()).toBeNull();
    vi.stubEnv("VERCEL_ENV", "");
    expect(indexNowTarget()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[indexnow] skipped: not the production deployment",
    );
  });

  it("skips with no key, or one the protocol would refuse, saying so", () => {
    production({ key: "" });
    expect(indexNowTarget()).toBeNull();
    vi.stubEnv("INDEXNOW_KEY", "short");
    expect(indexNowTarget()).toBeNull();
    vi.stubEnv("INDEXNOW_KEY", "has spaces and/slashes-in-it");
    expect(indexNowTarget()).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      "[indexnow] skipped: INDEXNOW_KEY is unset or not a valid key",
    );
  });

  it("reads a key of letters, digits and dashes, trimmed", () => {
    vi.stubEnv("INDEXNOW_KEY", " abc-DEF-123 \n");
    expect(indexNowKey()).toBe("abc-DEF-123");
  });
});

// ---------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------

describe("submitting", () => {
  it("posts the protocol's JSON to the shared endpoint, each URL once, naming the root key file", async () => {
    await submitToIndexNow({ key: KEY, siteUrl: SITE }, [`${SITE}/a`, `${SITE}/b`, `${SITE}/a`]);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json; charset=utf-8" });
    expect(submission(fetchMock.mock.calls[0])).toEqual({
      host: "sogverse.test",
      key: KEY,
      keyLocation: `${SITE}/indexnow-key.txt`,
      urlList: [`${SITE}/a`, `${SITE}/b`],
    });
  });

  it("sends nothing for no URLs", async () => {
    await submitToIndexNow({ key: KEY, siteUrl: SITE }, []);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs a refusal and a network failure rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 422 }));
    await expect(
      submitToIndexNow({ key: KEY, siteUrl: SITE }, [`${SITE}/a`]),
    ).resolves.toBeUndefined();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      submitToIndexNow({ key: KEY, siteUrl: SITE }, [`${SITE}/a`]),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe("a change and its submission", () => {
  it("does not fail the change when the submission fails", async () => {
    production();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const change = vi.fn().mockResolvedValue(undefined);

    await expect(
      changeAndSubmit({
        label: "test",
        change,
        snapshot: async () => ["x"],
        urls: () => [`${SITE}/x`],
      }),
    ).resolves.toBeUndefined();
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("does not fail the change when what is live cannot be read, before or after", async () => {
    production();
    const snapshot = vi.fn().mockRejectedValue(new Error("read failed"));
    const change = vi.fn().mockResolvedValue(undefined);

    await expect(
      changeAndSubmit({ label: "test", change, snapshot, urls: () => [] }),
    ).resolves.toBeUndefined();
    expect(change).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the change's own refusal through, and submits nothing", async () => {
    production();
    const refusal = { code: "23514", message: "Nothing complete to publish" };

    await expect(
      changeAndSubmit({
        label: "test",
        change: () => Promise.reject(refusal),
        snapshot: async () => [],
        urls: () => [`${SITE}/x`],
      }),
    ).rejects.toBe(refusal);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("off production, reads nothing and submits nothing", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("INDEXNOW_KEY", KEY);
    const snapshot = vi.fn();
    const change = vi.fn().mockResolvedValue(undefined);

    await changeAndSubmit({ label: "test", change, snapshot, urls: () => [] });
    expect(change).toHaveBeenCalledTimes(1);
    expect(snapshot).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Landing pages
// ---------------------------------------------------------------------------

const PAGE_ID = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

function landingPage(
  versions: { locale: "en" | "fi" | "sv" | "fr" | "tlh"; slug: string }[],
): PublishedLandingPageSummary {
  return {
    id: PAGE_ID,
    firstPublishedAt: "2026-09-01T08:00:00Z",
    publishedAt: "2026-10-01T08:00:00Z",
    sections: [],
    imagePaths: {},
    versions: versions.map((v) => ({ ...v, title: v.slug, summary: "S" })),
  };
}

describe("a landing page's URLs", () => {
  const live = landingPage([
    { locale: "en", slug: "clubs-espoo" },
    { locale: "fi", slug: "kerhot-espoo" },
    { locale: "tlh", slug: "qapla" },
  ]);

  it("on a first publish: each indexed live language's slug address, and the index", () => {
    expect(landingPageChangeUrls(null, live, SITE)).toEqual([
      `${SITE}/en/discover/clubs-espoo`,
      `${SITE}/fi/tutustu/kerhot-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("on an update: the same addresses, since the content behind them changed", () => {
    expect(landingPageChangeUrls(live, live, SITE)).toEqual([
      `${SITE}/en/discover/clubs-espoo`,
      `${SITE}/fi/tutustu/kerhot-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("on a slug change: the address that went away as well as the new one", () => {
    const moved = landingPage([
      { locale: "en", slug: "gaming-clubs-espoo" },
      { locale: "fi", slug: "kerhot-espoo" },
    ]);
    expect(landingPageChangeUrls(live, moved, SITE)).toEqual([
      `${SITE}/en/discover/clubs-espoo`,
      `${SITE}/en/discover/gaming-clubs-espoo`,
      `${SITE}/fi/tutustu/kerhot-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("on a language taken down: its address, which went away", () => {
    const englishOnly = landingPage([{ locale: "en", slug: "clubs-espoo" }]);
    expect(landingPageChangeUrls(live, englishOnly, SITE)).toEqual([
      `${SITE}/fi/tutustu/kerhot-espoo`,
      `${SITE}/en/discover/clubs-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("on an unpublish: every address it had, and the index", () => {
    expect(landingPageChangeUrls(live, null, SITE)).toEqual([
      `${SITE}/en/discover/clubs-espoo`,
      `${SITE}/fi/tutustu/kerhot-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("publishes through the service, then submits what is live before and after", async () => {
    production();
    const service = {
      getPublishedPage: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(live),
      publishPage: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the two service methods the helper calls
    await publishLandingPage(service as never, PAGE_ID);

    expect(service.publishPage).toHaveBeenCalledWith(PAGE_ID);
    expect(submitted()).toContain(`${SITE}/fi/tutustu/kerhot-espoo`);
  });

  it("unpublishes through the service, submitting the addresses that went away", async () => {
    production();
    const service = {
      getPublishedPage: vi.fn().mockResolvedValueOnce(live).mockResolvedValueOnce(null),
      unpublishPage: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the two service methods the helper calls
    await unpublishLandingPage(service as never, PAGE_ID);

    expect(service.unpublishPage).toHaveBeenCalledWith(PAGE_ID);
    expect(submitted()).toEqual([
      `${SITE}/en/discover/clubs-espoo`,
      `${SITE}/fi/tutustu/kerhot-espoo`,
      ...DISCOVER_INDEX,
    ]);
  });

  it("a failed submission does not fail the publish", async () => {
    production();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const service = {
      getPublishedPage: vi.fn().mockResolvedValue(live),
      publishPage: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the two service methods the helper calls
    await expect(publishLandingPage(service as never, PAGE_ID)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Library articles
// ---------------------------------------------------------------------------

const ARTICLE_ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";
const OTHER_ID = "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90";

function article(
  id: string,
  firstPublishedAt: string,
  versions: { locale: "en" | "fi" | "sv" | "fr" | "tlh"; title: string }[],
): PublishedLibraryArticleSummary {
  return {
    id,
    category: "screen_time",
    coverPath: null,
    firstPublishedAt,
    publishedAt: firstPublishedAt,
    versions: versions.map((v) => ({ ...v, summary: "S" })),
  };
}

describe("a Library article's URLs", () => {
  const screenTime = article(ARTICLE_ID, "2026-05-01T08:00:00Z", [
    { locale: "en", title: "Screen time" },
    { locale: "fi", title: "Ruutuaika" },
  ]);

  it("on a first publish: each written language's slug address, and the Library index", () => {
    expect(libraryChangeUrls(ARTICLE_ID, [], [screenTime], SITE)).toEqual([
      `${SITE}/en/library/screen-time`,
      `${SITE}/fi/kirjasto/ruutuaika`,
      ...LIBRARY_INDEX,
    ]);
  });

  it("on an update: the article's addresses as they stand, and no other article's", () => {
    const other = article(OTHER_ID, "2026-06-01T08:00:00Z", [{ locale: "en", title: "Safety" }]);
    expect(
      libraryChangeUrls(ARTICLE_ID, [screenTime, other], [screenTime, other], SITE),
    ).toEqual([
      `${SITE}/en/library/screen-time`,
      `${SITE}/fi/kirjasto/ruutuaika`,
      ...LIBRARY_INDEX,
    ]);
  });

  it("on a retitle: the slug address that went away as well as the new one", () => {
    const retitled = article(ARTICLE_ID, "2026-05-01T08:00:00Z", [
      { locale: "en", title: "Screen time at home" },
      { locale: "fi", title: "Ruutuaika" },
    ]);
    expect(libraryChangeUrls(ARTICLE_ID, [screenTime], [retitled], SITE)).toEqual([
      `${SITE}/en/library/screen-time`,
      `${SITE}/en/library/screen-time-at-home`,
      `${SITE}/fi/kirjasto/ruutuaika`,
      ...LIBRARY_INDEX,
    ]);
  });

  it("on an unpublish: every address it had, and another article's that moved because of it", () => {
    // The newer article derives the same English slug, so it is reachable at
    // its id until the older one leaves and hands the slug over.
    const newer = article(OTHER_ID, "2026-06-01T08:00:00Z", [
      { locale: "en", title: "Screen time" },
    ]);
    expect(libraryChangeUrls(ARTICLE_ID, [screenTime, newer], [newer], SITE)).toEqual([
      `${SITE}/en/library/screen-time`,
      `${SITE}/fi/kirjasto/ruutuaika`,
      `${SITE}/en/library/${OTHER_ID}`,
      ...LIBRARY_INDEX,
    ]);
  });

  it("publishes and unpublishes through the service, submitting after each", async () => {
    production();
    const service = {
      listPublishedArticles: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([screenTime])
        .mockResolvedValueOnce([screenTime])
        .mockResolvedValueOnce([]),
      publishArticle: vi.fn().mockResolvedValue(undefined),
      unpublishArticle: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the service methods the helpers call
    await publishLibraryArticle(service as never, ARTICLE_ID);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the service methods the helpers call
    await unpublishLibraryArticle(service as never, ARTICLE_ID);

    expect(service.publishArticle).toHaveBeenCalledWith(ARTICLE_ID);
    expect(service.unpublishArticle).toHaveBeenCalledWith(ARTICLE_ID);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(submission(call).urlList).toContain(`${SITE}/en/library/screen-time`);
    }
  });

  it("with the key unset, publishes and submits nothing", async () => {
    production({ key: "" });
    const service = {
      listPublishedArticles: vi.fn(),
      publishArticle: vi.fn().mockResolvedValue(undefined),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a stand-in for the service methods the helpers call
    await publishLibraryArticle(service as never, ARTICLE_ID);

    expect(service.publishArticle).toHaveBeenCalledWith(ARTICLE_ID);
    expect(service.listPublishedArticles).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
