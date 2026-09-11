import { describe, expect, it, vi } from "vitest";

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
const BASE = "https://test.sogverse.local";

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

  it("is publicly cacheable", async () => {
    // The posture that keeps it out of the proxy's matcher; if this stops
    // being true, that exclusion needs revisiting rather than the header.
    expect((await GET()).headers.get("cache-control")).toContain("s-maxage=");
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
