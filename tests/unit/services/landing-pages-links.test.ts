import { describe, expect, it, vi } from "vitest";
import type { LandingSection } from "@/lib/landing-pages/sections";
import type { SlugResolver } from "@/lib/links/own-site";
import {
  landingPageInput,
  landingWriteFailure,
} from "@/services/landing-pages/landing-pages.contracts";
import {
  canonicaliseLandingLinks,
  LandingLinkRefusal,
  siteSlugResolver,
  type LandingWrite,
} from "@/services/landing-pages/landing-pages.links";
import {
  CASE_IDS as I,
  everySection,
  everyText,
} from "../../helpers/landing-required-text-cases";

const SITE = "https://sogverse.sog.gg";
const ARTICLE = "3f1c2a9e-8b7d-4c6e-9a5f-1e2d3c4b5a69";
const PAGE = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

/** Knows one Finnish Library slug and one English landing page slug. */
const resolver: SlugResolver = async (template, locale, slug) => {
  if (template.startsWith("/library/") && locale === "fi" && slug === "opas") return ARTICLE;
  if (template.startsWith("/discover/") && locale === "en" && slug === "espoo") return PAGE;
  return null;
};

function write(
  sections: LandingSection[],
  texts: Record<string, unknown> = everyText(),
): LandingWrite {
  return landingPageInput.parse({
    sections,
    versions: [{ locale: "en", title: "Clubs", summary: "", sectionTexts: texts }],
  });
}

function withButtons(hero: string, cta: string) {
  return everySection().map((section): LandingSection => {
    if (section.type === "hero") return { ...section, button: { kind: "internal", path: hero } };
    if (section.type === "cta") return { ...section, button: { kind: "external", url: cta } };
    return section;
  });
}

function textsWith(body: string, answer: string): Record<string, unknown> {
  const texts = everyText();
  texts[I.text] = { ...texts[I.text], body };
  texts[I.faq] = {
    heading: "Questions",
    items: { [I.faqA]: { question: "Where?", answer } },
  };
  return texts;
}

describe("canonicaliseLandingLinks", () => {
  it("stores every button target canonical, pasted addresses and own-site absolutes alike", async () => {
    const result = await canonicaliseLandingLinks(
      write(withButtons("/fi/kauppa/123", `${SITE}/sv/butik/123?x=1`)),
      { resolver, siteUrl: SITE },
    );
    const buttons = result.sections?.flatMap((section) =>
      section.type === "hero" || section.type === "cta" ? [section.button] : [],
    );
    expect(buttons).toEqual([
      { kind: "internal", path: "/shop/123" },
      { kind: "internal", path: "/shop/123?x=1" },
    ]);
  });

  it("stores a slug address at its id, and leaves another site's address as written", async () => {
    const result = await canonicaliseLandingLinks(
      write(withButtons("/fi/kirjasto/opas", "https://example.com/x")),
      { resolver, siteUrl: SITE },
    );
    const [hero] = result.sections ?? [];
    const cta = result.sections?.at(-1);
    expect(hero).toMatchObject({ button: { kind: "internal", path: `/library/${ARTICLE}` } });
    expect(cta).toMatchObject({ button: { kind: "external", url: "https://example.com/x" } });
  });

  it("canonicalises the links in every markdown field — a text body and a question's answer", async () => {
    const result = await canonicaliseLandingLinks(
      write(everySection(), textsWith(
        "See [the shop](/fi/kauppa) and [Espoo](/en/discover/espoo).",
        "Read [the guide](https://sogverse.sog.gg/fi/kirjasto/opas#start).",
      )),
      { resolver, siteUrl: SITE },
    );
    const texts = result.versions[0].sectionTexts;
    expect(texts[I.text]).toMatchObject({
      body: `See [the shop](/shop) and [Espoo](/discover/${PAGE}).`,
    });
    expect(texts[I.faq]).toMatchObject({
      items: { [I.faqA]: { answer: `Read [the guide](/library/${ARTICLE}#start).` } },
    });
    // Plain-text fields are never read for links.
    expect(texts[I.hero]).toEqual(everyText()[I.hero]);
  });

  it("refuses a dead markdown link, naming its words, its address, its language and its section", async () => {
    const attempt = canonicaliseLandingLinks(
      write(everySection(), textsWith("Go [nowhere](/fi/ei-ole).", "Fine.")),
      { resolver, siteUrl: SITE },
    );
    await expect(attempt).rejects.toBeInstanceOf(LandingLinkRefusal);
    await expect(attempt).rejects.toThrow(
      'The link "nowhere" to /fi/ei-ole, in the English words of section 2 (Text), doesn\'t lead to a page on the site.',
    );
  });

  it("refuses a slug no live page has, and a button leading nowhere, in one sentence each", async () => {
    const attempt = canonicaliseLandingLinks(
      write(withButtons("/no-such-page", "https://example.com"), textsWith(
        "Fine.",
        "Read [the guide](/fi/kirjasto/ei-julkaistu).",
      )),
      { resolver, siteUrl: SITE },
    );
    await expect(attempt).rejects.toThrow(
      "The button in section 1 (Hero) leads to /no-such-page, which doesn't lead to a page on the site. " +
        'The link "the guide" to /fi/kirjasto/ei-julkaistu, in the English words of section 6 (Questions and answers), doesn\'t lead to a page on the site.',
    );
  });

  it("is quoted to the admin as the landing service's own refusals are", async () => {
    const refusal = await canonicaliseLandingLinks(
      write(withButtons("/no-such-page", "https://example.com")),
      { resolver, siteUrl: SITE },
    ).catch((error: unknown) => error);
    expect(landingWriteFailure(refusal)).toEqual({
      kind: "reason",
      reason: "The button in section 1 (Hero) leads to /no-such-page, which doesn't lead to a page on the site.",
    });
  });

  it("reads a one-language write's words against the structure it is given", async () => {
    const { versions } = write(everySection(), textsWith("[Shop](/sv/butik)", "Fine."));
    const result = await canonicaliseLandingLinks(
      { sections: null, versions },
      { resolver, siteUrl: SITE, structure: everySection() },
    );
    expect(result.sections).toBeNull();
    expect(result.versions[0].sectionTexts[I.text]).toMatchObject({ body: "[Shop](/shop)" });
  });
});

describe("siteSlugResolver", () => {
  const sources = () => ({
    libraryArticles: vi.fn(async () => [
      {
        id: ARTICLE,
        firstPublishedAt: "2026-01-01T00:00:00Z",
        versions: [{ locale: "fi" as const, title: "Opas" }],
      },
    ]),
    teamProfiles: vi.fn(async () => []),
    landingPageId: vi.fn(async (_locale: string, slug: string) => (slug === "espoo" ? PAGE : null)),
  });

  it("resolves each slugged area through its own reader, and reads each list once", async () => {
    const fake = sources();
    const resolve = siteSlugResolver(fake);
    await expect(resolve("/library/[idOrSlug]", "fi", "opas")).resolves.toBe(ARTICLE);
    await expect(resolve("/library/[idOrSlug]/preview", "fi", "opas")).resolves.toBe(ARTICLE);
    await expect(resolve("/library/[idOrSlug]", "en", "opas")).resolves.toBeNull();
    await expect(resolve("/team/[idOrSlug]", "en", "mikko")).resolves.toBeNull();
    expect(fake.libraryArticles).toHaveBeenCalledTimes(1);
    expect(fake.teamProfiles).toHaveBeenCalledTimes(1);
  });
});
