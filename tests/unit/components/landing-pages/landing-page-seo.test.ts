import { afterAll, describe, expect, it, vi } from "vitest";
import type {
  LocalizedLandingPage,
  PublishedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";

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
const { landingPageMetadata } = await import(
  "@/components/landing-pages/landing-page-metadata"
);
const { landingPageJsonLd, landingProductListsJsonLd } = await import(
  "@/components/landing-pages/landing-page-json-ld"
);
const { browseRow } = await import("../../../mocks/product-browse-row");
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
const SHARE_PICTURE = "99999999-9999-4999-8999-999999999999";
const FI_SHARE_PICTURE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Live in English and Finnish, with a hero picture, steps and two questions. */
const PAGE: PublishedLandingPage = {
  id: ID,
  firstPublishedAt: "2026-09-01T08:00:00Z",
  publishedAt: "2026-10-01T08:00:00Z",
  sections: [
    { id: HERO, type: "hero", imageId: PICTURE },
    { id: STEPS, type: "steps", background: "default", items: [{ id: S1 }, { id: S2 }] },
    { id: FAQ, type: "faq", background: "default", items: [{ id: Q1 }, { id: Q2 }] },
  ],
  pictures: { [PICTURE]: { path: "pictures/club.jpg", purpose: "landing_image" } },
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
      shareTitle: "",
      shareImageId: null,
      shareImageAlt: "",
    },
    {
      locale: "fi",
      title: "Pelikerhot Espoossa",
      summary: "Iltapäiväkerhot.",
      slug: "pelikerhot-espoo",
      sectionTexts: { [HERO]: { headline: "Kerhot Espoossa", imageAlt: "Lapsia" } },
      shareTitle: "",
      shareImageId: null,
      shareImageAlt: "",
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
    // With no override, the card's title is the page title.
    expect(metadata.openGraph?.title).toBe("Pelikerhot Espoossa");
    expect(metadata.twitter?.title).toBe("Pelikerhot Espoossa");
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
      { ...PAGE, sections: [{ id: HERO, type: "hero" }], pictures: {} },
      "fr",
    );

    expect(metadata.openGraph).toMatchObject({
      images: [expect.objectContaining({ alt: "fr:metadata.og.site.alt" })],
    });
  });

  it("takes the site card when the hero's picture has no path", async () => {
    const metadata = await landingPageMetadata({ ...PAGE, pictures: {} }, "en");

    expect(metadata.openGraph).toMatchObject({
      images: [expect.objectContaining({ alt: "en:metadata.og.site.alt" })],
    });
  });

  describe("with the share card overridden", () => {
    const HERO_IMAGE = "/opengraph-images/picture/landing_image/pictures/club.jpg";
    const SHARE_IMAGE = "/opengraph-images/picture/landing_image/pictures/share.jpg";

    const FI_SHARE_IMAGE = "/opengraph-images/picture/landing_image/pictures/share-fi.jpg";

    type ShareCard = { shareTitle?: string; shareImageId?: string | null; shareImageAlt?: string };

    /** PAGE with each language's overrides; the copy carries every named picture's path. */
    function overridden(cards: Partial<Record<"en" | "fi", ShareCard>>): PublishedLandingPage {
      return {
        ...PAGE,
        pictures: {
          ...PAGE.pictures,
          [SHARE_PICTURE]: { path: "pictures/share.jpg", purpose: "landing_image" },
          [FI_SHARE_PICTURE]: { path: "pictures/share-fi.jpg", purpose: "landing_image" },
        },
        versions: PAGE.versions.map((version) => ({
          ...version,
          ...cards[version.locale === "en" ? "en" : "fi"],
        })),
      };
    }

    it("takes the share title alone, keeping the page title and the hero's picture", async () => {
      const metadata = await landingPageMetadata(
        overridden({ en: { shareTitle: "Join a gaming club in Espoo" } }),
        "en",
      );

      expect(metadata.title).toBe("Gaming clubs in Espoo");
      expect(metadata.description).toBe("After-school clubs for Espoo families.");
      expect(metadata.openGraph).toMatchObject({
        title: "Join a gaming club in Espoo",
        description: "After-school clubs for Espoo families.",
        images: [expect.objectContaining({ url: HERO_IMAGE, alt: "Children at a club" })],
      });
      expect(metadata.twitter).toMatchObject({
        title: "Join a gaming club in Espoo",
        description: "After-school clubs for Espoo families.",
      });
    });

    it("takes the shown version's own share picture alone, with its alt text", async () => {
      const page = overridden({
        en: { shareImageId: SHARE_PICTURE, shareImageAlt: "A club room" },
        fi: { shareImageId: FI_SHARE_PICTURE, shareImageAlt: "Kerhohuone" },
      });

      const finnish = await landingPageMetadata(page, "fi");
      expect(finnish.openGraph).toMatchObject({
        title: "Pelikerhot Espoossa",
        images: [{ url: FI_SHARE_IMAGE, alt: "Kerhohuone", width: 1200, height: 675 }],
      });
      expect(finnish.twitter).toMatchObject({
        title: "Pelikerhot Espoossa",
        images: [expect.objectContaining({ url: FI_SHARE_IMAGE, alt: "Kerhohuone" })],
      });

      // Swedish is shown the English version, and so its alt text.
      const swedish = await landingPageMetadata(page, "sv");
      expect(swedish.openGraph).toMatchObject({
        images: [expect.objectContaining({ url: SHARE_IMAGE, alt: "A club room" })],
      });
    });

    it("keeps the hero's picture in a language with no share picture while another has one", async () => {
      const page = overridden({ en: { shareImageId: SHARE_PICTURE } });

      const finnish = await landingPageMetadata(page, "fi");
      expect(finnish.openGraph).toMatchObject({
        images: [expect.objectContaining({ url: HERO_IMAGE, alt: "Lapsia" })],
      });
      const english = await landingPageMetadata(page, "en");
      expect(english.openGraph).toMatchObject({
        images: [expect.objectContaining({ url: SHARE_IMAGE })],
      });
    });

    it("gives a share picture with no alt text the card's title", async () => {
      const metadata = await landingPageMetadata(
        overridden({ en: { shareTitle: "Clubs for Espoo kids", shareImageId: SHARE_PICTURE } }),
        "en",
      );

      expect(metadata.openGraph).toMatchObject({
        images: [expect.objectContaining({ url: SHARE_IMAGE, alt: "Clubs for Espoo kids" })],
      });
    });

    it("takes both together", async () => {
      const metadata = await landingPageMetadata(
        overridden({
          en: {
            shareTitle: "Join a gaming club in Espoo",
            shareImageId: SHARE_PICTURE,
            shareImageAlt: "A club room",
          },
        }),
        "en",
      );

      expect(metadata.title).toBe("Gaming clubs in Espoo");
      expect(metadata.openGraph).toMatchObject({
        title: "Join a gaming club in Espoo",
        description: "After-school clubs for Espoo families.",
        images: [expect.objectContaining({ url: SHARE_IMAGE, alt: "A club room" })],
      });
      expect(metadata.twitter).toMatchObject({
        title: "Join a gaming club in Espoo",
        images: [expect.objectContaining({ url: SHARE_IMAGE, alt: "A club room" })],
      });
    });

    it("falls back to the hero's picture once the share picture has left the catalogue", async () => {
      // The removal unsets the id; a copy still naming one whose path it does
      // not carry is read the same way.
      const unset = overridden({ en: { shareImageAlt: "A club room" } });
      const pathless = {
        ...overridden({ en: { shareImageId: SHARE_PICTURE, shareImageAlt: "A club room" } }),
        pictures: PAGE.pictures,
      };

      for (const page of [unset, pathless]) {
        const metadata = await landingPageMetadata(page, "en");
        expect(metadata.openGraph).toMatchObject({
          images: [expect.objectContaining({ url: HERO_IMAGE, alt: "Children at a club" })],
        });
      }
    });

    it("keeps the page title in a language with no share title while another has one", async () => {
      const page = overridden({ en: { shareTitle: "Join a gaming club in Espoo" } });

      const finnish = await landingPageMetadata(page, "fi");
      expect(finnish.openGraph?.title).toBe("Pelikerhot Espoossa");
      expect(finnish.twitter?.title).toBe("Pelikerhot Espoossa");
      const english = await landingPageMetadata(page, "en");
      expect(english.openGraph?.title).toBe("Join a gaming club in Espoo");
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

describe("landingProductListsJsonLd", () => {
  const PICKS = "99999999-9999-4999-8999-999999999999";
  const MORE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const P1 = "0b5a1e2c-3d4f-4a5b-8c6d-7e8f9a0b1c01";
  const P2 = "0b5a1e2c-3d4f-4a5b-8c6d-7e8f9a0b1c02";
  const P3 = "0b5a1e2c-3d4f-4a5b-8c6d-7e8f9a0b1c03";
  const LISTING = [
    browseRow(P1, {
      product_translations: [
        { locale: "en", name: "Roblox club", short_description: "" },
        { locale: "fi", name: "Roblox-kerho", short_description: "" },
      ],
    }),
    browseRow(P2, { name: "Minecraft camp" }),
  ];
  const page = (sections: LocalizedLandingPage["sections"]) => ({ sections, sectionTexts: {} });

  it("lists each products section's listed picks, in the admin's order, by name and page", () => {
    const lists = landingProductListsJsonLd({
      siteUrl: "https://sog.test",
      locale: "en",
      page: page([
        { id: HERO, type: "hero" },
        { id: PICKS, type: "products", background: "default", productIds: [P2, P3, P1] },
      ]),
      listing: LISTING,
    });
    expect(lists).toEqual([
      {
        sectionId: PICKS,
        list: {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Minecraft camp", url: `https://sog.test/en/shop/${P2}` },
            { "@type": "ListItem", position: 2, name: "Roblox club", url: `https://sog.test/en/shop/${P1}` },
          ],
        },
      },
    ]);
  });

  it("names each product as its card does in the page's locale, at its canonical page", () => {
    const [{ list }] = landingProductListsJsonLd({
      siteUrl: "https://sog.test",
      locale: "fi",
      page: page([{ id: PICKS, type: "products", background: "default", productIds: [P1, P2] }]),
      listing: LISTING,
    });
    expect(list.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Roblox-kerho", url: `https://sog.test/fi/kauppa/${P1}` },
      // Written in English alone, so its page canonicalises to the English one.
      { "@type": "ListItem", position: 2, name: "Minecraft camp", url: `https://sog.test/en/shop/${P2}` },
    ]);
  });

  it("lists a drawn municipality club nowhere, since its schools page is never promoted", () => {
    const MUNI = "0b5a1e2c-3d4f-4a5b-8c6d-7e8f9a0b1c04";
    const sections = [
      { id: PICKS, type: "products" as const, background: "default" as const, productIds: [MUNI, P1] },
      { id: MORE, type: "products" as const, background: "default" as const, productIds: [MUNI] },
    ];
    const lists = landingProductListsJsonLd({
      siteUrl: "https://sog.test",
      locale: "en",
      page: page(sections),
      listing: [...LISTING, browseRow(MUNI, { product_type: "municipality_club", name: "Espoo club" })],
    });
    expect(lists.map((entry) => entry.sectionId)).toEqual([PICKS]);
    expect(lists[0].list.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Roblox club", url: `https://sog.test/en/shop/${P1}` },
    ]);
  });

  it("repeats none of a product's own markup", () => {
    const [{ list }] = landingProductListsJsonLd({
      siteUrl: "https://sog.test",
      locale: "en",
      page: page([{ id: PICKS, type: "products", background: "default", productIds: [P1] }]),
      listing: LISTING,
    });
    expect(Object.keys(list.itemListElement[0]).sort()).toEqual(["@type", "name", "position", "url"]);
  });

  it("lists nothing for a section with none listed, and nothing at all without the listing", () => {
    const sections = [
      { id: PICKS, type: "products" as const, background: "default" as const, productIds: [P3] },
      { id: MORE, type: "products" as const, background: "default" as const, productIds: [P1] },
    ];
    expect(
      landingProductListsJsonLd({ siteUrl: "", locale: "en", page: page(sections), listing: LISTING }).map(
        (entry) => entry.sectionId,
      ),
    ).toEqual([MORE]);
    expect(
      landingProductListsJsonLd({ siteUrl: "", locale: "en", page: page(sections), listing: null }),
    ).toEqual([]);
  });

  it("leaves the page's own node as it was", () => {
    const withPicks = landingPageJsonLd({
      siteUrl: "https://sog.test",
      canonicalPath: "/en/discover/x",
      page: { ...SHOWN, sections: [{ id: HERO, type: "hero" }, { id: PICKS, type: "products", background: "default", productIds: [P1] }] },
    });
    expect(withPicks["@type"]).toBe("WebPage");
    expect(JSON.stringify(withPicks)).not.toContain(P1);
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
