import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LocalizedLibraryArticle,
  PublishedLibraryArticle,
} from "@/services/library";

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

const {
  libraryArticleCanonicalPath,
  libraryArticleLocales,
  libraryArticleMetadata,
} = await import("@/components/library/article/article-metadata");
const { libraryArticleJsonLd } = await import(
  "@/components/library/article/article-json-ld"
);
const { generateMetadata: libraryIndexMetadata } = await import(
  "@/app/[locale]/(public)/library/page"
);

const ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";
const OTHER_ID = "5e0c7a3b-2f14-4e8d-9b6a-1d3c8f7e2a90";

const TITLE = "Setting up a family gaming agreement";
const SUMMARY = "Why a written agreement ends arguments.";

/** A published article in English and Finnish. */
const PUBLISHED: PublishedLibraryArticle = {
  id: ID,
  category: "screen_time",
  coverPath: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.jpg",
  firstPublishedAt: "2026-05-01T08:00:00Z",
  publishedAt: "2026-09-01T08:00:00Z",
  versions: [
    { locale: "en", title: TITLE, summary: SUMMARY, body: "A rule in one head." },
    {
      locale: "fi",
      title: "Pelisopimus perheelle",
      summary: "Miksi kirjoitettu sopimus lopettaa riidat.",
      body: "Sääntö yhden päässä.",
    },
  ],
};

/** The same article in every indexed locale. */
const EVERYWHERE: PublishedLibraryArticle = {
  ...PUBLISHED,
  versions: [
    ...PUBLISHED.versions,
    { locale: "sv", title: "Ett spelavtal för familjen", summary: "Varför.", body: "Regel." },
    { locale: "fr", title: "Un accord de jeu en famille", summary: "Pourquoi.", body: "Règle." },
  ],
};

/** An article written in Finnish alone. */
const FINNISH_ONLY: PublishedLibraryArticle = {
  ...PUBLISHED,
  id: OTHER_ID,
  firstPublishedAt: "2026-06-01T08:00:00Z",
  versions: [
    {
      locale: "fi",
      title: "Pelikerho koulupäivän jälkeen",
      summary: "Mitä kerhossa tapahtuu.",
      body: "Kerho alkaa.",
    },
  ],
};

/** The article as the page shows it at English. */
const ARTICLE: LocalizedLibraryArticle = {
  id: ID,
  locale: "en",
  title: TITLE,
  summary: SUMMARY,
  body: "A rule in one head.",
  category: "screen_time",
  coverPath: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.jpg",
  firstPublishedAt: "2026-05-01T08:00:00Z",
  publishedAt: "2026-09-01T08:00:00Z",
};

const EN_PATH = "/en/library/setting-up-a-family-gaming-agreement";
const FI_PATH = "/fi/kirjasto/pelisopimus-perheelle";

const KEY = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.jpg";

const COVER_URL =
  "https://test.supabase.co/storage/v1/object/public/library-covers/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08.jpg";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
});

describe("a Library article's metadata", () => {
  it("is titled by the version shown and described by its summary", async () => {
    const metadata = await libraryArticleMetadata(PUBLISHED, [PUBLISHED], "fi");
    expect(metadata.title).toBe("Pelisopimus perheelle");
    expect(metadata.description).toBe("Miksi kirjoitettu sopimus lopettaa riidat.");
  });

  it("is indexable: it names no robots of its own", async () => {
    const metadata = await libraryArticleMetadata(PUBLISHED, [PUBLISHED], "fi");
    expect(metadata.robots).toBeUndefined();
  });

  it("is its own canonical at each locale written, with every version as an alternate", async () => {
    const languages = {
      en: EN_PATH,
      fi: FI_PATH,
      sv: "/sv/bibliotek/ett-spelavtal-for-familjen",
      fr: "/fr/bibliotheque/un-accord-de-jeu-en-famille",
      "x-default": EN_PATH,
    };
    for (const locale of ["en", "fi", "sv", "fr"] as const) {
      const { alternates } = await libraryArticleMetadata(
        EVERYWHERE,
        [EVERYWHERE],
        locale,
      );
      expect(alternates).toEqual({ canonical: languages[locale], languages });
    }
  });

  it("canonicalises a locale it was not written in, reached by id, to the English slug address", async () => {
    const { alternates, openGraph } = await libraryArticleMetadata(
      PUBLISHED,
      [PUBLISHED],
      "sv",
    );
    expect(alternates).toEqual({
      canonical: EN_PATH,
      languages: { en: EN_PATH, fi: FI_PATH, "x-default": EN_PATH },
    });
    expect(openGraph).toMatchObject({ locale: "en", url: EN_PATH });
  });

  it("canonicalises a Finnish-only article read in English to its Finnish slug address", async () => {
    const path = "/fi/kirjasto/pelikerho-koulupaivan-jalkeen";
    const { alternates, openGraph, title } = await libraryArticleMetadata(
      FINNISH_ONLY,
      [FINNISH_ONLY, PUBLISHED],
      "en",
    );
    expect(title).toBe("Pelikerho koulupäivän jälkeen");
    expect(alternates).toEqual({
      canonical: path,
      languages: { fi: path, "x-default": path },
    });
    expect(openGraph).toMatchObject({ locale: "fi", url: path });
  });

  it("names the newer of two articles deriving one slug by its id", async () => {
    const newer = { ...PUBLISHED, id: OTHER_ID, firstPublishedAt: "2026-07-01T08:00:00Z" };
    const live = [newer, PUBLISHED];
    expect(libraryArticleCanonicalPath(live, PUBLISHED, "en")).toBe(EN_PATH);
    expect(libraryArticleCanonicalPath(live, newer, "en")).toBe(
      `/en/library/${OTHER_ID}`,
    );
    const { alternates } = await libraryArticleMetadata(newer, live, "en");
    expect(alternates?.languages).toEqual({
      en: `/en/library/${OTHER_ID}`,
      fi: `/fi/kirjasto/${OTHER_ID}`,
      "x-default": `/en/library/${OTHER_ID}`,
    });
  });

  it("makes a page showing Klingon text its own canonical, with no versions", async () => {
    const klingon: PublishedLibraryArticle = {
      ...PUBLISHED,
      versions: [{ locale: "tlh", title: "Qapla", summary: "Qapla.", body: "Qapla." }],
    };
    expect(libraryArticleLocales(klingon)).toEqual([]);
    const { alternates } = await libraryArticleMetadata(klingon, [klingon], "en");
    expect(alternates).toEqual({ canonical: `/en/library/${ID}` });
  });

  it("unfurls into the cover, at the canonical", async () => {
    const { openGraph, twitter } = await libraryArticleMetadata(
      PUBLISHED,
      [PUBLISHED],
      "en",
    );
    // The cover's preview rendition through the picture route, at the
    // library_cover size narrowed to preview width — never the stored object.
    const images = [
      {
        url: `/opengraph-images/picture/library_cover/${KEY}`,
        alt: TITLE,
        width: 1200,
        height: 675,
      },
    ];
    expect(openGraph).toMatchObject({
      type: "article",
      siteName: "School of Gaming",
      title: TITLE,
      description: SUMMARY,
      url: EN_PATH,
      publishedTime: PUBLISHED.firstPublishedAt,
      modifiedTime: PUBLISHED.publishedAt,
      images,
    });
    expect(twitter).toMatchObject({ card: "summary_large_image", images });
  });

  it("falls back to the site-wide card, at the reader's locale, without a cover", async () => {
    const coverless = { ...PUBLISHED, coverPath: null };
    const { openGraph, twitter } = await libraryArticleMetadata(
      coverless,
      [coverless],
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

  it("is an Article published by School of Gaming, at its canonical address", () => {
    expect(
      libraryArticleJsonLd({ siteUrl: SITE, canonicalPath: EN_PATH, article: ARTICLE }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: ARTICLE.title,
      description: ARTICLE.summary,
      image: COVER_URL,
      datePublished: ARTICLE.firstPublishedAt,
      dateModified: ARTICLE.publishedAt,
      inLanguage: "en",
      url: `${SITE}${EN_PATH}`,
      mainEntityOfPage: `${SITE}${EN_PATH}`,
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
      canonicalPath: EN_PATH,
      article: { ...ARTICLE, coverPath: null },
    });
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("author");
  });

  it("states the language of the version shown", () => {
    expect(
      libraryArticleJsonLd({
        siteUrl: SITE,
        canonicalPath: FI_PATH,
        article: { ...ARTICLE, locale: "fi" },
      }).inLanguage,
    ).toBe("fi");
  });
});

describe("the Library index's metadata", () => {
  it("takes its title and description from the catalog", async () => {
    const metadata = await libraryIndexMetadata();
    expect(metadata.title).toBe("fi:metadata.pages.library");
    expect(metadata.description).toBe("fi:metadata.descriptions.library");
  });

  it("is indexable, with the site's language alternates", async () => {
    const metadata = await libraryIndexMetadata();
    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toEqual({
      canonical: "/fi/kirjasto",
      languages: {
        en: "/en/library",
        fi: "/fi/kirjasto",
        sv: "/sv/bibliotek",
        fr: "/fr/bibliotheque",
        "x-default": "/library",
      },
    });
  });
});
