import { afterAll, describe, expect, it, vi } from "vitest";
import type {
  LocalizedLandingPage,
  PublishedLandingPage,
} from "@/services/landing-pages";

// The shared setup mocks the wrapped navigation, and its `getPathname` ignores
// the locale. Addresses and canonicals are *about* which locale's path they
// name, so this file takes the real one — and the module it is built on.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

// The site card's alt text reads the catalog; a stub says which locale asked.
vi.mock("next-intl/server", () => ({
  getTranslations: async (arg: { locale: string; namespace: string }) => (key: string) =>
    `${arg.locale}:${arg.namespace}.${key}`,
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
afterAll(() => vi.unstubAllEnvs());

const {
  landingPageAddress,
  landingPageCanonicalPath,
  landingPageHref,
  landingPageLocalePaths,
  landingPageLocales,
  landingPagePath,
  resolveLandingPage,
} = await import("@/components/landing-pages/landing-page-address");
const { landingPageMetadata, landingPageSeo, landingSeoMetadata, renderedLandingSeo } =
  await import("@/components/landing-pages/landing-page-metadata");
const { landingPublishedCopy } = await import(
  "@/services/landing-pages/landing-pages.forecast"
);
const { landingPageJsonLd } = await import(
  "@/components/landing-pages/landing-page-json-ld"
);
const { landingStructuredParts } = await import(
  "@/components/landing-pages/landing-section-seo"
);
const { markdownToPlainText } = await import(
  "@/components/landing-pages/markdown-plain-text"
);

const ID = "482f0c6f-0fbc-4202-8790-a73a4520fb47";
const HERO = "11111111-1111-4111-8111-111111111111";
const FAQ = "22222222-2222-4222-8222-222222222222";
const Q1 = "33333333-3333-4333-8333-333333333333";
const Q2 = "44444444-4444-4444-8444-444444444444";
const STEPS = "55555555-5555-4555-8555-555555555555";
const S1 = "66666666-6666-4666-8666-666666666666";
const S2 = "77777777-7777-4777-8777-777777777777";
const PICTURE = "88888888-8888-4888-8888-888888888888";

/** Live in English and Finnish, with a hero picture, steps and two questions. */
const PAGE: PublishedLandingPage = {
  id: ID,
  firstPublishedAt: "2026-09-01T08:00:00Z",
  publishedAt: "2026-10-01T08:00:00Z",
  sections: [
    { id: HERO, type: "hero", imageId: PICTURE },
    { id: STEPS, type: "steps", items: [{ id: S1 }, { id: S2 }] },
    { id: FAQ, type: "faq", items: [{ id: Q1 }, { id: Q2 }] },
  ],
  imagePaths: { [PICTURE]: "pictures/club.jpg" },
  versions: [
    {
      locale: "en",
      title: "Gaming clubs in Espoo",
      summary: "After-school clubs for Espoo families.",
      slug: "gaming-clubs-espoo",
      sectionTexts: {
        [HERO]: { headline: "Clubs in Espoo", imageAlt: "Children at a club" },
        [STEPS]: {
          heading: "How to join",
          items: { [S1]: { title: "Pick a club", body: "Browse." }, [S2]: { title: "Sign up", body: "Pay." } },
        },
        [FAQ]: {
          heading: "Questions",
          items: {
            [Q1]: { question: "Who leads it?", answer: "A **Game Educator**, see [the team](/team)." },
            [Q2]: { question: "Unanswered" },
          },
        },
      },
    },
    {
      locale: "fi",
      title: "Pelikerhot Espoossa",
      summary: "Iltapäiväkerhot.",
      slug: "pelikerhot-espoo",
      sectionTexts: { [HERO]: { headline: "Kerhot Espoossa", imageAlt: "Lapsia" } },
    },
  ],
};

const FINNISH_ONLY = { ...PAGE, versions: [PAGE.versions[1]] };

describe("landing page addresses", () => {
  it("is the version's slug where the page is live, its id elsewhere", () => {
    expect(landingPageAddress(PAGE, "en")).toBe("gaming-clubs-espoo");
    expect(landingPageAddress(PAGE, "fi")).toBe("pelikerhot-espoo");
    expect(landingPageAddress(PAGE, "sv")).toBe(ID);
    expect(landingPageHref(PAGE, "sv")).toEqual({
      pathname: "/discover/[idOrSlug]",
      params: { idOrSlug: ID },
    });
  });

  it("builds each locale's translated path", () => {
    expect(landingPagePath(PAGE, "fi")).toBe("/fi/tutustu/pelikerhot-espoo");
    expect(landingPageLocalePaths(PAGE)).toEqual({
      en: "/en/discover/gaming-clubs-espoo",
      fi: "/fi/tutustu/pelikerhot-espoo",
      sv: `/sv/upptack/${ID}`,
      fr: `/fr/decouvrir/${ID}`,
      tlh: `/tlh/discover/${ID}`,
    });
  });

  it("canonicalises to the slug address of the version shown", () => {
    expect(landingPageCanonicalPath(PAGE, "fi")).toBe("/fi/tutustu/pelikerhot-espoo");
    // Swedish falls back to English, so it canonicalises there.
    expect(landingPageCanonicalPath(PAGE, "sv")).toBe("/en/discover/gaming-clubs-espoo");
    // Written in Finnish alone: every locale shows it, and points at it.
    expect(landingPageCanonicalPath(FINNISH_ONLY, "en")).toBe("/fi/tutustu/pelikerhot-espoo");
  });

  it("names the indexed locales it is live in as its language versions", () => {
    expect(landingPageLocales(PAGE)).toEqual(["en", "fi"]);
  });

  it("resolves an id in any locale and a slug only in its own", async () => {
    const byId = vi.fn(async (id: string) => (id === ID ? "page" : null));
    const bySlug = vi.fn(async (locale: string, slug: string) =>
      locale === "fi" && slug === "pelikerhot-espoo" ? "page" : null,
    );

    expect(await resolveLandingPage(ID, "sv", { byId, bySlug })).toBe("page");
    expect(await resolveLandingPage("pelikerhot-espoo", "fi", { byId, bySlug })).toBe("page");
    expect(await resolveLandingPage("pelikerhot-espoo", "en", { byId, bySlug })).toBeNull();
    expect(bySlug).toHaveBeenLastCalledWith("en", "pelikerhot-espoo");
  });
});

describe("landingPageMetadata", () => {
  it("takes its title, description and hero picture's alt text from the version", async () => {
    const metadata = await landingPageMetadata(PAGE, "fi");

    expect(metadata.title).toBe("Pelikerhot Espoossa");
    expect(metadata.description).toBe("Iltapäiväkerhot.");
    expect(metadata.alternates).toEqual({
      canonical: "/fi/tutustu/pelikerhot-espoo",
      languages: {
        en: "/en/discover/gaming-clubs-espoo",
        fi: "/fi/tutustu/pelikerhot-espoo",
        "x-default": "/en/discover/gaming-clubs-espoo",
      },
    });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      locale: "fi",
      url: "/fi/tutustu/pelikerhot-espoo",
      images: [
        {
          url: "/opengraph-images/picture/landing_image/pictures/club.jpg",
          alt: "Lapsia",
          width: 1200,
          height: 675,
        },
      ],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [expect.objectContaining({ alt: "Lapsia" })],
    });
  });

  it("canonicalises a fallback locale to the version shown, alt text included", async () => {
    const metadata = await landingPageMetadata(PAGE, "fr");

    expect(metadata.title).toBe("Gaming clubs in Espoo");
    expect(metadata.alternates?.canonical).toBe("/en/discover/gaming-clubs-espoo");
    expect(metadata.openGraph).toMatchObject({
      locale: "en",
      images: [expect.objectContaining({ alt: "Children at a club" })],
    });
  });

  it("takes the site card at the request locale when the hero has no picture", async () => {
    const metadata = await landingPageMetadata(
      { ...PAGE, sections: [{ id: HERO, type: "hero" }], imagePaths: {} },
      "fr",
    );

    expect(metadata.openGraph).toMatchObject({
      images: [expect.objectContaining({ alt: "fr:metadata.og.site.alt" })],
    });
  });

  it("takes the site card when the hero's picture has no path", async () => {
    const metadata = await landingPageMetadata({ ...PAGE, imagePaths: {} }, "en");

    expect(metadata.openGraph).toMatchObject({
      images: [expect.objectContaining({ alt: "en:metadata.og.site.alt" })],
    });
  });

  it("names no language versions for a page live only in Klingon", async () => {
    const klingon: PublishedLandingPage = {
      ...PAGE,
      versions: [{ ...PAGE.versions[1], locale: "tlh", slug: "qapla" }],
    };
    const metadata = await landingPageMetadata(klingon, "tlh");

    expect(metadata.alternates).toEqual({ canonical: "/tlh/discover/qapla" });
  });
});

const SITE = "https://site.test";

describe("renderedLandingSeo", () => {
  it("reads the metadata out as served: the template's suffix, absolute addresses, hreflang with x-default", async () => {
    const seo = await landingPageSeo(PAGE, "fi");
    if (seo === null) throw new Error("no version");

    expect(renderedLandingSeo(seo, SITE)).toEqual({
      title: "Pelikerhot Espoossa | School of Gaming",
      titleLength: 38,
      description: "Iltapäiväkerhot.",
      canonical: `${SITE}/fi/tutustu/pelikerhot-espoo`,
      hreflang: {
        en: `${SITE}/en/discover/gaming-clubs-espoo`,
        fi: `${SITE}/fi/tutustu/pelikerhot-espoo`,
        "x-default": `${SITE}/en/discover/gaming-clubs-espoo`,
      },
      shareCard: {
        title: "Pelikerhot Espoossa",
        description: "Iltapäiväkerhot.",
        imageUrl: `${SITE}/opengraph-images/picture/landing_image/pictures/club.jpg`,
        imageAlt: "Lapsia",
        image: "hero",
      },
    });
  });

  it("names the site card when the hero has no picture", async () => {
    const seo = await landingPageSeo(
      { ...PAGE, sections: [{ id: HERO, type: "hero" }], imagePaths: {} },
      "en",
    );
    if (seo === null) throw new Error("no version");

    expect(renderedLandingSeo(seo, SITE).shareCard).toMatchObject({
      imageUrl: `${SITE}/opengraph-images/site?locale=en`,
      imageAlt: "en:metadata.og.site.alt",
      image: "site-card",
    });
  });

  it("counts a long title with its suffix", async () => {
    const long = "Pelikerhot ja pelikasvatusta Espoon kouluille ja perheille koko lukuvuoden ajan";
    const seo = await landingPageSeo(
      { ...PAGE, versions: [{ ...PAGE.versions[0], title: long }] },
      "en",
    );
    if (seo === null) throw new Error("no version");

    const rendered = renderedLandingSeo(seo, SITE);
    expect(rendered.title).toBe(`${long} | School of Gaming`);
    expect(rendered.titleLength).toBe(long.length + " | School of Gaming".length);
    expect(rendered.shareCard.title).toBe(long);
  });

  it("is the page's own metadata: the page and the MCP tools read one function", async () => {
    for (const locale of ["en", "fi", "sv", "tlh"]) {
      const seo = await landingPageSeo(PAGE, locale);
      if (seo === null) throw new Error("no version");
      const metadata = await landingPageMetadata(PAGE, locale);
      expect(metadata).toEqual(landingSeoMetadata(seo));

      const rendered = renderedLandingSeo(seo, SITE);
      // Next applies the layout's template to the title and resolves every
      // relative address on `metadataBase`, the site's origin.
      expect(rendered.title).toBe(`${String(metadata.title)} | School of Gaming`);
      expect(rendered.canonical).toBe(new URL(String(metadata.alternates?.canonical), SITE).href);
      expect(rendered.shareCard.imageUrl).toBe(
        new URL(seo.image.url, SITE).href,
      );
      expect(metadata.openGraph).toMatchObject({ title: rendered.shareCard.title, images: [seo.image] });
    }
  });
});

describe("landingPublishedCopy", () => {
  const draftVersion = (
    version: PublishedLandingPage["versions"][number],
    missing: string[] = [],
  ) => ({ ...version, missing });

  it("is the working copy with its complete versions alone, as a publish would leave it", () => {
    const copy = landingPublishedCopy({
      draft: {
        id: ID,
        sections: PAGE.sections,
        imagePaths: PAGE.imagePaths,
        versions: [draftVersion(PAGE.versions[0]), draftVersion(PAGE.versions[1], ["title"])],
        createdAt: "2026-08-01T08:00:00Z",
        updatedAt: "2026-10-05T08:00:00Z",
        lastSavedBy: null,
        lastSavedVia: null,
      },
      publication: PAGE,
    });

    expect(copy).toEqual({
      ...PAGE,
      publishedAt: "2026-10-05T08:00:00Z",
      versions: [PAGE.versions[0]],
    });
  });

  it("is null when no version is complete", () => {
    expect(
      landingPublishedCopy({
        draft: {
          id: ID,
          sections: PAGE.sections,
          imagePaths: {},
          versions: [draftVersion(PAGE.versions[0], ["summary"])],
          createdAt: "2026-08-01T08:00:00Z",
          updatedAt: "2026-10-05T08:00:00Z",
          lastSavedBy: null,
          lastSavedVia: null,
        },
        publication: null,
      }),
    ).toBeNull();
  });
});

/** The page as an English reader is shown it. */
const SHOWN: LocalizedLandingPage = {
  ...PAGE,
  ...PAGE.versions[0],
};

describe("landingPageJsonLd", () => {
  const jsonLd = landingPageJsonLd({
    siteUrl: "https://sog.test",
    canonicalPath: "/en/discover/gaming-clubs-espoo",
    page: SHOWN,
  });

  it("is a FAQPage when a section asks questions, with only the answered ones", () => {
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url: "https://sog.test/en/discover/gaming-clubs-espoo",
      name: "Gaming clubs in Espoo",
      description: "After-school clubs for Espoo families.",
      inLanguage: "en",
      datePublished: "2026-09-01T08:00:00Z",
      dateModified: "2026-10-01T08:00:00Z",
      mainEntity: [
        {
          "@type": "Question",
          name: "Who leads it?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "A Game Educator, see the team.",
          },
        },
      ],
    });
  });

  it("names the layout's Organization as publisher and the hero's picture", () => {
    expect(jsonLd.publisher).toEqual({
      "@type": "Organization",
      "@id": "https://sog.test/#organization",
      name: "School of Gaming",
    });
    expect(jsonLd.primaryImageOfPage).toEqual({
      "@type": "ImageObject",
      url: "https://db.test/storage/v1/object/public/landing-images/pictures/club.jpg",
    });
  });

  it("is a plain WebPage without questions or a picture", () => {
    const plain = landingPageJsonLd({
      siteUrl: "https://sog.test",
      canonicalPath: "/en/discover/x",
      page: { ...SHOWN, sections: [{ id: HERO, type: "hero" }] },
    });
    expect(plain["@type"]).toBe("WebPage");
    expect(plain).not.toHaveProperty("mainEntity");
    expect(plain).not.toHaveProperty("primaryImageOfPage");
  });
});

describe("the SEO contribution map", () => {
  it("collects each section's structured data in page order", () => {
    expect(landingStructuredParts(SHOWN.sections, SHOWN.sectionTexts)).toEqual([
      { kind: "image", imageId: PICTURE, alt: "Children at a club" },
      { kind: "question", question: "Who leads it?", answer: "A Game Educator, see the team." },
    ]);
  });


  it("flattens markdown to its words, a block to a paragraph", () => {
    expect(markdownToPlainText("## Heading\n\nSome *text*  \nwith `code`.\n\n- one\n- two")).toBe(
      "Heading\n\nSome text with code.\n\none\n\ntwo",
    );
  });
});
