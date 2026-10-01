import { afterAll, describe, expect, it, vi } from "vitest";

// The real wrapped navigation, not the setup's link-rendering stub: the Pages
// and Languages sections are entirely about the locale-prefixed, translated
// URLs `getPathname` builds, and the stub emits no prefix at all.
// `next/navigation` has to come with it — next-intl reads `permanentRedirect`
// off it while constructing the wrapped APIs.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// The handler reads the site URL when it runs, but the modules it pulls in read
// it at import time, so it is set before the dynamic import below.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";
// The handler builds its anonymous client from these; the read itself is mocked.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
afterAll(() => vi.unstubAllEnvs());
const BASE = "https://test.sogverse.local";

// The live Library the file lists: an article in Finnish alone, and an older
// one in English and Finnish.
const mockListPublishedArticles = vi.fn();
vi.mock("@/services/library/library.service", () => ({
  LibraryService: class {
    listPublishedArticles = mockListPublishedArticles;
  },
}));
mockListPublishedArticles.mockResolvedValue([
  {
    id: "70f64c69-1681-4b3b-8ab6-420642e48598",
    category: "learning",
    coverPath: null,
    firstPublishedAt: "2026-06-01T08:00:00Z",
    publishedAt: "2026-06-01T08:00:00Z",
    versions: [
      { locale: "fi", title: "Pelikerho koulupäivän jälkeen", summary: "Mitä kerhossa tapahtuu." },
    ],
  },
  {
    id: "482f0c6f-0fbc-4202-8790-a73a4520fb47",
    category: "screen_time",
    coverPath: null,
    firstPublishedAt: "2026-05-01T08:00:00Z",
    publishedAt: "2026-05-01T08:00:00Z",
    versions: [
      { locale: "en", title: "Setting up a family gaming agreement", summary: "Why it works." },
      { locale: "fi", title: "Pelisopimus perheelle", summary: "Miksi se toimii." },
    ],
  },
]);

const { GET } = await import("@/app/llms.txt/route");
const { PATHNAMES } = await import("@/i18n/pathnames");
const { FAQ_ITEM_KEYS } = await import("@/components/about/about-faq");
const { default: en } = await import("@/../messages/en.json");

const body = await (await GET()).text();

describe("/llms.txt", () => {
  it("is served as plain UTF-8 text", async () => {
    // A crawler that is handed `text/html` will try to parse it as one.
    expect((await GET()).headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
  });

  it("is never served stale, with the sitemap's header", async () => {
    // Next's header for a dynamic sitemap, so the two files are always
    // equally fresh. `public` is the posture that keeps the path out of
    // the proxy's matcher; if it stops being true, that exclusion needs
    // revisiting rather than the header.
    expect((await GET()).headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });

  it("opens with the H1 and the summary blockquote", () => {
    // The llmstxt.org shape: a name, then one paragraph saying what this is.
    expect(body.startsWith("# School of Gaming\n")).toBe(true);
    expect(body).toContain(`> ${en.metadata.description}`);
  });

  it("carries every FAQ question, in the About page's order", () => {
    const questions = FAQ_ITEM_KEYS.map((key) => en.about.faq.items[key].question);
    const positions = questions.map((question) => body.indexOf(`### ${question}`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("answers the questions with the catalog's words, not its markup", () => {
    // The answers are tagged rich text with a `{supportEmail}` placeholder;
    // what belongs in a plain-text file is what a reader would have read.
    expect(body).not.toMatch(/<\/?(p|list|item|steps|step)>/);
    expect(body).not.toMatch(/\{\w+\}/);
    expect(body).toContain("help@sog.gg");
  });

  it("builds its page links from the pathnames map", () => {
    expect(body).toContain(`(${BASE}/en/about)`);
    expect(body).toContain(`(${BASE}/en/shop)`);
    expect(body).toContain(`(${BASE}/en/privacy)`);
    expect(body).toContain(`(${BASE}/en/team)`);
    expect(body).toContain(`(${BASE}/en/library)`);
  });

  it("lists each live article at the address an English reader is sent to, newest first", () => {
    const finnish = `- [Pelikerho koulupäivän jälkeen](${BASE}/fi/kirjasto/pelikerho-koulupaivan-jalkeen): Mitä kerhossa tapahtuu.`;
    const english = `- [Setting up a family gaming agreement](${BASE}/en/library/setting-up-a-family-gaming-agreement): Why it works.`;
    expect(body).toContain(finnish);
    expect(body).toContain(english);
    expect(body.indexOf(finnish)).toBeLessThan(body.indexOf(english));
  });

  it("leaves the articles out, and keeps the rest, when the Library cannot be read", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListPublishedArticles.mockRejectedValueOnce(new Error("down"));
    const without = await (await GET()).text();
    quiet.mockRestore();

    expect(without).not.toContain("## Library");
    expect(without).toContain(`(${BASE}/en/library)`);
  });

  it("lists each indexed locale's home URL and no Klingon one", () => {
    for (const locale of ["en", "fi", "sv", "fr"]) {
      expect(body).toContain(`${BASE}/${locale}\n`);
    }
    expect(body).not.toContain(`${BASE}/tlh`);
  });

  it("names no /schools URL in any locale", () => {
    // Municipality clubs are for families in specific Finnish municipalities
    // and are not promoted — the whole tree is noindex, and a discovery file
    // that named it would undo that. The slugs come from the map so a
    // translated one added later is covered without editing this test.
    for (const slug of Object.values(PATHNAMES["/schools"])) {
      expect(body).not.toContain(slug);
    }
  });

  it("names no /roblox URL and no product page", () => {
    // Both are noindex for their own reasons; a product detail URL would also
    // be the one shape that could name an unlisted product.
    expect(body).not.toContain("/roblox");
    expect(body).not.toMatch(/\/shop\/[^)\s]/);
  });
});
