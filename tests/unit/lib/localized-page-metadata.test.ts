import { describe, it, expect, vi } from "vitest";

// The shared setup mocks the wrapped navigation so component tests can render a
// link without a router, and its `getPathname` ignores the locale. This file is
// *about* what that function does with a locale, so it takes the real one.
vi.unmock("@/i18n/navigation");
// And the module it is built on: next-intl reads `permanentRedirect` off
// `next/navigation` while constructing the wrapped APIs, which the setup's
// partial mock does not carry.
vi.unmock("next/navigation");

// The card's alt text is the only thing here that reads the catalog, and what
// this file is about is the URLs. A stub keeps the assertions on the shape.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: string }) => (key: string) =>
    `${locale}:${key}`,
}));

const { localizedPageMetadata, INDEXED_LOCALES } = await import(
  "@/lib/metadata/localized-page"
);

/**
 * The `hreflang` set, the canonical and the card, per page.
 *
 * The property worth pinning is that every URL comes out of the pathnames map:
 * a translated slug that the sitemap or an alternate restated by hand would be
 * a 404 advertised to a search engine.
 */
describe("localizedPageMetadata", () => {
  it("names every indexed locale's translated URL, and no Klingon", () => {
    expect(INDEXED_LOCALES).toEqual(["en", "fi", "sv", "fr"]);
  });

  it("emits the translated URL of every language plus a bare x-default", async () => {
    const { alternates } = await localizedPageMetadata("/shop", "fi");

    expect(alternates?.languages).toEqual({
      en: "/en/shop",
      fi: "/fi/kauppa",
      sv: "/sv/butik",
      fr: "/fr/boutique",
      // The bare URL is the language detector — it redirects by the cookie →
      // header → English ladder — which is what x-default is for.
      "x-default": "/shop",
    });
  });

  it("canonicalises a page to itself, in its own locale", async () => {
    expect((await localizedPageMetadata("/privacy", "fr")).alternates?.canonical)
      .toBe("/fr/confidentialite");
    expect((await localizedPageMetadata("/privacy", "en")).alternates?.canonical)
      .toBe("/en/privacy");
  });

  it("carries the locale-correct card, since a page's own openGraph replaces the layout's", async () => {
    const { openGraph } = await localizedPageMetadata("/about", "sv");

    expect(openGraph).toMatchObject({
      type: "website",
      siteName: "School of Gaming",
      locale: "sv",
      images: [
        {
          url: "/opengraph-images/site?locale=sv",
          alt: "sv:site.alt",
          width: 1200,
          height: 630,
        },
      ],
    });
  });

  it("falls back rather than trusting an unrecognised locale", async () => {
    // `getLocale()` is typed as a bare string; the guard lives here so no call
    // site has to restate it.
    expect((await localizedPageMetadata("/", "xx")).alternates?.canonical).toBe(
      "/en",
    );
  });
});
