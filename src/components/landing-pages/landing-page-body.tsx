import { Fragment, type ReactNode } from "react";
import {
  selectRailProducts,
  type ProductRailPrefetch,
} from "@/components/public/products/product-rail-selection";
import type { SupportedLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/cn";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import { landingPictureShapeOf } from "@/lib/landing-pages/picture-shapes";
import {
  landingSectionBackground,
  landingStickySections,
  type LandingSection,
  type LandingSectionTexts,
  type LandingStickySide,
} from "@/lib/landing-pages/sections";
import type { LandingPictures } from "@/services/landing-pages/landing-pages.contracts";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import { landingCopyPicture } from "./landing-section-seo";
import { landingSectionText } from "./landing-section-types";
import { renderLandingSection, type LandingRenderContext } from "./landing-sections";
import { LandingStickyRail } from "./landing-sticky";

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
  /**
   * The trail drawn above the sections, in the page's own language. The body
   * draws it so that, on a page with a sticky section, it stands in the same
   * content track as the sections and keeps their left edge.
   */
  breadcrumb?: ReactNode;
}

// ---- The sticky cards' width budget ----
//
// Borrowed from the shop's browse grid: the content stays in the page's
// centre and a sticky card stands in the gutter beside it, outside the
// content box. Nothing a section draws is narrowed or padded for a card. A
// page has a card on the left, on the right, on both sides or on neither.
//
// From `2xl` (1536px) a page with a sticky section is a three-track grid,
// gutter | content | gutter, as wide as the viewport so a card can live in
// its margin:
//
// - **The content track** is `minmax(0, 74rem)`: the widest section measure
//   (`max-w-6xl`, 72rem, 1152px) plus the container's 1rem inline padding
//   either side, which every section keeps. A section is drawn in it exactly
//   as on a page without a sticky section; where the track is narrower than
//   the measure — between two cards, below 1872 — its pictures' `sizes` say
//   so (`twoCards` in the render context), and with one card they hold.
// - **A card's gutter** is `minmax(rail + gap, 1fr)`: the card, 20rem
//   (`--landing-rail-width`), in a layer with 1rem of padding outward and
//   0.5rem toward the content. That 0.5rem and the section's own 1rem are the
//   1.5rem gap (`--landing-rail-gap`, the product page's and the shop's
//   `gap-6`) between card and measure, the card pinned against the content as
//   the shop's filter rail is; its 1rem outward is the page's edge, as the
//   shop's, and the card's whole distance from the window when its gutter is
//   at the floor.
// - **A gutter with no card** is `minmax(0, 1fr)`, free to close entirely.
//
// Both gutters are `1fr`, so the content is dead centre wherever they can be
// equal. **A card on one side:** below 1872 the card's gutter holds its 344px
// floor and the opposite one takes the rest, so the content slides away from
// the card only as far as it must. Measured in a real browser without a
// scrollbar, for a right card: at 1536 the content track is 8–1192, the
// measure 24–1176 (168px left of centre) and the card 1200–1520, so the whole
// 1152px measure fits with 8px to spare; at 1680 the measure is 168–1320 (96px
// left of centre), the card 1344–1664; at 1700 the measure is 188–1340 (86px
// left), the card 1364–1684; at 1856 the measure is 344–1496 (8px left), the
// card 1520–1840; from 1872 (1184 + 2 × 344) the gutters are equal and the
// measure centred — at 1920 it is 384–1536, the card 1560–1880.
//
// **A card on each side:** both gutters hold their floor, so the content never
// slides — it stays dead centre and the content track narrows instead, to
// whatever the two 344px floors leave. Worked through from the same tracks:
// at 1536 the track is 344–1192 (848), the measure 360–1176 (816), the cards
// 16–336 and 1200–1520; at 1700 the track is 344–1356 (1012), the measure
// 360–1340 (980), the cards 16–336 and 1364–1684; at 1872 the track reaches
// its 1184 and the measure 360–1512 its full 1152, the cards 16–336 and
// 1536–1856; wider, the gutters grow alike. A section measure narrower than
// the track keeps its own width; a wider one is held to the track, as on any
// viewport narrower than its measure.
//
// A classic scrollbar (about 17px on Windows) comes out of the content track
// wherever a gutter is at its floor: at 1536 it leaves a lone card's measure
// 1143px and two cards' 799px.
//
// **Full-width bands keep spanning the viewport.** Each section in the flow
// is drawn in a row that spans all three tracks and inherits them
// (`subgrid`), the section in the middle one; a `card` section's band is that
// row on the card ground, so it runs edge to edge while its content lines up
// with every other section's. A subgrid states the template once, on the
// page, for every row to follow — where an offset computed per section would
// have to agree with the cards' sides by arithmetic. The breadcrumb is the
// page grid's first row, a row like a section's, so it keeps the content's
// left edge wherever the content sits.
//
// **A sticky section is drawn once, at its place in the structure**, so its
// heading's level and the page's outline follow the structure at every width.
// The sections are one grid of their own (the page grid's second row, its
// columns the page's tracks), and each section in the flow is placed in the
// next of its rows by its position among them — a count the server has, never
// a measurement. A sticky section takes no row: from `2xl` it is placed in its
// gutter's column, spanning every row from the first to the last, so it is as
// tall as the sections are and sticky travels only within that — a card can
// never reach the footer or run past the page's end. Because it is placed
// rather than flowed, the rows around it close up: two `card` sections either
// side of it meet as one band from `2xl`, and that is accepted. A band
// crossing the gutter passes behind the card, which is drawn after it.
//
// The card is what the email form inside it is fitted to: its inputs are
// 270px, close to the 278 a 360px phone gives them, and that holds for the
// name fields only because the card stacks them — side by side, as the
// viewport's width would otherwise set them, each would get about 128px.
//
// **Below `2xl` none of this exists**: the sections are not a grid, so a
// placement does nothing, and a sticky section is drawn exactly as the same
// section without `sticky` — at its place, on its own background, a `card`
// one on its band. Every class here naming `2xl` is that one decision written
// where it applies, and so are the section renderers' sticky classes
// (`landing-section-header.tsx`), so they change together.

/** Which gutters hold a card: one side's, or both. */
type StickySides = LandingStickySide | "both";

/**
 * The page grid, by the gutters holding a card: a card's gutter keeps its
 * floor, a gutter with none may close. The one statement of the template.
 */
const STICKY_PAGE: Record<StickySides, string> = {
  left: "2xl:grid 2xl:grid-cols-[minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)_minmax(0,74rem)_minmax(0,1fr)]",
  right:
    "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,74rem)_minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)]",
  both: "2xl:grid 2xl:grid-cols-[minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)_minmax(0,74rem)_minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)]",
};

/** One section's row — its band, when it has one: all three tracks, the section in the content one. */
const STICKY_ROW = "2xl:col-span-full 2xl:grid 2xl:grid-cols-subgrid 2xl:*:col-start-2";

/** The breadcrumb: the page grid's first row, drawn as a section's row is. */
const STICKY_BREADCRUMB = `${STICKY_ROW} 2xl:row-start-1`;

/**
 * The sections: the page grid's second row, across all three tracks, which
 * each section's row inherits — a grid of their own, whose rows the sections
 * in the flow take one each and a sticky section spans.
 */
const STICKY_SECTIONS = "2xl:col-span-full 2xl:row-start-2 2xl:grid 2xl:grid-cols-subgrid";

/**
 * The layer that holds a sticky section, by its side. Below `2xl` it is the
 * section's row as any section's is — its band, on a `card` background, and
 * nothing more. From `2xl` it is the card's gutter, spanning the sections'
 * rows (placed by the body), its band not drawn since the card carries its
 * own edge, starting and ending with the hero's and the last section's
 * spacing, 1rem outward to the window and half that toward the content so the
 * section's own padding adds up to the gap; drawn over a band crossing the
 * gutter. A left card is pushed to the gutter's inner edge, against the
 * content (`STICKY_RAIL`).
 */
const STICKY_LAYER: Record<LandingStickySide, string> = {
  left: "2xl:z-10 2xl:col-start-1 2xl:bg-transparent 2xl:px-4 2xl:py-24 2xl:pr-2",
  right: "2xl:z-10 2xl:col-start-3 2xl:bg-transparent 2xl:px-4 2xl:py-24 2xl:pl-2",
};

/**
 * A card's holder: pinned under the site header from `2xl` with the two-end
 * clamp (`min(header offset, viewport − its height − gap)`), so a card taller
 * than the window is still reachable to its last control. The height is the
 * one its own rail publishes on itself, so two cards each clamp by their own.
 */
const STICKY_RAIL: Record<LandingStickySide, string> = {
  left: "2xl:sticky 2xl:top-[min(calc(var(--header-height)+1.5rem),calc(100vh-var(--landing-rail-height)-1.5rem))] 2xl:ml-auto 2xl:w-[var(--landing-rail-width)]",
  right:
    "2xl:sticky 2xl:top-[min(calc(var(--header-height)+1.5rem),calc(100vh-var(--landing-rail-height)-1.5rem))] 2xl:w-[var(--landing-rail-width)]",
};

/**
 * Whether a section has anything to draw, as far as the server can know.
 *
 * - **A guide** the guide read did not answer, and **a testimonials section**
 *   none of whose testimonials the read answered, have nothing. Neither is
 *   ever deleted, so what produces it is a publish or an unpublish landing
 *   between the page's read and the read of what it places: the copy drawn
 *   then places what the live copy no longer does.
 * - **A products section** none of whose picks the listing holds — ended or
 *   unlisted — draws nothing (`landing-products-section.tsx`). When the
 *   listing read failed (`products` is null) the cards arrive with the
 *   client's own fetch, so the section stays and decides for itself.
 * - Every other section draws its words.
 */
function drawsSomething(
  section: LandingSection,
  read: {
    guides: ReadonlySet<string>;
    testimonials: Readonly<Record<string, PublicTestimonial>>;
    products: ProductRailPrefetch | null;
  },
): boolean {
  switch (section.type) {
    case "guide":
      return read.guides.has(section.guideId);
    case "testimonials":
      return section.testimonialIds.some((id) => Object.hasOwn(read.testimonials, id));
    case "products":
      return (
        read.products === null ||
        selectRailProducts(read.products.listing, {
          kind: "picks",
          productIds: section.productIds,
        }).length > 0
      );
    default:
      return true;
  }
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
 * **A sticky section is an ordinary section that from `2xl` is also its
 * gutter's sticky card**, drawn once, at its place in the structure, so its
 * heading is an H2 under the hero's H1 in reading order like every other
 * section's at every width. Below `2xl` it is drawn exactly as the same
 * section without `sticky`; from `2xl` the same element stands in the gutter
 * on its side beside the sections (the budget above), and its type's renderer
 * draws it as the card there.
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
  breadcrumb,
}: LandingPageBodyProps) {
  const guides = new Set(guideIds);
  // A section that would draw nothing is no part of the page, decided here,
  // before the layout, so a band's edge and the sections' rows follow what is
  // drawn: in the flow it would leave an empty band, and as a sticky section
  // an empty card's layer and a gutter held open for it.
  const shown = sections.filter((section) =>
    drawsSomething(section, { guides, testimonials, products }),
  );
  const stickies = landingStickySections(shown);
  // The structure rule allows one card a side, so two cards are one on each.
  const twoCards = stickies.length > 1;
  const context: LandingRenderContext = {
    locale,
    textLocale,
    pageId,
    preview,
    picture: (imageId) => {
      const { path, purpose } = landingCopyPicture(pictures, imageId);
      return { src: catalogueImageUrl(purpose, path), shape: landingPictureShapeOf(purpose) };
    },
    testimonial: (id) => (Object.hasOwn(testimonials, id) ? testimonials[id] : null),
    products,
    twoCards,
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
  // box. On a page with a sticky section every section in the flow has a row
  // of the sections' grid (`STICKY_ROW`, placed in the `row`th), the band
  // being that row on the card ground.
  const draw = (section: LandingSection, rowClass?: string, row?: number) => {
    const band = landingSectionBackground(section) === "card";
    if (rowClass === undefined && !band) {
      return <Fragment key={section.id}>{render(section)}</Fragment>;
    }
    return (
      <div
        key={section.id}
        className={cn(band && "bg-card", rowClass)}
        style={row === undefined ? undefined : { gridRow: row }}
      >
        {render(section)}
      </div>
    );
  };

  // exact-locale: marks text written in another language than the page with lang
  const lang = textLocale === locale ? undefined : textLocale;
  if (stickies.length === 0) {
    return (
      <>
        {breadcrumb}
        <div lang={lang}>{shown.map((section) => draw(section))}</div>
      </>
    );
  }
  const sides: StickySides = twoCards ? "both" : stickies[0].sticky;
  // The rows of the sections' grid from `2xl`: one for each section in the
  // flow, which a sticky section spans. Placements are inline because they are
  // counts; below `2xl` the sections are no grid, so they do nothing.
  const flowed = shown.filter((section) => section.sticky === undefined);
  const rowOf = new Map(flowed.map((section, index) => [section.id, index + 1]));
  // The breadcrumb is in the page's language, so `lang` marks the sections
  // rather than the grid holding them all.
  return (
    <div className={STICKY_PAGE[sides]}>
      {breadcrumb !== undefined && <div className={STICKY_BREADCRUMB}>{breadcrumb}</div>}
      <div lang={lang} className={STICKY_SECTIONS}>
        {shown.map((section) => {
          if (section.sticky === undefined) {
            return draw(section, STICKY_ROW, rowOf.get(section.id));
          }
          const band = landingSectionBackground(section) === "card";
          return (
            <div
              key={section.id}
              className={cn(band && "bg-card", STICKY_LAYER[section.sticky])}
              style={{ gridRow: `1 / span ${flowed.length}` }}
            >
              <LandingStickyRail className={STICKY_RAIL[section.sticky]}>
                {render(section)}
              </LandingStickyRail>
            </div>
          );
        })}
      </div>
    </div>
  );
}
