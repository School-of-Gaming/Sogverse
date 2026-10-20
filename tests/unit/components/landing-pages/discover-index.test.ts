import { afterAll, describe, expect, it, vi } from "vitest";
import type { PublishedLandingPageSummary } from "@/services/landing-pages/landing-pages.contracts";

// The index's links, its structured data and the landing page's breadcrumb
// are all *about* which locale's address they name, so this file takes the
// real path builder — and the module it is built on.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

vi.mock("next-intl/server", () => ({
  getLocale: async () => "fi",
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
afterAll(() => vi.unstubAllEnvs());

const { discoverIndexEntries } = await import(
  "@/components/landing-pages/index-page/discover-index-props"
);
const { discoverIndexJsonLd } = await import(
  "@/components/landing-pages/index-page/discover-index-json-ld"
);
const { landingBreadcrumbJsonLd } = await import(
  "@/components/landing-pages/landing-page-breadcrumb"
);
const { generateMetadata } = await import("@/app/[locale]/(public)/discover/page");

const SITE = "https://sogverse.test";
const ESPOO = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const ESBO = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";
const HERO = "11111111-1111-4111-8111-111111111111";
const PICTURE = "88888888-8888-4888-8888-888888888888";

/** Live in English and Finnish, leading with a picture. */
const ESPOO_PAGE: PublishedLandingPageSummary = {
  id: ESPOO,
  firstPublishedAt: "2026-09-02T08:00:00Z",
  publishedAt: "2026-10-01T08:00:00Z",
  sections: [{ id: HERO, type: "hero", imageId: PICTURE }],
  imagePaths: { [PICTURE]: "pictures/espoo.jpg" },
  versions: [
    { locale: "en", title: "Clubs in Espoo", summary: "For Espoo families.", slug: "clubs-espoo" },
    { locale: "fi", title: "Kerhot Espoossa", summary: "Espoon perheille.", slug: "kerhot-espoo" },
  ],
};

/** Live in Swedish alone, with no picture. */
const ESBO_PAGE: PublishedLandingPageSummary = {
  id: ESBO,
  firstPublishedAt: "2026-09-01T08:00:00Z",
  publishedAt: "2026-09-01T08:00:00Z",
  sections: [{ id: HERO, type: "hero" }],
  imagePaths: {},
  versions: [
    { locale: "sv", title: "Klubbar i Esbo", summary: "För familjer i Esbo.", slug: "klubbar-esbo" },
  ],
};

describe("the index's entries", () => {
  it("lists every live page, in the order the live list arrives", () => {
    expect(discoverIndexEntries([ESPOO_PAGE, ESBO_PAGE], "fi").map((e) => e.card.id)).toEqual([
      ESPOO,
      ESBO,
    ]);
  });

  it("shows the reader's own version and links its slug address in the index's locale", () => {
    const [entry] = discoverIndexEntries([ESPOO_PAGE], "fi");

    expect(entry.card).toMatchObject({
      title: "Kerhot Espoossa",
      summary: "Espoon perheille.",
      textLocale: "fi",
      href: { pathname: "/discover/[idOrSlug]", params: { idOrSlug: "kerhot-espoo" } },
    });
    expect(entry.canonicalPath).toBe("/fi/tutustu/kerhot-espoo");
  });

  it("falls back to English, then to the first written, linking the id in the index's locale and naming the shown version's canonical", () => {
    const [espoo, esbo] = discoverIndexEntries([ESPOO_PAGE, ESBO_PAGE], "fr");

    expect(espoo.card).toMatchObject({ title: "Clubs in Espoo", textLocale: "en" });
    expect(espoo.card.href).toEqual({
      pathname: "/discover/[idOrSlug]",
      params: { idOrSlug: ESPOO },
    });
    expect(espoo.canonicalPath).toBe("/en/discover/clubs-espoo");

    expect(esbo.card).toMatchObject({ title: "Klubbar i Esbo", textLocale: "sv" });
    expect(esbo.canonicalPath).toBe("/sv/upptack/klubbar-esbo");
  });

  it("shows the picture a page leads with, and none for a page whose hero has none", () => {
    const [espoo, esbo] = discoverIndexEntries([ESPOO_PAGE, ESBO_PAGE], "en");

    expect(espoo.card.pictureSrc).toContain("pictures/espoo.jpg");
    expect(esbo.card.pictureSrc).toBeNull();
  });

  it("is empty with nothing live", () => {
    expect(discoverIndexEntries([], "en")).toEqual([]);
  });
});

describe("the index's structured data", () => {
  const base = {
    siteUrl: SITE,
    path: "/fr/decouvrir",
    locale: "fr",
    name: "Découvrir",
    description: "Des pages.",
  };

  it("is a CollectionPage listing exactly the pages shown, each at its canonical", () => {
    const data = discoverIndexJsonLd({
      ...base,
      entries: discoverIndexEntries([ESPOO_PAGE, ESBO_PAGE], "fr"),
    });

    expect(data).toMatchObject({
      "@type": "CollectionPage",
      url: `${SITE}/fr/decouvrir`,
      name: "Découvrir",
      description: "Des pages.",
      inLanguage: "fr",
      publisher: { "@id": `${SITE}/#organization` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Clubs in Espoo",
            url: `${SITE}/en/discover/clubs-espoo`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Klubbar i Esbo",
            url: `${SITE}/sv/upptack/klubbar-esbo`,
          },
        ],
      },
    });
  });

  it("states no list at all with nothing live, rather than an empty one", () => {
    const data = discoverIndexJsonLd({ ...base, entries: [] });

    expect(data["@type"]).toBe("CollectionPage");
    expect(data).not.toHaveProperty("mainEntity");
  });
});

describe("the index's metadata", () => {
  it("is promoted: self-canonical with every indexed language and the index's own title", async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe("metadata.pages.discover");
    expect(metadata.description).toBe("metadata.descriptions.discover");
    expect(metadata.alternates?.canonical).toBe("/fi/tutustu");
    expect(metadata.alternates?.languages).toEqual({
      en: "/en/discover",
      fi: "/fi/tutustu",
      sv: "/sv/upptack",
      fr: "/fr/decouvrir",
      "x-default": "/discover",
    });
  });
});

describe("a landing page's breadcrumb", () => {
  const trail = { indexName: "Tutustu", title: "Kerhot Espoossa" };

  it("is the index and the page, absolute, in the page's locale, ending at the canonical", () => {
    expect(
      landingBreadcrumbJsonLd({
        siteUrl: SITE,
        locale: "fi",
        canonicalPath: "/fi/tutustu/kerhot-espoo",
        trail,
      }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Tutustu", item: `${SITE}/fi/tutustu` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Kerhot Espoossa",
          item: `${SITE}/fi/tutustu/kerhot-espoo`,
        },
      ],
    });
  });

  it("names the canonical the page uses when it shows another language's version", () => {
    const data = landingBreadcrumbJsonLd({
      siteUrl: SITE,
      locale: "fr",
      canonicalPath: "/en/discover/clubs-espoo",
      trail: { indexName: "Découvrir", title: "Clubs in Espoo" },
    });

    expect(data.itemListElement.map((step) => step.item)).toEqual([
      `${SITE}/fr/decouvrir`,
      `${SITE}/en/discover/clubs-espoo`,
    ]);
  });
});
