import sharp from "sharp";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCP_TEST_ORIGIN as ORIGIN,
  callTool,
  mcpRequest,
  readRpc,
  resultText,
  type McpToolResult,
} from "../../helpers/mcp";
import type {
  AdminLibraryArticle,
  AdminLibraryArticleListItem,
} from "@/services/library";
import type { CatalogueImage } from "@/types";

/**
 * **The Library's cover tools, through the real endpoint.** The real gate,
 * SDK and tool modules, with the Library and catalogue services mocked and
 * the public bucket answered by a stubbed `fetch` with real JPEGs, so the
 * pictures in an answer are real re-encodes: what is under test is how a
 * cover reaches the model (as a picture, within the size budget, always named
 * in text), the writes the tools send, the uploader's refusals before
 * anything is stored, and the view the uploader is served as.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const bearerClient = {
  auth: { getClaims: mockGetClaims },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
};
vi.mock("@/lib/supabase/bearer", () => ({ createBearerClient: () => bearerClient }));

const adminClient = { storage: "the service-role client" };
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));

const library = {
  listAdminArticles: vi.fn(),
  getAdminArticle: vi.fn(),
  listPublishedArticles: vi.fn(),
  setArticleCover: vi.fn(),
};
vi.mock("@/services/library/library.service", () => ({
  LibraryService: vi.fn(() => library),
}));

const catalogue = { listImages: vi.fn(), getUsage: vi.fn() };
vi.mock("@/services/catalogue-images/catalogue-images.service", () => ({
  CatalogueImagesService: vi.fn(() => catalogue),
}));

// The checks are the real ones; only the storing is mocked.
const mockFindOrCreate = vi.fn<(args: { file: File }) => Promise<unknown>>();
vi.mock("@/services/catalogue-images/catalogue-images.server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  findOrCreateCatalogueImage: (args: { file: File }) => mockFindOrCreate(args),
}));

vi.mock("next-intl/server", async () => {
  const en = (await import("../../../messages/en.json")).default;
  return {
    getTranslations: async () => (key: keyof typeof en.library.categories) =>
      en.library.categories[key],
  };
});

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const BUCKET = `${SUPABASE_URL}/storage/v1/object/public/library-covers`;
const ID = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const COVER_ID = "9d39dd23-2b00-43f4-a0f5-af63bd58ad67";

const tool = (name: string, args: Record<string, unknown> = {}) =>
  callTool(POST, name, args);

/** A flat JPEG of the given size. */
function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 51, g: 102, b: 153 } } })
    .jpeg()
    .toBuffer();
}

/** The bucket, by path: a path absent from `objects` answers 404. */
function serveBucket(objects: Record<string, Buffer>) {
  const mockFetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const path = url.startsWith(`${BUCKET}/`) ? url.slice(BUCKET.length + 1) : "";
    const body = new Map(Object.entries(objects)).get(path);
    return body
      ? new Response(new Uint8Array(body), { headers: { "Content-Type": "image/jpeg" } })
      : new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

const images = (result: McpToolResult) => result.content.filter((block) => block.type === "image");

const ARTICLE: AdminLibraryArticle = {
  draft: {
    id: ID,
    versions: [{ locale: "en", title: "Screen time is not the enemy", summary: "", body: "" }],
    category: "screen_time",
    coverImageId: COVER_ID,
    coverPath: "clock.jpg",
    coverLabel: "Clock",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-18T12:40:00Z",
    lastSavedBy: null,
    lastSavedVia: null,
  },
  publication: null,
  hasUnpublishedChanges: false,
};

function listItem(n: number, coverPath: string | null): AdminLibraryArticleListItem {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    versions: [{ locale: "en", title: `Article ${n}`, summary: "" }],
    category: null,
    coverPath,
    updatedAt: "2026-09-18T12:40:00Z",
    lastSavedBy: null,
    lastSavedVia: null,
    isPublished: false,
    hasUnpublishedChanges: false,
  };
}

function entry(n: number): CatalogueImage {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    label: `Cover ${n}`,
    sha256: String(n).padStart(64, "0"),
    path: `${String(n).padStart(64, "0")}.jpg`,
    purpose: "library_cover",
    created_at: "2026-09-01T10:00:00Z",
  };
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
        client_id: "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90",
      },
    },
    error: null,
  });
  mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  for (const method of [...Object.values(library), ...Object.values(catalogue)]) {
    method.mockReset();
  }
  mockFindOrCreate.mockReset();
  library.getAdminArticle.mockResolvedValue(ARTICLE);
  library.listPublishedArticles.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("covers as pictures", () => {
  it("shows an article's cover as a preview-sized JPEG, named in text beside it", async () => {
    serveBucket({ "clock.jpg": await jpeg(1600, 900) });

    const result = await tool("get_library_article", { articleId: ID });

    const [image] = images(result);
    expect(image.mimeType).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(image.data ?? "", "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([800, 450]);
    expect(resultText(result)).toContain(`catalogue entry ${COVER_ID} ("Clock"): ${BUCKET}/clock.jpg`);
    expect(JSON.stringify(result).length).toBeLessThan(1_000_000);
  });

  it("answers in text alone when the cover cannot be loaded", async () => {
    serveBucket({});

    const result = await tool("get_library_article", { articleId: ID });

    expect(result.isError).toBeUndefined();
    expect(images(result)).toEqual([]);
    expect(resultText(result)).toContain("(the picture could not be loaded)");
  });

  it("lists articles without pictures unless asked", async () => {
    library.listAdminArticles.mockResolvedValue([listItem(1, "clock.jpg")]);
    const mockFetch = serveBucket({ "clock.jpg": await jpeg(1600, 900) });

    const result = await tool("list_library_articles");

    expect(images(result)).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      articles: [{ coverUrl: `${BUCKET}/clock.jpg` }],
    });
  });

  it("pictures at most twenty covers in one answer and names the rest", async () => {
    library.listAdminArticles.mockResolvedValue([
      listItem(0, null),
      ...Array.from({ length: 25 }, (_, n) => listItem(n + 1, `cover-${n + 1}.jpg`)),
    ]);
    const picture = await jpeg(1600, 900);
    serveBucket(
      Object.fromEntries(Array.from({ length: 25 }, (_, n) => [`cover-${n + 1}.jpg`, picture])),
    );

    const result = await tool("list_library_articles", { includeCovers: true });

    expect(images(result)).toHaveLength(20);
    const meta = await sharp(Buffer.from(images(result)[0].data ?? "", "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([256, 144]);
    expect(resultText(result)).toContain("5 more cover(s) are not pictured");
  });

  it("pictures a cover several articles share once, naming every one of them", async () => {
    library.listAdminArticles.mockResolvedValue([
      listItem(1, "clock.jpg"),
      listItem(2, "lamp.jpg"),
      listItem(3, "clock.jpg"),
    ]);
    const mockFetch = serveBucket({
      "clock.jpg": await jpeg(1600, 900),
      "lamp.jpg": await jpeg(1600, 900),
    });

    const result = await tool("list_library_articles", { includeCovers: true });

    expect(images(result)).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const captions = result.content
      .filter((block) => block.type === "text")
      .slice(1)
      .map((block) => block.text);
    expect(captions).toEqual([
      `Cover shared by article ${listItem(1, null).id} ("Article 1"), article ${listItem(3, null).id} ("Article 3"): ${BUCKET}/clock.jpg`,
      `Cover of article ${listItem(2, null).id} ("Article 2"): ${BUCKET}/lamp.jpg`,
    ]);
  });

});

describe("list_library_covers", () => {
  it("pages the catalogue's Library covers with thumbnails and where each is used", async () => {
    const entries = Array.from({ length: 5 }, (_, n) => entry(n + 1));
    catalogue.listImages.mockResolvedValue(entries);
    catalogue.getUsage.mockResolvedValue({
      [entries[2].id]: [
        { kind: "library-article", id: ID, title: "Screen time is not the enemy", is_live: true },
      ],
    });
    serveBucket(Object.fromEntries(await Promise.all(entries.map(async (e) => [e.path, await jpeg(1600, 900)]))));

    const result = await tool("list_library_covers", { offset: 2, limit: 2 });

    expect(catalogue.listImages).toHaveBeenCalledWith("library_cover");
    expect(result.structuredContent).toEqual({
      total: 5,
      offset: 2,
      nextOffset: 4,
      covers: [
        {
          catalogueId: entries[2].id,
          label: "Cover 3",
          publicUrl: `${BUCKET}/${entries[2].path}`,
          uploadedAt: "2026-09-01T10:00:00Z",
          usedBy: [{ articleId: ID, title: "Screen time is not the enemy", readersSeeIt: true }],
        },
        expect.objectContaining({ catalogueId: entries[3].id, usedBy: [] }),
      ],
    });
    expect(images(result)).toHaveLength(2);
  });

  it("answers no next page at the end", async () => {
    catalogue.listImages.mockResolvedValue([entry(1)]);
    catalogue.getUsage.mockResolvedValue({});
    serveBucket({});

    const result = await tool("list_library_covers");

    expect(result.structuredContent).toMatchObject({ total: 1, offset: 0, nextOffset: null });
  });

  it("refuses a page larger than twenty", async () => {
    const result = await tool("list_library_covers", { limit: 21 });

    expect(result.isError).toBe(true);
    expect(catalogue.listImages).not.toHaveBeenCalled();
  });
});

describe("set_library_article_cover", () => {
  it("sets the cover by catalogue id and answers it", async () => {
    const result = await tool("set_library_article_cover", { articleId: ID, coverImageId: COVER_ID });

    expect(library.setArticleCover).toHaveBeenCalledWith(ID, COVER_ID);
    expect(result.structuredContent).toEqual({
      articleId: ID,
      cover: { catalogueId: COVER_ID, label: "Clock", publicUrl: `${BUCKET}/clock.jpg` },
      live: false,
      hasUnpublishedChanges: false,
    });
  });

  it("clears it with null", async () => {
    library.getAdminArticle.mockResolvedValue({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, coverImageId: null, coverPath: null, coverLabel: null },
    });

    const result = await tool("set_library_article_cover", { articleId: ID, coverImageId: null });

    expect(library.setArticleCover).toHaveBeenCalledWith(ID, null);
    expect(result.structuredContent).toMatchObject({ cover: null });
  });

  it("quotes the database's refusal of an entry that is not a Library cover", async () => {
    const sentence =
      "That picture is a product picture, and a Library cover has to be a library_cover one (catalogue_images row x)";
    library.setArticleCover.mockRejectedValue(
      Object.assign(new Error(sentence), { code: "23514", details: null, hint: null }),
    );

    const result = await tool("set_library_article_cover", { articleId: ID, coverImageId: COVER_ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(sentence);
  });
});

describe("the uploader", () => {
  const STORED: CatalogueImage = { ...entry(9), label: "Castle" };

  it("stores a 1600 x 900 JPEG through the catalogue's own find-or-create, bucket on the service role and row on the admin's client", async () => {
    mockFindOrCreate.mockResolvedValue({ status: "added", image: STORED });
    const bytes = await jpeg(1600, 900);

    const result = await tool("upload_library_cover", {
      fileName: "castle.jpg",
      jpegBase64: bytes.toString("base64"),
    });

    expect(result.isError).toBeUndefined();
    expect(mockFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        db: bearerClient,
        admin: adminClient,
        ext: "jpg",
        contentType: "image/jpeg",
        label: "castle",
        purpose: "library_cover",
      }),
    );
    const [{ file }] = mockFindOrCreate.mock.calls[0];
    expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
    expect(result.structuredContent).toEqual({
      status: "added",
      image: { catalogueId: STORED.id, label: "Castle", publicUrl: `${BUCKET}/${STORED.path}` },
    });
  });

  it("answers the entry already holding the same bytes", async () => {
    mockFindOrCreate.mockResolvedValue({ status: "existing", image: STORED });

    const result = await tool("upload_library_cover", {
      fileName: "again.jpeg",
      label: "Another name",
      jpegBase64: (await jpeg(1600, 900)).toString("base64"),
    });

    expect(mockFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({ label: "Another name" }));
    expect(result.structuredContent).toMatchObject({ status: "existing", image: { catalogueId: STORED.id } });
  });

  it.each([
    ["text that is not base64", { fileName: "a.jpg", jpegBase64: "not*base64" }, "The picture did not arrive as base64."],
    ["a picture over the 4 MB cap", { fileName: "a.jpg", jpegBase64: "A".repeat(5_600_000) }, "Image must be 4 MB or smaller"],
    ["a name that is not a JPEG's", { fileName: "a.png", jpegBase64: "/9j/" }, "Unsupported file type. Use a JPEG."],
  ])("refuses %s before reading it", async (_, args, sentence) => {
    const result = await tool("upload_library_cover", args);

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(sentence);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not a JPEG, whatever the name says", async () => {
    const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png()
      .toBuffer();

    const result = await tool("upload_library_cover", { fileName: "a.jpg", jpegBase64: png.toString("base64") });

    expect(resultText(result)).toBe("Unsupported file type. Use a JPEG.");
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("refuses a JPEG that is not exactly a cover's size", async () => {
    const result = await tool("upload_library_cover", {
      fileName: "a.jpg",
      jpegBase64: (await jpeg(800, 600)).toString("base64"),
    });

    expect(resultText(result)).toBe("A Library cover must be exactly 1600 × 900 pixels; this one is 800 × 600");
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("opens on an article it can find, telling a client without views where else to upload", async () => {
    const result = await tool("open_cover_uploader", { articleId: ID });

    expect(result.structuredContent).toEqual({
      articleId: ID,
      title: "Screen time is not the enemy",
      currentCover: { catalogueId: COVER_ID, label: "Clock", publicUrl: `${BUCKET}/clock.jpg` },
      // What the shared picture uploader reads: the purpose's size, and the
      // store-then-set calls it makes.
      uploader: {
        purpose: "library_cover",
        heading: "Library cover",
        subject: "For “Screen time is not the enemy”",
        frame: { width: 1600, height: 900, maxBytes: expect.any(Number) },
        uploadTool: "upload_library_cover",
        place: expect.objectContaining({
          tool: "set_library_article_cover",
          arguments: { articleId: ID },
          imageArgument: "coverImageId",
        }),
      },
    });
    expect(resultText(result)).toContain("the admin can upload the cover in the Sogverse editor");
  });

  it("refuses to open on an article that does not exist", async () => {
    library.getAdminArticle.mockResolvedValue(null);

    const result = await tool("open_cover_uploader", { articleId: ID });

    expect(result.isError).toBe(true);
  });
});

describe("the uploader as an MCP Apps view", () => {
  const rpc = async (method: string, params: Record<string, unknown> = {}) =>
    readRpc(await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method, params })));

  it("lists the opening tool with its view, and the upload tool as callable by the view alone", async () => {
    const { tools } = z
      .object({
        tools: z.array(z.object({ name: z.string(), _meta: z.record(z.unknown()).optional() })),
      })
      .parse((await rpc("tools/list")).result);

    const uri = "ui://sogverse/picture-uploader.html";
    expect(tools.find((t) => t.name === "open_cover_uploader")?._meta).toEqual({
      ui: { resourceUri: uri },
      "ui/resourceUri": uri,
    });
    expect(tools.find((t) => t.name === "upload_library_cover")?._meta).toEqual({
      ui: { resourceUri: uri, visibility: ["app"] },
      "ui/resourceUri": uri,
    });
  });

  it("serves the built view as an MCP Apps resource", async () => {
    const uri = "ui://sogverse/picture-uploader.html";

    const listed = z
      .object({ resources: z.array(z.object({ uri: z.string(), mimeType: z.string() })) })
      .parse((await rpc("resources/list")).result);
    expect(listed.resources).toContainEqual(
      expect.objectContaining({ uri, mimeType: "text/html;profile=mcp-app" }),
    );

    const read = z
      .object({
        contents: z.array(
          z.object({ uri: z.string(), mimeType: z.string(), text: z.string(), _meta: z.unknown() }),
        ),
      })
      .parse((await rpc("resources/read", { uri })).result);
    expect(read.contents).toHaveLength(1);
    expect(read.contents[0]).toMatchObject({
      uri,
      mimeType: "text/html;profile=mcp-app",
      _meta: { ui: { prefersBorder: true } },
    });
    expect(read.contents[0].text).toMatch(/^<!doctype html>/i);
    // The view names no tool of its own: the opening tool hands it them.
    expect(read.contents[0].text).toContain("uploadTool");
    // One file: nothing for the host's default policy to block.
    expect(read.contents[0].text).not.toMatch(/<script[^>]+src=/);
  });
});
