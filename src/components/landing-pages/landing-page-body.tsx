import { Fragment } from "react";
import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { landingPictureShapeOf } from "@/lib/landing-pages/picture-shapes";
import type {
  LandingSection,
  LandingSectionTexts,
} from "@/lib/landing-pages/sections";
import type { LandingPictures } from "@/services/landing-pages/landing-pages.contracts";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import { landingSectionText } from "./landing-section-types";
import { renderLandingSection, type LandingRenderContext } from "./landing-sections";

export interface LandingPageBodyProps {
  /** The structure, in page order: the hero first. */
  sections: readonly LandingSection[];
  /** Each picture's path and purpose, by catalogue entry id. */
  pictures: Readonly<LandingPictures>;
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
 */
export function LandingPageBody({
  sections,
  pictures,
  testimonials,
  sectionTexts,
  textLocale,
  locale,
}: LandingPageBodyProps) {
  const context: LandingRenderContext = {
    locale,
    textLocale,
    picture: (imageId) => {
      if (!Object.hasOwn(pictures, imageId)) return null;
      const { path, purpose } = pictures[imageId];
      const src = catalogueImageSrc(purpose, path);
      return src === null ? null : { src, shape: landingPictureShapeOf(purpose) };
    },
    testimonial: (id) => (Object.hasOwn(testimonials, id) ? testimonials[id] : null),
  };
  return (
    // exact-locale: marks text written in another language than the page with lang
    <div lang={textLocale === locale ? undefined : textLocale}>
      {sections.map((section) => (
        <Fragment key={section.id}>
          {renderLandingSection(
            section.type,
            section,
            landingSectionText(sectionTexts, section.id),
            context,
          )}
        </Fragment>
      ))}
    </div>
  );
}
