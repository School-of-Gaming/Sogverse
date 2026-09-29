import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedLibraryArticle } from "@/services/library";

// The shared setup mocks the wrapped navigation, and its `getPathname` ignores
// the locale. The canonical is *about* which locale's address it names, so
// this file takes the real one — and the module it is built on, which the
// setup's partial mock would starve.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// The card's alt text and the page titles read the catalog; a stub keeps the
// assertions on the shape and says which key and locale were asked for.
vi.mock("next-intl/server", () => ({
  getLocale: async () => "fi",
  getTranslations: async (
    arg: string | { locale: string; namespace: string },
  ) => {
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    const locale = typeof arg === "string" ? "fi" : arg.locale;
    return (key: string) => `${locale}:${namespace}.${key}`;
  },
}));

const { libraryArticleMetadata } = await import(
  "@/components/library/article/article-metadata"
);
const { libraryArticleJsonLd } = await import(
  "@/components/library/article/article-json-ld"
);
const { generateMetadata: libraryIndexMetadata } = await import(
  "@/app/[locale]/(public)/library/page"
);

const ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";

const ARTICLE: PublishedLibraryArticle = {
  id: ID,
  title: "Setting up a family gaming agreement",
  summary: "Why a written agreement ends arguments.",
  body: "A rule in one head is a rule to argue with.",
  category: "screen_time",
  coverPath: "covers/agreement.jpg",
  firstPublishedAt: "2026-05-01T08:00:00Z",
  publishedAt: "2026-09-01T08:00:00Z",
};

const COVER_URL =
  "https://test.supabase.co/storage/v1/object/public/library-covers/covers/agreement.jpg";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
});

describe("a Library article's metadata", () => {
  it("is titled by the article and described by its summary", async () => {
    const metadata = await libraryArticleMetadata(ARTICLE, "fi");
    expect(metadata.title).toBe(ARTICLE.title);
    expect(metadata.description).toBe(ARTICLE.summary);
  });

  it("is noindex, nofollow until the Library launches", async () => {
    const metadata = await libraryArticleMetadata(ARTICLE, "fi");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each(["en", "fi", "sv", "fr"])(
    "canonicalises to the English address when read at %s, and claims no translations",
    async (locale) => {
      const { alternates } = await libraryArticleMetadata(ARTICLE, locale);
      expect(alternates).toEqual({ canonical: `/en/library/${ID}` });
    },
  );

  it("unfurls into the cover", async () => {
    const { openGraph, twitter } = await libraryArticleMetadata(ARTICLE, "fi");
    const images = [{ url: COVER_URL, alt: ARTICLE.title }];
    expect(openGraph).toMatchObject({
      type: "article",
      siteName: "School of Gaming",
      title: ARTICLE.title,
      description: ARTICLE.summary,
      url: `/en/library/${ID}`,
      publishedTime: ARTICLE.firstPublishedAt,
      modifiedTime: ARTICLE.publishedAt,
      images,
    });
    expect(twitter).toMatchObject({ card: "summary_large_image", images });
  });

  it("falls back to the site-wide card, at the reader's locale, without a cover", async () => {
    const { openGraph, twitter } = await libraryArticleMetadata(
      { ...ARTICLE, coverPath: null },
      "sv",
    );
    const images = [
      {
        url: "/opengraph-images/site?locale=sv",
        alt: "sv:metadata.og.site.alt",
        width: 1200,
        height: 630,
      },
    ];
    expect(openGraph?.images).toEqual(images);
    expect(twitter?.images).toEqual(images);
  });
});

describe("a Library article's structured data", () => {
  const SITE = "https://sogverse.example";

  it("is an Article published by School of Gaming, at its English address", () => {
    expect(
      libraryArticleJsonLd({
        siteUrl: SITE,
        canonicalPath: `/en/library/${ID}`,
        article: ARTICLE,
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: ARTICLE.title,
      description: ARTICLE.summary,
      image: COVER_URL,
      datePublished: ARTICLE.firstPublishedAt,
      dateModified: ARTICLE.publishedAt,
      inLanguage: "en",
      url: `${SITE}/en/library/${ID}`,
      mainEntityOfPage: `${SITE}/en/library/${ID}`,
      publisher: {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "School of Gaming",
      },
    });
  });

  it("names no image for an article without a cover, and never an author", () => {
    const data = libraryArticleJsonLd({
      siteUrl: SITE,
      canonicalPath: `/en/library/${ID}`,
      article: { ...ARTICLE, coverPath: null },
    });
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("author");
  });
});

describe("the Library index's metadata", () => {
  it("takes its title and description from the catalog", async () => {
    const metadata = await libraryIndexMetadata();
    expect(metadata.title).toBe("fi:metadata.pages.library");
    expect(metadata.description).toBe("fi:metadata.descriptions.library");
  });

  it("is noindex, nofollow with no alternates until the Library launches", async () => {
    const metadata = await libraryIndexMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });
});
