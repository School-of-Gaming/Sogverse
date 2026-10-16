import sharp from "sharp";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MCP_TEST_ORIGIN as ORIGIN,
  callTool,
  mcpRequest,
  readRpc,
  resultText,
} from "../../helpers/mcp";
import type {
  AdminLandingPage,
  AdminLandingPageListItem,
} from "@/services/landing-pages";
import type { CatalogueImage } from "@/types";

/**
 * **The landing page tools, through the real endpoint.** The real gate, SDK
 * and tool modules, with the landing page and catalogue services mocked: what
 * is under test is what each tool sends the service — the structure with new
 * ids given, one language's words checked against the structure and the
 * markdown subset — and how it reads the answer back to the AI app: the
 * publish forecast, the addresses, and a database refusal returned as a tool
 * error carrying the database's own sentence.
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

const landing = {
  listAdminPages: vi.fn(),
  getAdminPage: vi.fn(),
  createPage: vi.fn(),
  saveStructure: vi.fn(),
  saveVersion: vi.fn(),
  removeVersion: vi.fn(),
  publishPage: vi.fn(),
  unpublishPage: vi.fn(),
};
vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: vi.fn(() => landing),
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

// The links name each locale's own address, so the real navigation is taken
// over the shared setup's locale-blind mock.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const BUCKET = `${SUPABASE_URL}/storage/v1/object/public/landing-images`;
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";

const ID = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const HERO = "a1000000-0000-4000-8000-000000000001";
const TEXT = "a1000000-0000-4000-8000-000000000002";
const FAQ = "a1000000-0000-4000-8000-000000000003";
const GALLERY = "a1000000-0000-4000-8000-000000000004";
const QUESTION = "b2000000-0000-4000-8000-000000000001";
const PICTURE_ITEM = "b2000000-0000-4000-8000-000000000002";
const CASTLE = "9d39dd23-2b00-43f4-a0f5-af63bd58ad67";
const FIELD = "9d39dd23-2b00-43f4-a0f5-af63bd58ad68";

const tool = (name: string, args: Record<string, unknown> = {}) =>
  callTool(POST, name, args);

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 51, g: 102, b: 153 } } })
    .jpeg()
    .toBuffer();

/**
 * Live in English; the Finnish was written since but lacks the FAQ's answer,
 * so a publish would leave it out.
 */
const PAGE: AdminLandingPage = {
  draft: {
    id: ID,
    sections: [
      { id: HERO, type: "hero", imageId: CASTLE, button: { kind: "internal", path: "/shop" } },
      { id: TEXT, type: "text", imageSide: "start" },
      { id: FAQ, type: "faq", items: [{ id: QUESTION }] },
      { id: GALLERY, type: "image", images: [{ id: PICTURE_ITEM, imageId: CASTLE }] },
    ],
    pictures: { [CASTLE]: { path: "castle.jpg", purpose: "landing_image" } },
    versions: [
      {
        locale: "en",
        title: "Gaming clubs in Espoo",
        summary: "After-school clubs.",
        slug: "gaming-clubs-in-espoo",
        sectionTexts: {},
        missing: [],
      },
      {
        locale: "fi",
        title: "Pelikerhot Espoossa",
        summary: "Kerhoja.",
        slug: "pelikerhot-espoossa",
        sectionTexts: {},
        missing: [`sections.${FAQ}.items.${QUESTION}.answer`],
      },
    ],
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-04T12:00:00Z",
    lastSavedBy: "Kyle Hutchinson",
    lastSavedVia: { clientId: CLIENT_ID, name: "Claude" },
  },
  publication: {
    id: ID,
    firstPublishedAt: "2026-10-02T10:00:00Z",
    publishedAt: "2026-10-03T10:00:00Z",
    sections: [],
    pictures: {},
    versions: [
      {
        locale: "en",
        title: "Gaming clubs in Espoo",
        summary: "After-school clubs.",
        slug: "gaming-clubs-in-espoo",
        sectionTexts: {},
      },
    ],
  },
  hasUnpublishedChanges: true,
};

const LIST_ITEM: AdminLandingPageListItem = {
  id: ID,
  versions: [
    {
      locale: "en",
      title: "Gaming clubs in Espoo",
      summary: "After-school clubs.",
      slug: "gaming-clubs-in-espoo",
      isComplete: true,
    },
  ],
  updatedAt: "2026-10-04T12:00:00Z",
  lastSavedBy: "Kyle Hutchinson",
  lastSavedVia: null,
  isPublished: true,
  hasUnpublishedChanges: false,
};

/** The Finnish version's one missing word, as every answer describes it. */
const FI_MISSING = {
  path: `sections.${FAQ}.items.${QUESTION}.answer`,
  sectionNumber: 3,
  sectionType: "faq",
  itemNumber: 1,
  field: "answer",
  text: "Section 3 (Questions and answers), question 1: the answer",
};

function entry(
  n: number,
  purpose: CatalogueImage["purpose"] = "landing_image",
  createdAt = "2026-10-01T10:00:00Z",
): CatalogueImage {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    label: `Picture ${n}`,
    sha256: String(n).padStart(64, "0"),
    path: `${String(n).padStart(64, "0")}.jpg`,
    purpose,
    created_at: createdAt,
  };
}

/** The catalogue answering `entries` to a list of their purpose. */
function catalogueHolds(...entries: CatalogueImage[]) {
  catalogue.listImages.mockImplementation(async (purpose: string) =>
    entries.filter((each) => each.purpose === purpose),
  );
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
  for (const method of Object.values(landing)) method.mockReset();
  landing.getAdminPage.mockResolvedValue(PAGE);
  catalogue.listImages.mockReset();
  catalogue.getUsage.mockReset();
  mockFindOrCreate.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(await jpeg(1600, 900)))),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A refusal as supabase-js hands one over: the SQLSTATE and the database's sentence. */
function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { code, details: null, hint: null });
}

describe("reading", () => {
  it("lists every page with its languages and who saved it", async () => {
    landing.listAdminPages.mockResolvedValue([LIST_ITEM]);

    const result = await tool("list_landing_pages");

    expect(result.structuredContent).toEqual({
      pages: [
        {
          pageId: ID,
          versions: [
            { locale: "en", title: "Gaming clubs in Espoo", slug: "gaming-clubs-in-espoo", complete: true },
          ],
          live: true,
          hasUnpublishedChanges: false,
          lastSaved: { at: "2026-10-04T12:00:00Z", by: "Kyle Hutchinson", via: null },
        },
      ],
    });
  });

  it("reads one page whole, with addresses, completeness and what a publish would do", async () => {
    const result = await tool("get_landing_page", { pageId: ID });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      pageId: ID,
      sections: PAGE.draft.sections,
      pictures: [{ catalogueId: CASTLE, shape: "wide 16:9", publicUrl: `${BUCKET}/castle.jpg` }],
      lastSaved: { by: "Kyle Hutchinson", via: { name: "Claude" } },
      hasUnpublishedChanges: true,
      publish: {
        canPublish: true,
        wouldPutLive: ["en"],
        wouldLeaveOut: [{ locale: "fi", missing: [FI_MISSING] }],
        wouldTakeDown: [],
        // English is live at the address it has saved.
        slugsChanging: [],
      },
      live: {
        versions: [
          { locale: "en", publicLink: `${ORIGIN}/en/discover/gaming-clubs-in-espoo` },
        ],
      },
      adminLink: `${ORIGIN}/en/admin/landing-pages/${ID}`,
    });
    expect(result.structuredContent?.versions).toEqual([
      expect.objectContaining({
        locale: "en",
        complete: true,
        live: true,
        address: `${ORIGIN}/en/discover/gaming-clubs-in-espoo`,
        previewLink: `${ORIGIN}/en/discover/${ID}/preview`,
      }),
      expect.objectContaining({
        locale: "fi",
        complete: false,
        live: false,
        address: `${ORIGIN}/fi/tutustu/pelikerhot-espoossa`,
        previewLink: `${ORIGIN}/fi/tutustu/${ID}/esikatselu`,
      }),
    ]);
    // The page's picture, shown small and named in text.
    expect(result.content.filter((block) => block.type === "image")).toHaveLength(1);
    expect(resultText(result)).toContain(`Picture ${CASTLE} (wide 16:9): ${BUCKET}/castle.jpg`);
  });

  it("lists the live addresses a publish would change, with both links, and none for a language going live first", async () => {
    const [en, fi] = PAGE.draft.versions;
    landing.getAdminPage.mockResolvedValue({
      ...PAGE,
      draft: {
        ...PAGE.draft,
        versions: [
          { ...en, slug: "espoo-clubs" },
          { ...fi, missing: [] },
        ],
      },
    } satisfies AdminLandingPage);

    const result = await tool("get_landing_page", { pageId: ID });

    expect(result.structuredContent?.publish).toMatchObject({
      wouldPutLive: ["en", "fi"],
      slugsChanging: [
        {
          locale: "en",
          from: "gaming-clubs-in-espoo",
          to: "espoo-clubs",
          fromAddress: `${ORIGIN}/en/discover/gaming-clubs-in-espoo`,
          toAddress: `${ORIGIN}/en/discover/espoo-clubs`,
        },
      ],
    });
  });

  it("answers an id no page has as a tool error", async () => {
    landing.getAdminPage.mockResolvedValue(null);

    const result = await tool("get_landing_page", { pageId: ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("No landing page has that id.");
  });

  it("links the preview in the language asked for, and says which version it shows", async () => {
    const result = await tool("get_landing_page_preview_link", { pageId: ID, locale: "fr" });

    expect(result.structuredContent).toEqual({
      pageId: ID,
      locale: "fr",
      shows: "en",
      previewLink: `${ORIGIN}/fr/decouvrir/${ID}/apercu`,
    });
  });

  it("states the section rules in the write tools' descriptions, built from the registry", async () => {
    const body = await readRpc(
      await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })),
    );
    const { tools } = z
      .object({ tools: z.array(z.object({ name: z.string(), description: z.string() })) })
      .parse(body.result);
    const structure = tools.find((t) => t.name === "save_landing_page_structure")?.description;

    expect(structure).toContain("A page starts with its hero section");
    expect(structure).toContain("headline; imageAlt when imageId is set; buttonLabel when button is set");
    expect(structure).toContain("drops its words in every language");
    // Which shapes each section's pictures may be, from the section registry.
    expect(structure).toContain("Its picture must be wide 16:9.");
    expect(structure).toContain(
      "Its pictures may be wide 16:9, square 1:1 or portrait 4:5, all one shape.",
    );
    const uploader = tools.find((t) => t.name === "open_landing_image_uploader")?.description;
    expect(uploader).toContain(
      "wide 16:9 (1600 × 900), square 1:1 (1200 × 1200) or portrait 4:5 (1200 × 1500)",
    );
    expect(uploader).toContain("hero, wide 16:9 only; text, any shape; image, any shape");
    expect(uploader).toContain("never offer to pad, stretch or crop it on their behalf");
    const text = tools.find((t) => t.name === "save_landing_page_text")?.description;
    expect(text).toContain("A slug can be changed at any time");
    expect(text).toContain(
      "Before a publish that changes a live language's address, confirm the change with the admin",
    );
    const publish = tools.find((t) => t.name === "publish_landing_page")?.description;
    expect(publish).toContain(
      "Before a publish that changes a live language's address, confirm it with the admin, because links shared outside the site to the old address stop working",
    );
    expect(publish).toContain("slugsChanging");
    for (const { name, description } of tools) {
      if (name.includes("landing")) expect(description, name).not.toMatch(/fixed for good|permanent/i);
    }
    // Landing pages are written only here: nothing sends the admin to an editor.
    for (const { name, description } of tools) {
      if (name.includes("landing")) expect(description, name).not.toMatch(/editor/i);
    }
  });
});

describe("creating", () => {
  it("gives new sections ids, writes the first language and answers the address", async () => {
    landing.createPage.mockResolvedValue(ID);

    const result = await tool("create_landing_page", {
      locale: "fi",
      title: " Pelikerhot Espoossa ",
      sections: [
        { id: HERO, type: "hero" },
        { type: "steps", items: [{}, {}] },
      ],
      sectionTexts: { [HERO]: { headline: "Pelikerhot" } },
    });

    expect(result.isError).toBeUndefined();
    const [input] = landing.createPage.mock.calls[0];
    expect(input.versions).toEqual([
      {
        locale: "fi",
        title: "Pelikerhot Espoossa",
        summary: "",
        slug: undefined,
        sectionTexts: { [HERO]: { headline: "Pelikerhot" } },
      },
    ]);
    expect(input.sections[0]).toEqual({ id: HERO, type: "hero" });
    expect(input.sections[1]).toMatchObject({
      type: "steps",
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      items: [
        { id: expect.stringMatching(/^[0-9a-f-]{36}$/) },
        { id: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      ],
    });
    expect(result.structuredContent).toMatchObject({
      pageId: ID,
      slug: "pelikerhot-espoossa",
      address: `${ORIGIN}/fi/tutustu/pelikerhot-espoossa`,
      complete: false,
      previewLink: `${ORIGIN}/fi/tutustu/${ID}/esikatselu`,
    });
  });

  it("refuses a structure that does not start with its hero, and saves nothing", async () => {
    const result = await tool("create_landing_page", {
      locale: "en",
      title: "A page",
      sections: [{ type: "cta", button: { kind: "internal", path: "/shop" } }],
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("A page starts with its hero section");
    expect(landing.createPage).not.toHaveBeenCalled();
  });

  it.each([
    ["shaped like an id", ID, "may not look like a page id: those are kept for each page's id address"],
    ["in capitals, suggesting the lowercase", "Gaming-Clubs", '"gaming-clubs" would do'],
  ])("refuses a slug %s before anything is sent", async (_, slug, named) => {
    const result = await tool("create_landing_page", {
      locale: "en",
      title: "A page",
      slug,
      sections: [{ type: "hero" }],
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(named);
    expect(landing.createPage).not.toHaveBeenCalled();
  });

  it("takes a button that opens an email", async () => {
    landing.createPage.mockResolvedValue(ID);

    const result = await tool("create_landing_page", {
      locale: "en",
      title: "A page",
      sections: [
        { id: HERO, type: "hero", button: { kind: "email", to: " hello@sog.gg " } },
      ],
      sectionTexts: {
        [HERO]: { headline: "Hello", buttonLabel: "Email us", emailSubject: "A club" },
      },
    });

    expect(result.isError).toBeUndefined();
    const [input] = landing.createPage.mock.calls[0];
    expect(input.sections).toEqual([
      { id: HERO, type: "hero", button: { kind: "email", to: "hello@sog.gg" } },
    ]);
    expect(input.versions[0].sectionTexts).toEqual({
      [HERO]: { headline: "Hello", buttonLabel: "Email us", emailSubject: "A club" },
    });
  });

  it.each([
    [
      "a button's address, naming the section by number and type",
      [
        { type: "hero" },
        { type: "cta", button: { kind: "external", url: "ftp://example.com" } },
      ],
      "Section 2 (Call to action), button.url: ",
    ],
    [
      "an item's field, naming the item by number",
      [
        { type: "hero" },
        { type: "points", items: [{ icon: "star" }, { icon: "unicorn" }] },
      ],
      "Section 2 (Points), point 2, icon: ",
    ],
    [
      "an email button with more than an address",
      [{ type: "hero", button: { kind: "email", to: "a@sog.gg", subject: "Hi" } }],
      "Section 1 (Hero), button: ",
    ],
  ])("refuses %s, counting from one", async (_, sections, named) => {
    const result = await tool("create_landing_page", { locale: "en", title: "A page", sections });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(named);
    expect(resultText(result)).not.toMatch(/sections[.,]\d/);
    expect(landing.createPage).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("saves the whole structure and names the sections it removed", async () => {
    const after: AdminLandingPage = {
      ...PAGE,
      draft: { ...PAGE.draft, sections: [PAGE.draft.sections[0]] },
    };
    landing.getAdminPage.mockResolvedValueOnce(PAGE).mockResolvedValueOnce(after);

    const result = await tool("save_landing_page_structure", {
      pageId: ID,
      sections: [PAGE.draft.sections[0]],
    });

    expect(landing.saveStructure).toHaveBeenCalledWith(ID, [PAGE.draft.sections[0]]);
    expect(result.structuredContent).toMatchObject({
      removedSections: [
        { id: TEXT, type: "text" },
        { id: FAQ, type: "faq" },
        { id: GALLERY, type: "image" },
      ],
      languages: [
        { locale: "en", complete: true },
        { locale: "fi", complete: false },
      ],
    });
  });

  it("writes one language's words checked against the structure", async () => {
    const sectionTexts = {
      [HERO]: { headline: "Pelikerhot", buttonLabel: "Kauppaan", imageAlt: "Linna" },
      [FAQ]: { heading: "Kysymyksiä", items: { [QUESTION]: { question: "Mitä?", answer: "**Pelejä**." } } },
      [GALLERY]: { alts: { [PICTURE_ITEM]: "Linna" } },
    };

    const result = await tool("save_landing_page_text", {
      pageId: ID,
      locale: "fi",
      title: "Pelikerhot Espoossa",
      summary: "Kerhoja.",
      sectionTexts,
    });

    expect(result.isError).toBeUndefined();
    expect(landing.saveVersion).toHaveBeenCalledWith(ID, {
      locale: "fi",
      title: "Pelikerhot Espoossa",
      summary: "Kerhoja.",
      slug: undefined,
      sectionTexts,
    });
    expect(result.structuredContent).toMatchObject({
      locale: "fi",
      slug: "pelikerhot-espoossa",
      languageIsLive: false,
      complete: false,
    });
  });

  it.each([
    [
      "a section the page does not have",
      { "c3000000-0000-4000-8000-000000000009": { heading: "x" } },
      "Words were sent for a section this page's structure does not have (id c3000000-0000-4000-8000-000000000009). Read get_landing_page for the page's current section ids",
    ],
    ["another type's fields", { [TEXT]: { headline: "x" } }, "The words of section 2 (Text): "],
    [
      "a field of the wrong shape inside an item",
      { [FAQ]: { items: { [QUESTION]: { question: 3 } } } },
      "The words of section 3 (Questions and answers), question 1, question: ",
    ],
    [
      "words for an item the section does not have",
      { [FAQ]: { items: { [PICTURE_ITEM]: { question: "?" } } } },
      `The words of section 3 (Questions and answers), items: ${PICTURE_ITEM} is not the id of one of the section's items`,
    ],
    [
      "markdown outside the landing subset",
      { [TEXT]: { heading: "x", body: "![A castle](https://x.test/c.jpg)" } },
      "The words of section 2 (Text), body: uses markdown a landing page does not show — an image (![alt](url)) on line 1",
    ],
  ])("refuses %s, naming it, and saves nothing", async (_, sectionTexts, named) => {
    const result = await tool("save_landing_page_text", {
      pageId: ID,
      locale: "en",
      title: "T",
      summary: "S",
      sectionTexts,
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(named);
    expect(landing.saveVersion).not.toHaveBeenCalled();
  });

  it("quotes the database's refusal of a slug another page holds", async () => {
    const sentence =
      'The en address "another-address" is already the address of the landing page "Clubs in Vantaa"; choose another';
    landing.saveVersion.mockRejectedValue(dbError("23505", sentence));

    const result = await tool("save_landing_page_text", {
      pageId: ID,
      locale: "en",
      title: "T",
      summary: "S",
      slug: "another-address",
      sectionTexts: {},
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(sentence);
  });

  it("answers anything else with a generic line", async () => {
    landing.saveVersion.mockRejectedValue(new Error("connection reset"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await tool("save_landing_page_text", {
      pageId: ID,
      locale: "en",
      title: "T",
      summary: "S",
      sectionTexts: {},
    });

    expect(resultText(result)).toContain("Sogverse could not complete this.");
  });
});

describe("removing a language", () => {
  it("removes it from the working copy and forecasts the publish taking a live one down", async () => {
    const [, fi] = PAGE.draft.versions;
    const after: AdminLandingPage = {
      ...PAGE,
      draft: { ...PAGE.draft, versions: [fi] },
    };
    landing.getAdminPage.mockResolvedValueOnce(PAGE).mockResolvedValueOnce(after);

    const result = await tool("remove_landing_page_language", { pageId: ID, locale: "en" });

    expect(landing.removeVersion).toHaveBeenCalledWith(ID, "en");
    expect(result.structuredContent).toEqual({
      pageId: ID,
      removed: "en",
      languageIsLive: true,
      languages: [{ locale: "fi", complete: false, missing: [FI_MISSING] }],
      hasUnpublishedChanges: true,
      publish: {
        canPublish: false,
        wouldPutLive: [],
        wouldLeaveOut: [{ locale: "fi", missing: [FI_MISSING] }],
        wouldTakeDown: ["en"],
        slugsChanging: [],
      },
    });
  });

  it("quotes the database's refusal of the page's last language", async () => {
    const sentence =
      "The en version is the page's only language, and a page keeps at least one; write another language before removing this one";
    landing.removeVersion.mockRejectedValue(dbError("23514", sentence));

    const result = await tool("remove_landing_page_language", { pageId: ID, locale: "en" });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(sentence);
  });

  it("answers an id no page has as a tool error, removing nothing", async () => {
    landing.getAdminPage.mockResolvedValue(null);

    const result = await tool("remove_landing_page_language", { pageId: ID, locale: "en" });

    expect(result.isError).toBe(true);
    expect(landing.removeVersion).not.toHaveBeenCalled();
  });
});

describe("publishing", () => {
  it("answers what went live, what was left out and the public links", async () => {
    const result = await tool("publish_landing_page", { pageId: ID });

    expect(landing.publishPage).toHaveBeenCalledWith(ID);
    expect(result.structuredContent).toEqual({
      pageId: ID,
      live: ["en"],
      leftOut: [{ locale: "fi", missing: [FI_MISSING] }],
      takenDown: [],
      slugsChanged: [],
      publicLinks: [{ locale: "en", publicLink: `${ORIGIN}/en/discover/gaming-clubs-in-espoo` }],
    });
  });

  it("names the live addresses this publish changed", async () => {
    const [en] = PAGE.draft.versions;
    const draft = { ...PAGE.draft, versions: [{ ...en, slug: "espoo-clubs" }] };
    const before: AdminLandingPage = { ...PAGE, draft };
    const after: AdminLandingPage = {
      ...PAGE,
      draft,
      publication: PAGE.publication && {
        ...PAGE.publication,
        versions: PAGE.publication.versions.map((v) => ({ ...v, slug: "espoo-clubs" })),
      },
    };
    landing.getAdminPage.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await tool("publish_landing_page", { pageId: ID });

    expect(result.structuredContent).toMatchObject({
      live: ["en"],
      slugsChanged: [{ locale: "en", from: "gaming-clubs-in-espoo", to: "espoo-clubs" }],
    });
  });

  it("quotes the database's refusal of a page with nothing complete", async () => {
    const sentence = "A landing page needs at least one complete language version to publish";
    landing.publishPage.mockRejectedValue(dbError("23514", sentence));

    const result = await tool("publish_landing_page", { pageId: ID });

    expect(resultText(result)).toBe(sentence);
  });

  it("unpublishes, keeping the working copy", async () => {
    const result = await tool("unpublish_landing_page", { pageId: ID });

    expect(landing.unpublishPage).toHaveBeenCalledWith(ID);
    expect(result.structuredContent).toEqual({ pageId: ID, wasLive: true, live: false });
  });
});

describe("pictures", () => {
  it("lists the landing page entries with the pages that show them", async () => {
    catalogueHolds(entry(1));
    catalogue.getUsage.mockResolvedValue({
      [entry(1).id]: [{ kind: "landing-page", id: ID, title: "Gaming clubs in Espoo", is_live: true }],
    });

    const result = await tool("list_landing_images");

    expect(catalogue.listImages).toHaveBeenCalledWith("landing_image");
    expect(result.structuredContent).toEqual({
      total: 1,
      offset: 0,
      nextOffset: null,
      pictures: [
        {
          catalogueId: entry(1).id,
          shape: "wide 16:9",
          label: "Picture 1",
          publicUrl: `${BUCKET}/${entry(1).path}`,
          uploadedAt: "2026-10-01T10:00:00Z",
          usedBy: [{ pageId: ID, title: "Gaming clubs in Espoo", readersSeeIt: true }],
        },
      ],
    });
    expect(result.content.filter((block) => block.type === "image")).toHaveLength(1);
  });

  it("lists every shape newest first, each from its own bucket, or one shape alone", async () => {
    catalogueHolds(
      entry(1, "landing_image", "2026-10-01T10:00:00Z"),
      entry(2, "landing_square_image", "2026-10-03T10:00:00Z"),
      entry(3, "landing_portrait_image", "2026-10-02T10:00:00Z"),
    );
    catalogue.getUsage.mockResolvedValue({});

    const every = await tool("list_landing_images");
    expect(every.structuredContent?.pictures).toEqual([
      expect.objectContaining({
        catalogueId: entry(2).id,
        shape: "square 1:1",
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/landing-square-images/${entry(2).path}`,
      }),
      expect.objectContaining({
        catalogueId: entry(3).id,
        shape: "portrait 4:5",
        publicUrl: `${SUPABASE_URL}/storage/v1/object/public/landing-portrait-images/${entry(3).path}`,
      }),
      expect.objectContaining({ catalogueId: entry(1).id, shape: "wide 16:9" }),
    ]);

    catalogue.listImages.mockClear();
    const square = await tool("list_landing_images", { shape: "square" });
    expect(catalogue.listImages).toHaveBeenCalledTimes(1);
    expect(catalogue.listImages).toHaveBeenCalledWith("landing_square_image");
    expect(square.structuredContent).toMatchObject({ total: 1 });
  });

  it("replaces a hero's picture, touching nothing else in the structure", async () => {
    await tool("set_landing_section_image", { pageId: ID, sectionId: HERO, imageId: FIELD });

    expect(landing.saveStructure).toHaveBeenCalledWith(ID, [
      { ...PAGE.draft.sections[0], imageId: FIELD },
      ...PAGE.draft.sections.slice(1),
    ]);
  });

  it("adds a picture to an image section and answers its new item id", async () => {
    const result = await tool("set_landing_section_image", {
      pageId: ID,
      sectionId: GALLERY,
      imageId: FIELD,
    });

    const [, sections] = landing.saveStructure.mock.calls[0];
    const gallery = sections[3];
    expect(gallery.images).toEqual([
      { id: PICTURE_ITEM, imageId: CASTLE },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), imageId: FIELD },
    ]);
    expect(result.structuredContent?.pictureId).toBe(gallery.images[1].id);
  });

  it("reads a section id and a picture item id sent in capitals as the stored lowercase ids", async () => {
    const result = await tool("set_landing_section_image", {
      pageId: ID,
      sectionId: GALLERY.toUpperCase(),
      pictureId: PICTURE_ITEM.toUpperCase(),
      imageId: FIELD,
    });

    expect(result.isError).toBeFalsy();
    const [, sections] = landing.saveStructure.mock.calls[0];
    expect(sections[3].images).toEqual([{ id: PICTURE_ITEM, imageId: FIELD }]);
  });

  it.each([
    ["the last picture of an image section", { sectionId: GALLERY, imageId: null, pictureId: PICTURE_ITEM }, "remove the section"],
    ["a picture in a section with none", { sectionId: FAQ, imageId: FIELD }, "A faq section has no picture."],
    ["a picture item in a hero", { sectionId: HERO, imageId: FIELD, pictureId: PICTURE_ITEM }, "leave pictureId out"],
  ])("refuses %s", async (_, args, named) => {
    const result = await tool("set_landing_section_image", { pageId: ID, ...args });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(named);
    expect(landing.saveStructure).not.toHaveBeenCalled();
  });

  /** The page with its image section holding `count` pictures, all wide. */
  function withGallery(count: number): AdminLandingPage {
    const images = Array.from({ length: count }, (_, n) => ({
      id: `b2000000-0000-4000-8000-${String(n + 10).padStart(12, "0")}`,
      imageId: CASTLE,
    }));
    return {
      ...PAGE,
      draft: {
        ...PAGE.draft,
        sections: PAGE.draft.sections.map((section) =>
          section.id === GALLERY ? { id: GALLERY, type: "image" as const, images } : section,
        ),
      },
    };
  }

  /** The three frames, each refused with `refusals[shape]` (null: taken). */
  function frames(refusals: { wide: string | null; square: string | null; portrait: string | null }) {
    return [
      { purpose: "landing_image", name: "wide 16:9", width: 1600, height: 900, uploadTool: "upload_landing_image", refusal: refusals.wide },
      { purpose: "landing_square_image", name: "square 1:1", width: 1200, height: 1200, uploadTool: "upload_landing_square_image", refusal: refusals.square },
      { purpose: "landing_portrait_image", name: "portrait 4:5", width: 1200, height: 1500, uploadTool: "upload_landing_portrait_image", refusal: refusals.portrait },
    ];
  }

  const EVERY_SHAPE = { wide: null, square: null, portrait: null };

  it("opens the uploader to place a picture in a hero, which takes a wide picture alone", async () => {
    const result = await tool("open_landing_image_uploader", { pageId: ID, sectionId: HERO });

    const heroRule = "A hero section's picture must be wide 16:9.";
    expect(result.structuredContent).toEqual({
      pageId: ID,
      title: "Gaming clubs in Espoo",
      sectionId: HERO,
      accepts: "wide 16:9",
      uploader: {
        heading: "Landing page picture",
        subject: "For “Gaming clubs in Espoo”",
        frames: frames({ wide: null, square: heroRule, portrait: heroRule }),
        noFrame: heroRule,
        room: { pictures: 1, full: "A hero section shows one picture: only the first that fits is taken." },
        oneShape: null,
        maxBytes: expect.any(Number),
        place: expect.objectContaining({
          tool: "set_landing_section_image",
          arguments: { pageId: ID, sectionId: HERO },
          imageArgument: "imageId",
          list: false,
        }),
      },
    });
    expect(resultText(result)).toContain("it takes pictures that are already wide 16:9, one picture");
  });

  it("takes every shape for a text section, and for the catalogue alone", async () => {
    const text = await tool("open_landing_image_uploader", { pageId: ID, sectionId: TEXT });
    const alone = await tool("open_landing_image_uploader", { pageId: ID });

    for (const result of [text, alone]) {
      expect(result.structuredContent).toMatchObject({
        accepts: "wide 16:9, square 1:1 or portrait 4:5",
        uploader: {
          frames: frames(EVERY_SHAPE),
          noFrame: "A landing page picture must be wide 16:9, square 1:1 or portrait 4:5.",
        },
      });
    }
    expect(text.structuredContent).toMatchObject({
      uploader: {
        room: { pictures: 1, full: "A text section shows one picture: only the first that fits is taken." },
        oneShape: null,
        place: { imageArgument: "imageId", list: false },
      },
    });
    // The catalogue alone takes any number, of any mix of shapes.
    expect(alone.structuredContent).toMatchObject({
      sectionId: null,
      uploader: { room: null, oneShape: null, place: null },
    });
    expect(resultText(alone)).toContain("as many as they like at once");
  });

  it("takes as many pictures as an image section has room for, of one shape, placed in one call", async () => {
    const result = await tool("open_landing_image_uploader", { pageId: ID, sectionId: GALLERY });

    expect(result.structuredContent).toMatchObject({
      uploader: {
        room: {
          pictures: 3,
          full: "An image section shows at most four pictures, and this one has room for 3 more: the first 3 that fit are taken, in the order picked.",
        },
        oneShape: "An image section's pictures must all be one shape, so its grid lines up.",
        place: {
          tool: "set_landing_section_image",
          arguments: { pageId: ID, sectionId: GALLERY },
          imageArgument: "imageIds",
          list: true,
        },
      },
    });
    expect(resultText(result)).toContain("up to 3 at once");

    // One place left: the batch takes one picture, placed by its one id.
    landing.getAdminPage.mockResolvedValue(withGallery(3));
    const last = await tool("open_landing_image_uploader", { pageId: ID, sectionId: GALLERY });
    expect(last.structuredContent).toMatchObject({
      uploader: {
        room: {
          pictures: 1,
          full: "An image section shows at most four pictures, and this one has room for one more: only the first that fits is taken.",
        },
        place: { imageArgument: "imageId", list: false },
      },
    });

    // Replacing one picture takes one, by imageId.
    landing.getAdminPage.mockResolvedValue(PAGE);
    const replacing = await tool("open_landing_image_uploader", {
      pageId: ID,
      sectionId: GALLERY,
      pictureId: PICTURE_ITEM,
    });
    expect(replacing.structuredContent).toMatchObject({
      uploader: {
        room: { pictures: 1, full: "Replacing a picture takes one: only the first that fits is taken." },
        oneShape: null,
        place: { arguments: { pictureId: PICTURE_ITEM }, imageArgument: "imageId", list: false },
      },
    });
  });

  it("refuses to open on a full image section, before the admin picks anything", async () => {
    landing.getAdminPage.mockResolvedValue(withGallery(4));

    const result = await tool("open_landing_image_uploader", { pageId: ID, sectionId: GALLERY });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("at most four pictures");
  });

  it("tells the AI app that several pictures can be picked at once, and how many each destination takes", async () => {
    const { tools } = z
      .object({ tools: z.array(z.object({ name: z.string(), description: z.string().optional() })) })
      .parse(
        (await readRpc(await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }))))
          .result,
      );
    const opening = tools.find((t) => t.name === "open_landing_image_uploader")?.description;
    expect(opening).toContain("several at once");
    expect(opening).toContain("without a sectionId, any number");
    expect(opening).toContain("as many as it has room for (it shows at most four), all of one shape");
    expect(opening).toContain("each uploaded picture's new catalogue id, shape and the file name it came from");
    const set = tools.find((t) => t.name === "set_landing_section_image")?.description;
    expect(set).toContain("send imageIds in place of imageId");
  });

  it("adds several pictures to an image section in one write, in order, answering their item ids", async () => {
    const result = await tool("set_landing_section_image", {
      pageId: ID,
      sectionId: GALLERY,
      imageIds: [FIELD, CASTLE],
    });

    expect(result.isError).toBeFalsy();
    expect(landing.saveStructure).toHaveBeenCalledTimes(1);
    const [, sections] = landing.saveStructure.mock.calls[0];
    expect(sections[3].images).toEqual([
      { id: PICTURE_ITEM, imageId: CASTLE },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), imageId: FIELD },
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), imageId: CASTLE },
    ]);
    expect(result.structuredContent?.pictureIds).toEqual([sections[3].images[1].id, sections[3].images[2].id]);
    expect(result.structuredContent).not.toHaveProperty("pictureId");
  });

  it("quotes the database's refusal of a batch it will not take, such as one of mixed shapes", async () => {
    landing.saveStructure.mockRejectedValue(
      dbError("23514", "An image section's pictures must all be one shape: wide 16:9 and square 1:1."),
    );

    const result = await tool("set_landing_section_image", {
      pageId: ID,
      sectionId: GALLERY,
      imageIds: [FIELD],
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("An image section's pictures must all be one shape: wide 16:9 and square 1:1.");
  });

  it.each([
    ["more pictures than the section has room for", { sectionId: GALLERY, imageIds: [FIELD, FIELD, FIELD, FIELD] }, "has room for 3 more"],
    ["several pictures for a hero", { sectionId: HERO, imageIds: [FIELD] }, "send imageId, not imageIds"],
    ["imageIds with a pictureId", { sectionId: GALLERY, imageIds: [FIELD], pictureId: PICTURE_ITEM }, "leave pictureId out"],
    ["both imageId and imageIds", { sectionId: GALLERY, imageId: FIELD, imageIds: [FIELD] }, "one of the two"],
    ["neither imageId nor imageIds", { sectionId: GALLERY }, "one of the two"],
  ])("refuses %s, saving nothing", async (_, args, named) => {
    const result = await tool("set_landing_section_image", { pageId: ID, ...args });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(named);
    expect(landing.saveStructure).not.toHaveBeenCalled();
  });

  it("takes only the shape an image section's other pictures already are", async () => {
    const adding = await tool("open_landing_image_uploader", { pageId: ID, sectionId: GALLERY });
    const rule =
      "The other pictures of this image section are wide 16:9, and an image section's pictures must all be one shape.";
    expect(adding.structuredContent).toMatchObject({
      accepts: "wide 16:9",
      uploader: { frames: frames({ wide: null, square: rule, portrait: rule }), noFrame: rule },
    });

    // Replacing the section's only picture leaves no other to match.
    const replacing = await tool("open_landing_image_uploader", {
      pageId: ID,
      sectionId: GALLERY,
      pictureId: PICTURE_ITEM,
    });
    expect(replacing.structuredContent).toMatchObject({
      accepts: "wide 16:9, square 1:1 or portrait 4:5",
      uploader: { frames: frames(EVERY_SHAPE) },
    });
  });

  it("refuses to open on a placement that would be refused, before the admin picks a picture", async () => {
    const result = await tool("open_landing_image_uploader", { pageId: ID, sectionId: FAQ });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("A faq section has no picture.");
  });

  it("stores an uploaded picture as a landing page entry", async () => {
    mockFindOrCreate.mockResolvedValue({ status: "added", image: entry(2) });

    const result = await tool("upload_landing_image", {
      fileName: "field.jpg",
      jpegBase64: (await jpeg(1600, 900)).toString("base64"),
    });

    expect(mockFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ db: bearerClient, admin: adminClient, purpose: "landing_image" }),
    );
    expect(result.structuredContent).toEqual({
      status: "added",
      image: { catalogueId: entry(2).id, label: "Picture 2", publicUrl: `${BUCKET}/${entry(2).path}` },
    });
  });

  it.each([
    ["upload_landing_square_image", "landing_square_image", 1200, 1200],
    ["upload_landing_portrait_image", "landing_portrait_image", 1200, 1500],
  ] as const)("stores a picture through %s as its own shape's entry", async (name, purpose, width, height) => {
    mockFindOrCreate.mockResolvedValue({ status: "added", image: entry(4, purpose) });

    const stored = await tool(name, {
      fileName: "field.jpg",
      jpegBase64: (await jpeg(width, height)).toString("base64"),
    });
    expect(stored.isError).toBeFalsy();
    expect(mockFindOrCreate).toHaveBeenCalledWith(expect.objectContaining({ purpose }));

    // The wide size is not this shape's, and the exact-size check is the last gate.
    mockFindOrCreate.mockClear();
    const refused = await tool(name, {
      fileName: "wide.jpg",
      jpegBase64: (await jpeg(1600, 900)).toString("base64"),
    });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toContain(`must be exactly ${width} × ${height}`);
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });

  it("refuses an upload that is not a landing picture's size", async () => {
    const result = await tool("upload_landing_image", {
      fileName: "a.jpg",
      jpegBase64: (await jpeg(800, 600)).toString("base64"),
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("landing page picture must be exactly 1600 × 900");
    expect(mockFindOrCreate).not.toHaveBeenCalled();
  });
});
