import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import {
  localizeLandingPageSummary,
  type PublishedLandingPageSummary,
} from "@/services/landing-pages/landing-pages.contracts";
import {
  landingPageCanonicalPath,
  landingPageHref,
} from "../landing-page-address";
import { landingLeadPicturePath } from "../landing-section-seo";
import type { DiscoverPageCardProps } from "./discover-page-card";

/** One live page on the index: the card a reader sees, and where it canonicalises. */
export interface DiscoverIndexEntry {
  card: DiscoverPageCardProps;
  /**
   * The canonical path of the page the card opens — the slug address of the
   * version the card shows — for the index's structured data, which must
   * never name an address that canonicalises elsewhere.
   */
  canonicalPath: string;
}

/**
 * **Every live landing page as the index lists it, for a reader of
 * `locale`**, in the order the live list arrives: newest first by the day
 * each first went live. Every live page is listed; there is no opting out.
 *
 * Each card shows the version that reader is shown — theirs, else English,
 * else the first written — and opens the page in the index's own locale, as a
 * Library card does: its slug address where it is live in `locale`, else its
 * id address, whose page shows the same fallback the card does. The page
 * canonicalises to the slug address of the version shown, which is what the
 * structured data names.
 */
export function discoverIndexEntries(
  live: readonly PublishedLandingPageSummary[],
  locale: SupportedLocale,
): DiscoverIndexEntry[] {
  return live.map((page) => {
    const shown = localizeLandingPageSummary(page, locale);
    return {
      card: {
        id: page.id,
        href: landingPageHref(page, locale),
        textLocale: shown.locale,
        pictureSrc: catalogueImageSrc("landing_image", landingLeadPicturePath(page)),
        title: shown.title,
        summary: shown.summary,
      },
      canonicalPath: landingPageCanonicalPath(page, locale),
    };
  });
}
