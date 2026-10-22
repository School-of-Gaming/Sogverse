import { Fragment } from "react";
import type { ProductRailPrefetch } from "@/components/public/products/product-rail-selection";
import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import {
  landingSectionBackground,
  type LandingSection,
  type LandingSectionTexts,
} from "@/lib/landing-pages/sections";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import { landingSectionText } from "./landing-section-types";
import { renderLandingSection, type LandingRenderContext } from "./landing-sections";

export interface LandingPageBodyProps {
  /** The structure, in page order: the hero first. */
  sections: readonly LandingSection[];
  /** Each picture's path in the `landing-images` bucket, by catalogue entry id. */
  imagePaths: Readonly<Record<string, string>>;
  /**
   * The current words of each testimonial the structure places, by id — read
   * from the store per request, never from the copy, so an edit shows
   * without a republish.
   */
  testimonials: Readonly<Record<string, PublicTestimonial>>;
  /** The shown version's words, by section id. */
  sectionTexts: LandingSectionTexts;
  /** The language the shown version is written in. */
  textLocale: SupportedLocale;
  /** The page's locale — the URL's. */
  locale: SupportedLocale;
  /**
   * The listing and seat counts for the page's products sections, read
   * on the server (`prefetchLandingProducts`); null when the page has none or
   * the read failed.
   */
  products: ProductRailPrefetch | null;
  /** The page's id. */
  pageId: string;
  /** The admin's preview of a working copy: an email sign-up form cannot be sent. */
  preview: boolean;
}

/**
 * **A landing page's body: its sections in order, each through its type's
 * renderer.** The one body both the live page and the admin's preview render,
 * so the preview is the page as a reader would meet it.
 *
 * Every word on it is the version's, so where that version is in another
 * language than the page — the reader fallback answered — the whole body
 * carries that language, for a screen reader's voice and the browser's
 * hyphenation alike.
 *
 * A section whose background is `card` sits on a band of the card ground that
 * runs the viewport's full width, while its content keeps the section's own
 * container. Each band carries no spacing of its own — the section's padding
 * is inside it — so adjacent `card` sections join into one band, an admin's
 * way of grouping related sections, spaced apart as any two sections are; and
 * a band meets a plain section at its edge with each side's padding intact.
 */
export function LandingPageBody({
  sections,
  imagePaths,
  testimonials,
  sectionTexts,
  textLocale,
  locale,
  products,
  pageId,
  preview,
}: LandingPageBodyProps) {
  const context: LandingRenderContext = {
    locale,
    textLocale,
    pageId,
    preview,
    imageSrc: (imageId) => catalogueImageSrc("landing_image", imagePaths[imageId]),
    testimonial: (id) => (Object.hasOwn(testimonials, id) ? testimonials[id] : null),
    products,
  };
  return (
    // exact-locale: marks text written in another language than the page with lang
    <div lang={textLocale === locale ? undefined : textLocale}>
      {sections.map((section) => {
        const drawn = renderLandingSection(
          section.type,
          section,
          landingSectionText(sectionTexts, section.id),
          context,
        );
        return (
          <Fragment key={section.id}>
            {landingSectionBackground(section) === "card" ? (
              <div className="bg-card">{drawn}</div>
            ) : (
              drawn
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
