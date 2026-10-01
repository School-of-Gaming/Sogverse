import { describe, expect, it } from "vitest";
import type { SupportedLocale } from "@/lib/constants/locales";
import { translatedPageMetadataAlternates } from "@/lib/metadata/translated-page";

const pathAt = (locale: SupportedLocale) => `/${locale}/page`;
const written = (...locales: SupportedLocale[]) =>
  locales.map((locale) => ({ locale }));

describe("a page written per locale: its alternates", () => {
  it("names each written, indexed locale in the site's order, never Klingon", () => {
    const { languages } = translatedPageMetadataAlternates(
      written("fr", "tlh", "en", "fi"),
      "en",
      pathAt,
    );
    expect(Object.keys(languages ?? {})).toEqual(["en", "fi", "fr", "x-default"]);
    expect(languages).toMatchObject({ en: "/en/page", fi: "/fi/page", fr: "/fr/page" });
  });

  it("points x-default at English when written, else at the first written", () => {
    expect(
      translatedPageMetadataAlternates(written("en", "fi"), "fi", pathAt).languages?.[
        "x-default"
      ],
    ).toBe("/en/page");
    expect(
      translatedPageMetadataAlternates(written("fi", "sv"), "fi", pathAt),
    ).toEqual({
      canonical: "/fi/page",
      languages: { fi: "/fi/page", sv: "/sv/page", "x-default": "/fi/page" },
    });
  });

  it("canonicalises an unwritten locale to the locale whose words it shows", () => {
    expect(
      translatedPageMetadataAlternates(written("en", "fi"), "sv", pathAt).canonical,
    ).toBe("/en/page");
  });

  it("makes a page showing text in a non-indexed locale its own canonical, with no versions", () => {
    expect(translatedPageMetadataAlternates(written("tlh"), "fi", pathAt)).toEqual({
      canonical: "/fi/page",
    });
    // Read at Klingon itself, a page with indexed versions still names none of them.
    expect(
      translatedPageMetadataAlternates(written("en", "tlh"), "tlh", pathAt),
    ).toEqual({ canonical: "/tlh/page" });
  });
});
