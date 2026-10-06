import type { Metadata } from "next";
import { resolveLocale } from "@/lib/constants/locales";
import { translatedPageMetadataAlternates } from "@/lib/metadata/translated-page";
import { ogCardImage } from "@/lib/og/card-metadata";
import { ogPictureImage } from "@/lib/og/picture";
import {
  localizeLandingPage,
  type PublishedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingPagePaths } from "./landing-page-address";
import { landingLeadPicture } from "./landing-section-seo";

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
 * - **The card is the hero's picture**, the one the page leads with
 *   (`landingLeadPicture`), served through the preview picture route with the
 *   shown version's alt text. A page whose hero has no picture takes the
 *   site-wide card, at the request's locale. Either is restated rather than
 *   inherited because Next assigns a child's `openGraph` and `twitter` over the
 *   layout's, dropping its image; `siteName` and `type` are restated for the
 *   same reason. `og:locale` is the language of the version whose words the
 *   card carries.
 */
export async function landingPageMetadata(
  page: PublishedLandingPage,
  requestLocale: string,
): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const shown = localizeLandingPage(page, locale);
  if (shown === null) return {};
  const { title, summary: description } = shown;
  const picture = landingLeadPicture(shown);
  const images = [
    picture === null
      ? await ogCardImage("site", locale)
      : ogPictureImage("landing_image", picture.path, picture.alt ?? title),
  ];
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
