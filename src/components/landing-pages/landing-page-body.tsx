import { Fragment } from "react";
import type { ProductRailPrefetch } from "@/components/public/products/product-rail-selection";
import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import {
  landingStickySection,
  type LandingSection,
  type LandingSectionTexts,
  type LandingStickySide,
} from "@/lib/landing-pages/sections";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import { landingSectionText } from "./landing-section-types";
import {
  landingStickyOffer,
  renderLandingSection,
  type LandingRenderContext,
} from "./landing-sections";
import { LandingStickyJump, LandingStickyRail } from "./landing-sticky";

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
 * The sticky section's anchor: what the jump button scrolls to. One constant,
 * because a jump is two halves that have to agree.
 */
export const LANDING_STICKY_ANCHOR = "landing-sticky";

// ---- The sticky column's width budget ----
//
// From `xl` (1280px) a page with a sticky section draws it in a column 20rem
// (320px) wide on the side the admin chose, 2rem from the sections' content,
// both declared in `globals.css`. The column is not a grid track the sections
// are squeezed into: the sections keep the container's whole width — so a
// section's band can still run under the column — and pay for it out of
// their own inline padding, which the `--landing-rail-space-*` property set
// here grows on the column's side. The column is laid over the sections in
// the same grid cell, inside the same container, so its outer edge is the
// container's and its height is the sections': sticky travels only within
// that, so it can never reach the footer or run past the page's end.
//
// What that leaves the sections' content, measured in a real browser without a
// scrollbar (a classic 17px one takes that much off at 1280 only, where the
// container is the viewport): 896px at 1280 and at 1440, where the container
// caps at 1280, and 1152px from 1536, a `max-w-6xl` section's whole measure.
// At 896 every type still works — the hero's two columns at 416px each (a
// long headline takes four lines where it took three), a row of three
// pictures at 288, three points or steps across at about 280, the questions
// at their 768 cap — with nothing overflowing, and the email form inside the
// card has 270px inputs, close to the 278 a 360px phone gives it. So the
// column starts at `xl` rather than `2xl`.
//
// Below `xl` none of this exists: the sticky section is drawn at the page's
// end, after the last section and before the footer, and the jump button
// under the hero's words scrolls to it. Every class here naming `xl` is that
// one decision written where it applies, so they change together.

/** The page wrapper, by the column's side: the cell both layers share, and the space each section clears. */
const STICKY_PAGE: Record<LandingStickySide, string> = {
  left: "xl:grid xl:grid-cols-1 xl:[--landing-rail-space-left:calc(var(--landing-rail-width)+var(--landing-rail-gap))]",
  right:
    "xl:grid xl:grid-cols-1 xl:[--landing-rail-space-right:calc(var(--landing-rail-width)+var(--landing-rail-gap))]",
};

/**
 * The layer over the sections that holds the column, by its side. Below `xl`
 * it is the page's end: the container, with the bottom spacing a section has
 * (the last section's own bottom spacing is the gap above it). From `xl` it
 * lies over the sections in their cell, as tall as they are, starting and
 * ending with the hero's and the last section's spacing; it takes no pointer
 * events, so the sections under it stay clickable everywhere the column is
 * not.
 */
const STICKY_LAYER: Record<LandingStickySide, string> = {
  left: "container mx-auto px-4 pb-16 sm:pb-24 xl:pointer-events-none xl:col-start-1 xl:row-start-1 xl:flex xl:justify-start xl:pt-24",
  right:
    "container mx-auto px-4 pb-16 sm:pb-24 xl:pointer-events-none xl:col-start-1 xl:row-start-1 xl:flex xl:justify-end xl:pt-24",
};

/**
 * The column: pinned under the site header from `xl` with the two-end clamp
 * (`min(header offset, viewport − its height − gap)`), so a column taller
 * than the window is still reachable to its last control. `self-start` is
 * what lets it stick at all, as a stretched item is already as tall as its
 * row. Its `scroll-mt` is where the jump lands it, below the stuck header.
 */
const STICKY_RAIL =
  "scroll-mt-[calc(var(--header-height)+1rem)] xl:pointer-events-auto xl:sticky xl:top-[min(calc(var(--header-height)+1.5rem),calc(100vh-var(--landing-rail-height)-1.5rem))] xl:w-[var(--landing-rail-width)] xl:shrink-0 xl:self-start";

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
 * **A page's sticky section is drawn once**, after every other section in the
 * document, which is where it sits below `xl` and what keeps the page's
 * outline in reading order wherever it is painted: its heading is an H2 under
 * the hero's H1 like every other section's. From `xl` the same element is the
 * sticky column beside the sections (the budget above). Below `xl` the page
 * draws the jump button down to it under the hero's content — only while the
 * section has something to offer (`LANDING_STICKY_OFFERS`), withdrawn rather
 * than disabled otherwise, and withdrawn from `xl`, where the section is
 * already on screen. The structure rule puts a hero first on every page, so
 * there is always a hero to draw it under.
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
  const sticky = landingStickySection(sections);
  const base: LandingRenderContext = {
    locale,
    textLocale,
    pageId,
    preview,
    imageSrc: (imageId) => catalogueImageSrc("landing_image", imagePaths[imageId]),
    testimonial: (id) => (Object.hasOwn(testimonials, id) ? testimonials[id] : null),
    products,
    underHero: null,
  };
  const offer =
    sticky === null
      ? null
      : landingStickyOffer(sticky.type, landingSectionText(sectionTexts, sticky.id), base);
  const context: LandingRenderContext =
    offer === null
      ? base
      : {
          ...base,
          underHero: (
            <LandingStickyJump
              target={LANDING_STICKY_ANCHOR}
              label={offer}
              className="mt-8 xl:hidden"
            />
          ),
        };
  const draw = (section: LandingSection) => (
    <Fragment key={section.id}>
      {renderLandingSection(
        section.type,
        section,
        landingSectionText(sectionTexts, section.id),
        context,
      )}
    </Fragment>
  );

  // exact-locale: marks text written in another language than the page with lang
  const lang = textLocale === locale ? undefined : textLocale;
  if (sticky === null) {
    return <div lang={lang}>{sections.map(draw)}</div>;
  }
  return (
    <div lang={lang} className={STICKY_PAGE[sticky.sticky]}>
      <div className="xl:col-start-1 xl:row-start-1">
        {sections.filter((section) => section.id !== sticky.id).map(draw)}
      </div>
      <div className={STICKY_LAYER[sticky.sticky]}>
        <LandingStickyRail id={LANDING_STICKY_ANCHOR} className={STICKY_RAIL}>
          {draw(sticky)}
        </LandingStickyRail>
      </div>
    </div>
  );
}
