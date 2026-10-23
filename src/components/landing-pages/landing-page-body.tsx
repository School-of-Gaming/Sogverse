import { Fragment } from "react";
import type { ProductRailPrefetch } from "@/components/public/products/product-rail-selection";
import type { SupportedLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/cn";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { landingPictureShapeOf } from "@/lib/landing-pages/picture-shapes";
import {
  landingSectionBackground,
  landingStickySection,
  type LandingSection,
  type LandingSectionTexts,
  type LandingStickySide,
} from "@/lib/landing-pages/sections";
import type { LandingPictures } from "@/services/landing-pages/landing-pages.contracts";
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
  /** Each picture's path and purpose, by catalogue entry id. */
  pictures: Readonly<LandingPictures>;
  /**
   * The current words of each testimonial the structure places, by id — read
   * from the store per request, never from the copy, so an edit shows
   * without a republish.
   */
  testimonials: Readonly<Record<string, PublicTestimonial>>;
  /**
   * The ids of the guides the structure places that the read answered — read
   * from the store per request like the testimonials, so a guide's section
   * shows exactly while it has something to offer.
   */
  guideIds: readonly string[];
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

// ---- The sticky card's width budget ----
//
// Borrowed from the shop's browse grid: the content stays in the page's
// centre and the sticky card stands in the gutter beside it, outside the
// content box. Nothing a section draws is narrowed or padded for the card.
//
// From `2xl` (1536px) a page with a sticky section is a three-track grid,
// gutter | content | gutter, as wide as the viewport so the card can live in
// its margin:
//
// - **The content track** is `minmax(0, 74rem)`: the widest section measure
//   (`max-w-6xl`, 72rem, 1152px) plus the container's 1rem inline padding
//   either side, which every section keeps. A section is drawn in it exactly
//   as on a page without a sticky section, so its measure and its pictures'
//   `sizes` hold.
// - **The card's gutter** is `minmax(rail + gap, 1fr)`: the card, 20rem
//   (`--landing-rail-width`), in a layer with the container's 1rem inline
//   padding. That 1rem toward the content and the section's own 1rem are the
//   2rem gap (`--landing-rail-gap`) between card and measure, the card pinned
//   against the content as the shop's filter rail is; its 1rem outward is the
//   page's edge, as the shop's.
// - **The opposite gutter** is `minmax(0, 1fr)`, free to close entirely.
//
// Both gutters are `1fr`, so the content is dead centre wherever they can be
// equal; below that the card's gutter holds its 352px floor and the opposite
// one takes the rest, so the content slides away from the card only as far as
// it must. Measured in a real browser without a scrollbar, for a right card:
// at 1536 the content track is 1184 at the viewport's edge, the measure
// 16–1168 (176px left of centre) and the card 1200–1520, so the whole 1152px
// measure fits with nothing to spare; at 1680 the measure is 160–1312 (104px
// left of centre), the card 1344–1664; at 1856 the measure is 336–1488 (16px
// left), the card 1520–1840; from 1888 (1184 + 2 × 352) the gutters are equal
// and the measure centred — at 1920 it is 384–1536, the card 1568–1888. A
// classic scrollbar (about 17px on Windows) is the one thing that does not fit
// at 1536: it comes out of the content track, leaving the measure 1135px.
//
// **Full-width bands keep spanning the viewport.** Each section is drawn in a
// row that spans all three tracks and inherits them (`subgrid`), the section
// in the middle one; a `card` section's band is that row on the card ground,
// so it runs edge to edge while its content lines up with every other
// section's. A subgrid states the template once, on the page, for every row
// to follow — where an offset computed per section would have to agree with
// the card's side by arithmetic. The card's layer takes the same grid row as
// the sections, in its gutter, so it is as tall as they are: sticky travels
// only within that, so the card can never reach the footer or run past the
// page's end.
//
// The card is what the email form inside it is fitted to: its inputs are
// 270px, close to the 278 a 360px phone gives them, and that holds for the
// name fields only because the card stacks them — side by side, as the
// viewport's width would otherwise set them, each would get about 128px.
//
// Below `2xl` none of this exists: the sticky section is drawn at the page's
// end, after the last section and before the footer, and the jump button
// under the hero's words scrolls to it. Every class here naming `2xl` is that
// one decision written where it applies, so they change together.

/** The page grid, by the card's side: the card's gutter keeps its floor, the other may close. */
const STICKY_PAGE: Record<LandingStickySide, string> = {
  left: "2xl:grid 2xl:grid-cols-[minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)_minmax(0,74rem)_minmax(0,1fr)]",
  right:
    "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,74rem)_minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)]",
};

/** The sections: the page grid's one row, across all three tracks, which each section's row inherits. */
const STICKY_SECTIONS = "2xl:col-span-full 2xl:row-start-1 2xl:grid 2xl:grid-cols-subgrid";

/** One section's row — its band, when it has one: all three tracks, the section in the content one. */
const STICKY_ROW = "2xl:col-span-full 2xl:grid 2xl:grid-cols-subgrid 2xl:*:col-start-2";

/**
 * The layer that holds the card, by its side. Below `2xl` it is the page's
 * end: the container, with the bottom spacing a section has (the last
 * section's own bottom spacing is the gap above it). From `2xl` it is the
 * card's gutter in the sections' row, as tall as they are, starting and
 * ending with the hero's and the last section's spacing; a left card is
 * pushed to the gutter's inner edge, against the content.
 */
const STICKY_LAYER: Record<LandingStickySide, string> = {
  left: "container mx-auto px-4 pb-16 sm:pb-24 2xl:col-start-1 2xl:row-start-1 2xl:pt-24",
  right: "container mx-auto px-4 pb-16 sm:pb-24 2xl:col-start-3 2xl:row-start-1 2xl:pt-24",
};

/**
 * The card's holder: pinned under the site header from `2xl` with the
 * two-end clamp (`min(header offset, viewport − its height − gap)`), so a
 * card taller than the window is still reachable to its last control. Its
 * `scroll-mt` is where the jump lands it, below the stuck header.
 */
const STICKY_RAIL: Record<LandingStickySide, string> = {
  left: "scroll-mt-[calc(var(--header-height)+1rem)] 2xl:sticky 2xl:top-[min(calc(var(--header-height)+1.5rem),calc(100vh-var(--landing-rail-height)-1.5rem))] 2xl:ml-auto 2xl:w-[var(--landing-rail-width)]",
  right:
    "scroll-mt-[calc(var(--header-height)+1rem)] 2xl:sticky 2xl:top-[min(calc(var(--header-height)+1.5rem),calc(100vh-var(--landing-rail-height)-1.5rem))] 2xl:w-[var(--landing-rail-width)]",
};

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
 * document, which is where it sits below `2xl` and what keeps the page's
 * outline in reading order wherever it is painted: its heading is an H2 under
 * the hero's H1 like every other section's. From `2xl` the same element is
 * the sticky card in the gutter beside the sections (the budget above). Below
 * `2xl` the page
 * draws the jump button down to it under the hero's content — only while the
 * section has something to offer (`LANDING_STICKY_OFFERS`), withdrawn rather
 * than disabled otherwise, and withdrawn from `2xl`, where the section is
 * already on screen. The structure rule puts a hero first on every page, so
 * there is always a hero to draw it under.
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
  pictures,
  testimonials,
  guideIds,
  sectionTexts,
  textLocale,
  locale,
  products,
  pageId,
  preview,
}: LandingPageBodyProps) {
  const sticky = landingStickySection(sections);
  const offer =
    sticky === null
      ? null
      : landingStickyOffer(sticky.type, landingSectionText(sectionTexts, sticky.id));
  const guides = new Set(guideIds);
  const context: LandingRenderContext = {
    locale,
    textLocale,
    pageId,
    preview,
    picture: (imageId) => {
      if (!Object.hasOwn(pictures, imageId)) return null;
      const { path, purpose } = pictures[imageId];
      const src = catalogueImageSrc(purpose, path);
      return src === null ? null : { src, shape: landingPictureShapeOf(purpose) };
    },
    testimonial: (id) => (Object.hasOwn(testimonials, id) ? testimonials[id] : null),
    products,
    underHero:
      offer === null ? null : (
        <LandingStickyJump
          target={LANDING_STICKY_ANCHOR}
          label={offer}
          className="mt-8 2xl:hidden"
        />
      ),
    hasGuide: (id) => guides.has(id),
  };
  const render = (section: LandingSection) =>
    renderLandingSection(
      section.type,
      section,
      landingSectionText(sectionTexts, section.id),
      context,
    );
  // A section in the flow, on its band when its background is `card`: the
  // band is the full-width wrapper and the section inside it is the content
  // box. On a page with a sticky section every section has a row of the page
  // grid (`STICKY_ROW`), the band being that row on the card ground.
  const draw = (section: LandingSection, row?: string) => {
    const band = landingSectionBackground(section) === "card";
    if (row === undefined && !band) {
      return <Fragment key={section.id}>{render(section)}</Fragment>;
    }
    return (
      <div key={section.id} className={cn(band && "bg-card", row)}>
        {render(section)}
      </div>
    );
  };

  // exact-locale: marks text written in another language than the page with lang
  const lang = textLocale === locale ? undefined : textLocale;
  if (sticky === null) {
    return <div lang={lang}>{sections.map((section) => draw(section))}</div>;
  }
  return (
    <div lang={lang} className={STICKY_PAGE[sticky.sticky]}>
      <div className={STICKY_SECTIONS}>
        {sections
          .filter((section) => section.id !== sticky.id)
          .map((section) => draw(section, STICKY_ROW))}
      </div>
      <div className={STICKY_LAYER[sticky.sticky]}>
        <LandingStickyRail id={LANDING_STICKY_ANCHOR} className={STICKY_RAIL[sticky.sticky]}>
          {/* Never on a band: the sticky section is a card standing on the page. */}
          {render(sticky)}
        </LandingStickyRail>
      </div>
    </div>
  );
}
