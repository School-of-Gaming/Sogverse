import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCP_TEST_ORIGIN as ORIGIN,
  callTool,
  resultText,
} from "../../helpers/mcp";
import type {
  AdminLibraryArticle,
  AdminLibraryArticleListItem,
  PublishedLibraryArticleSummary,
} from "@/services/library";

/**
 * **The Library tools, through the real endpoint.** The real gate, SDK and
 * tool module, with the Library service mocked: what is under test is what
 * each tool sends the service, and how it reads the answer back to the AI app
 * — the publish forecast, the links, the markdown refusal, and a database
 * refusal returned as a tool error carrying the database's own sentence.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: () => ({
    auth: { getClaims: mockGetClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

const library = {
  listAdminArticles: vi.fn(),
  getAdminArticle: vi.fn(),
  listPublishedArticles: vi.fn(),
  createArticle: vi.fn(),
  saveArticleVersion: vi.fn(),
  setArticleCategory: vi.fn(),
  publishArticle: vi.fn(),
  unpublishArticle: vi.fn(),
};
vi.mock("@/services/library/library.service", () => ({
  LibraryService: vi.fn(() => library),
}));

// The links name each locale's own address, so the real navigation is taken
// over the shared setup's locale-blind mock.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

vi.mock("next-intl/server", async () => {
  const en = (await import("../../../messages/en.json")).default;
  return {
    getTranslations: async ({ namespace }: { namespace: string }) => {
      expect(namespace).toBe("library.categories");
      return (key: keyof typeof en.library.categories) => en.library.categories[key];
    },
  };
});

const { POST } = await import("@/app/api/mcp/route");

/** A plain 1600 x 900 JPEG, as a Library cover is stored. */
const coverJpeg = () =>
  sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 51, g: 102, b: 153 } } })
    .jpeg()
    .toBuffer();

const SUPABASE_URL = "https://project.supabase.co";
const ID = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";

const tool = (name: string, args: Record<string, unknown> = {}) =>
  callTool(POST, name, args);

/**
 * Live in English and Swedish; the English is still complete, the Swedish has
 * lost its body since, and the Finnish was never finished.
 */
const ARTICLE: AdminLibraryArticle = {
  draft: {
    id: ID,
    versions: [
      { locale: "en", title: "Screen time is not the enemy", summary: "What matters.", body: "It is **what** they do." },
      { locale: "fi", title: "Ruutuaika ei ole vihollinen", summary: "", body: "" },
      { locale: "sv", title: "Skärmtid är inte fienden", summary: "Det viktiga.", body: "" },
    ],
    category: "screen_time",
    coverImageId: "9d39dd23-2b00-43f4-a0f5-af63bd58ad67",
    coverPath: "clock.jpg",
    coverLabel: "Clock",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-18T12:40:00Z",
    lastSavedBy: "Kyle Hutchinson",
    lastSavedVia: { clientId: CLIENT_ID, name: "Claude" },
  },
  publication: {
    id: ID,
    category: "screen_time",
    coverPath: "/covers/clock.jpg",
    firstPublishedAt: "2026-09-10T10:00:00Z",
    publishedAt: "2026-09-12T10:00:00Z",
    versions: [
      { locale: "en", title: "Screen time is not the enemy", summary: "What matters.", body: "It is **what** they do." },
      { locale: "sv", title: "Skärmtid är inte fienden", summary: "Det viktiga.", body: "Text." },
    ],
  },
  hasUnpublishedChanges: true,
};

const PUBLISHED: PublishedLibraryArticleSummary[] = [
  {
    id: ID,
    category: "screen_time",
    coverPath: null,
    firstPublishedAt: "2026-09-10T10:00:00Z",
    publishedAt: "2026-09-12T10:00:00Z",
    versions: [
      { locale: "en", title: "Screen time is not the enemy", summary: "" },
      { locale: "sv", title: "Skärmtid är inte fienden", summary: "" },
    ],
  },
];

const LIST_ITEM: AdminLibraryArticleListItem = {
  id: ID,
  versions: [{ locale: "en", title: "Screen time is not the enemy", summary: "What matters." }],
  category: "screen_time",
  coverPath: null,
  updatedAt: "2026-09-18T12:40:00Z",
  lastSavedBy: "Kyle Hutchinson",
  lastSavedVia: { clientId: CLIENT_ID, name: "Claude" },
  isPublished: true,
  hasUnpublishedChanges: true,
};

/** A refusal as supabase-js hands one over: the SQLSTATE and the database's sentence. */
function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { code, details: null, hint: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  mockGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: "8f1c2a8e-6c1b-4a7e-9a52-2d0d3c6e9b11",
        email: "admin@example.com",
        iss: `${SUPABASE_URL}/auth/v1`,
        exp: 2_000_000_000,
        client_id: CLIENT_ID,
      },
    },
    error: null,
  });
  mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  for (const method of Object.values(library)) method.mockReset();
  library.getAdminArticle.mockResolvedValue(ARTICLE);
  library.listPublishedArticles.mockResolvedValue(PUBLISHED);
  // The cover's original, as the public bucket answers it.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(await coverJpeg()))),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reading", () => {
  it("lists every article with who saved it and through which app", async () => {
    library.listAdminArticles.mockResolvedValue([LIST_ITEM]);

    const result = await tool("list_library_articles");

    expect(result.structuredContent).toEqual({
      articles: [
        {
          articleId: ID,
          titles: [{ locale: "en", title: "Screen time is not the enemy" }],
          category: "screen_time",
          coverUrl: null,
          live: true,
          hasUnpublishedChanges: true,
          lastSaved: {
            at: "2026-09-18T12:40:00Z",
            by: "Kyle Hutchinson",
            via: { clientId: CLIENT_ID, name: "Claude" },
          },
        },
      ],
    });
  });

  it("reads one article whole, with what a publish would put live, leave out and take down", async () => {
    const result = await tool("get_library_article", { articleId: ID });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      articleId: ID,
      category: "screen_time",
      categoryLabel: "Screen time & family life",
      cover: {
        catalogueId: ARTICLE.draft.coverImageId,
        label: "Clock",
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/library-covers/clock.jpg`,
      },
      lastSaved: { by: "Kyle Hutchinson", via: { name: "Claude" } },
      hasUnpublishedChanges: true,
      publish: {
        canPublish: true,
        missing: [],
        wouldPutLive: ["en"],
        wouldLeaveOut: ["fi", "sv"],
        wouldTakeDown: ["sv"],
      },
      editorLink: `${ORIGIN}/en/admin/library/${ID}`,
    });
    expect(result.structuredContent?.versions).toEqual([
      expect.objectContaining({
        locale: "en",
        language: "English",
        body: "It is **what** they do.",
        complete: true,
        missing: [],
        live: true,
        previewLink: `${ORIGIN}/en/library/${ID}/preview`,
      }),
      expect.objectContaining({
        locale: "fi",
        complete: false,
        missing: ["summary", "body"],
        live: false,
        previewLink: `${ORIGIN}/fi/kirjasto/${ID}/esikatselu`,
      }),
      expect.objectContaining({ locale: "sv", complete: false, missing: ["body"], live: true }),
    ]);
    expect(result.structuredContent?.live).toMatchObject({
      versions: [
        { locale: "en", publicLink: `${ORIGIN}/en/library/screen-time-is-not-the-enemy` },
        { locale: "sv", publicLink: `${ORIGIN}/sv/bibliotek/skarmtid-ar-inte-fienden` },
      ],
    });
  });

  it("forecasts the database's refusal for an article missing a category and any complete version", async () => {
    library.getAdminArticle.mockResolvedValue({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, category: null, versions: [ARTICLE.draft.versions[1]] },
      publication: null,
      hasUnpublishedChanges: false,
    });

    const result = await tool("get_library_article", { articleId: ID });

    expect(result.structuredContent).toMatchObject({
      live: null,
      publish: {
        canPublish: false,
        missing: ["a category", "a language version with a title, a summary and a body"],
        wouldPutLive: [],
      },
    });
  });

  it("answers an id no article has as a tool error", async () => {
    library.getAdminArticle.mockResolvedValue(null);

    const result = await tool("get_library_article", { articleId: ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("No Library article has that id.");
  });

  it("refuses an id that is not one before reading anything", async () => {
    const result = await tool("get_library_article", { articleId: "not-an-id" });

    expect(result.isError).toBe(true);
    expect(library.getAdminArticle).not.toHaveBeenCalled();
  });

  it("lists the categories with their English labels", async () => {
    const result = await tool("list_library_categories");

    expect(result.structuredContent?.categories).toContainEqual({
      value: "screen_time",
      label: "Screen time & family life",
    });
  });

  it("links the preview in the language asked for, and says which version it shows", async () => {
    const result = await tool("get_library_preview_link", { articleId: ID, locale: "fr" });

    expect(result.structuredContent).toEqual({
      articleId: ID,
      locale: "fr",
      shows: "en",
      previewLink: `${ORIGIN}/fr/bibliotheque/${ID}/apercu`,
    });
  });
});

describe("writing", () => {
  it("creates an article with one version, unpublished and without a cover", async () => {
    library.createArticle.mockResolvedValue(ID);

    const result = await tool("create_library_article", {
      locale: "en",
      title: "  A new article ",
      category: "learning",
    });

    expect(library.createArticle).toHaveBeenCalledWith({
      versions: [{ locale: "en", title: "A new article", summary: "", body: "" }],
      category: "learning",
      coverImageId: null,
    });
    expect(result.structuredContent).toEqual({
      articleId: ID,
      editorLink: `${ORIGIN}/en/admin/library/${ID}`,
      previewLink: `${ORIGIN}/en/library/${ID}/preview`,
    });
  });

  it("refuses a body outside the article subset, naming the construct, and saves nothing", async () => {
    const result = await tool("save_library_article_version", {
      articleId: ID,
      locale: "fi",
      title: "Otsikko",
      summary: "Tiivistelmä",
      body: "Teksti.\n\n![kuva](https://example.com/a.png)\n\n| a | b |",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("an image (![alt](url)) on line 3");
    expect(library.saveArticleVersion).not.toHaveBeenCalled();
  });

  it("refuses the same on a create", async () => {
    const result = await tool("create_library_article", {
      locale: "en",
      title: "Title",
      body: "```\ncode\n```",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("a code block on line 1");
    expect(library.createArticle).not.toHaveBeenCalled();
  });

  it("refuses a version without a title before calling the database", async () => {
    const result = await tool("save_library_article_version", {
      articleId: ID,
      locale: "fi",
      title: "   ",
      summary: "",
      body: "",
    });

    expect(result.isError).toBe(true);
    expect(library.saveArticleVersion).not.toHaveBeenCalled();
  });

  it("saves one language and reports where it stands", async () => {
    library.saveArticleVersion.mockResolvedValue(ID);
    library.getAdminArticle.mockResolvedValue({
      ...ARTICLE,
      draft: {
        ...ARTICLE.draft,
        versions: [
          ARTICLE.draft.versions[0],
          ARTICLE.draft.versions[1],
          { locale: "sv", title: "Skärmtid, omskriven", summary: "Det viktiga.", body: "Text." },
        ],
      },
    });

    const result = await tool("save_library_article_version", {
      articleId: ID,
      locale: "sv",
      title: "Skärmtid, omskriven",
      summary: "Det viktiga.",
      body: "Text.",
    });

    expect(library.saveArticleVersion).toHaveBeenCalledWith(ID, {
      locale: "sv",
      title: "Skärmtid, omskriven",
      summary: "Det viktiga.",
      body: "Text.",
    });
    expect(result.structuredContent).toMatchObject({
      locale: "sv",
      complete: true,
      missing: [],
      languageIsLive: true,
      publicAddressChangesOnPublish: true,
      publish: { wouldPutLive: ["en", "sv"], wouldTakeDown: [] },
    });
  });

  it("quotes the database's refusal as a tool error", async () => {
    library.saveArticleVersion.mockRejectedValue(
      dbError("P0002", "Library article not found"),
    );

    const result = await tool("save_library_article_version", {
      articleId: ID,
      locale: "en",
      title: "Title",
      summary: "",
      body: "",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("Library article not found");
  });

  it("does not quote a fault meant for a developer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    library.setArticleCategory.mockRejectedValue(dbError("PGRST301", "JWT expired"));

    const result = await tool("set_library_article_category", {
      articleId: ID,
      category: "learning",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).not.toContain("JWT");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("sets the category, or clears it with null", async () => {
    library.setArticleCategory.mockResolvedValue(ID);

    const set = await tool("set_library_article_category", { articleId: ID, category: "learning" });
    const cleared = await tool("set_library_article_category", { articleId: ID, category: null });

    expect(library.setArticleCategory.mock.calls).toEqual([
      [ID, "learning"],
      [ID, null],
    ]);
    expect(set.structuredContent).toEqual({
      articleId: ID,
      category: "learning",
      categoryLabel: "Learning through games",
    });
    expect(cleared.structuredContent).toMatchObject({ category: null, categoryLabel: null });
  });

  it("refuses a category that is not one", async () => {
    const result = await tool("set_library_article_category", { articleId: ID, category: "news" });

    expect(result.isError).toBe(true);
    expect(library.setArticleCategory).not.toHaveBeenCalled();
  });
});

describe("publishing", () => {
  it("reports what went live, what was left out and taken down, and the live links", async () => {
    library.publishArticle.mockResolvedValue(undefined);

    const result = await tool("publish_library_article", { articleId: ID });

    expect(library.publishArticle).toHaveBeenCalledWith(ID);
    expect(result.structuredContent).toEqual({
      articleId: ID,
      live: ["en"],
      leftOut: ["fi", "sv"],
      takenDown: ["sv"],
      publicLinks: [
        { locale: "en", publicLink: `${ORIGIN}/en/library/screen-time-is-not-the-enemy` },
      ],
    });
  });

  it("returns the database's refusal sentence", async () => {
    library.publishArticle.mockRejectedValue(
      dbError("23514", "The article cannot be published without a category"),
    );

    const result = await tool("publish_library_article", { articleId: ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("The article cannot be published without a category");
  });

  it("unpublishes, saying whether the article was live", async () => {
    library.unpublishArticle.mockResolvedValue(undefined);

    const result = await tool("unpublish_library_article", { articleId: ID });

    expect(library.unpublishArticle).toHaveBeenCalledWith(ID);
    expect(result.structuredContent).toEqual({ articleId: ID, wasLive: true, live: false });
  });
});
