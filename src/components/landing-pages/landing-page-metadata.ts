import type { Metadata } from "next";
import { resolveLocale } from "@/lib/constants/locales";
import { translatedPageMetadataAlternates } from "@/lib/metadata/translated-page";
import { ogCardImage } from "@/lib/og/card-metadata";
import {
  localizeLandingPageSummary,
  type PublishedLandingPageSummary,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingPagePaths } from "./landing-page-address";

/**
 * A live landing page's metadata, read at `requestLocale`. Landing pages are
 * promoted (`docs/architecture/site-quality.md`), and every affordance is the
 * system's: the admin writes a title, a summary and a slug, and nothing else.
 *
 * - **The title and description are the shown version's own** — its title and
 *   its summary, which the schema caps at a search result's length.
 * - **The canonical and language versions follow the rule every page written
 *   per locale follows** (`src/lib/metadata/translated-page.ts`): the locales
 *   live are the language versions, each at its slug address, and a locale
 *   with no live version canonicalises to the slug address of the version it
 *   shows. `og:url` is the canonical.
 * - **The card is the site-wide one, at the request's locale** — per-page cards
 *   are out of v1. It is restated rather than inherited because Next assigns a
 *   child's `openGraph` and `twitter` over the layout's, dropping its image;
 *   `siteName` and `type` are restated for the same reason. `og:locale` is the
 *   language of the version whose words the card carries.
 */
export async function landingPageMetadata(
  page: PublishedLandingPageSummary,
  requestLocale: string,
): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const shown = localizeLandingPageSummary(page, locale);
  if (shown === null) return {};
  const { title, summary: description } = shown;
  const images = [await ogCardImage("site", locale)];
  const alternates = translatedPageMetadataAlternates(
    page.versions,
    locale,
    landingPagePaths(page),
  );

  return {
    title,
    description,
    alternates,
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      locale: shown.locale,
      url: alternates.canonical,
      title,
      description,
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
