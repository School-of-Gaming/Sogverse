import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, ExternalLink, Mail } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  FeatureTestimonial,
  TestimonialPair,
  TestimonialRow,
  TestimonialShowcase,
  type ShownTestimonial,
} from "@/components/home/testimonial-arrangements";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { Markdown } from "@/components/ui/markdown";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import {
  landingPictureSize,
  type LandingPictureShape,
} from "@/lib/landing-pages/picture-shapes";
import type {
  ButtonTarget,
  LandingSectionOf,
  LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  productRailSeed,
  type ProductRailPrefetch,
} from "@/components/public/products/product-rail-selection";
import { buttonTargetHref } from "@/lib/links/button-target";
import { cn } from "@/lib/cn";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";
import { GuideDownload } from "./guide-download";
import { LANDING_ICON_GLYPHS } from "./landing-icons";
import { LandingProductsSection } from "./landing-products-section";
import {
  Eyebrow,
  hasSectionHeader,
  LANDING_CONTENT,
  LANDING_SECTION,
  LANDING_STICKY_ACTION,
  LANDING_STICKY_SECTION,
  LANDING_STICKY_WORDS,
  SectionHeader,
} from "./landing-section-header";
import {
  itemHeadingLevel,
  written,
  type LandingSectionByType,
  type LandingTextByType,
  type LandingTextOf,
} from "./landing-section-types";
import { LandingSubscribeForm } from "./landing-subscribe-form";
import { Heading } from "@sog/ui";

/*
 * **One renderer per section type**, in an exhaustive map, so a type added to
 * the registry fails type-check here until it is drawn.
 *
 * The sections are built from the app's own components in the treatments the
 * home and Roblox pages already use — the act eyebrow over a section heading,
 * the centred heading over a card grid, the act-filled step numbers, the FAQ
 * rows, the closing card with the world rule along its top, the shop's own
 * product cards in the Roblox page's carousel — so a landing page
 * reads as part of the same site whatever order an admin puts them in. A
 * renderer draws its section on whatever ground it is given and owns its own
 * container and vertical padding; the band a `card` section sits on is laid
 * by the page body around it, so cards and the closing card on a band are told
 * apart from it by their own border.
 *
 * **Every word is the admin's**, so the renderers paint what is written and
 * leave out what is not: a published version has every required word, and the
 * preview of one still being written shows its blanks as gaps rather than as
 * placeholder copy. The strings of our own are the screen reader's "opens in
 * a new tab" beside a button that leaves the site, a guide's download —
 * its button and the account a signed-out reader needs — and the email
 * sign-up form's fields, consent and answers, which are the same promise on
 * every page.
 */

/** What every renderer is handed besides its own section and words. */
export interface LandingRenderContext {
  /** The page's locale: what an own-site button's address is localised to. */
  locale: SupportedLocale;
  /** The language the shown version's words are in, which the body is marked with. */
  textLocale: SupportedLocale;
  /** The page's id: what an email sign-up names as where it came from. */
  pageId: string;
  /**
   * The admin's preview of a working copy, not the live page: an email
   * sign-up form is drawn but cannot be sent, since the page it would name
   * may not be live and a live one would sign a real address up.
   */
  preview: boolean;
  /**
   * A picture's servable URL and its shape by its catalogue entry id. The copy
   * carries every picture it names, so this throws for one it does not.
   */
  picture: (imageId: string) => ShownPicture;
  /**
   * A placed testimonial's current words by its id, or null when the read
   * answered none for it.
   */
  testimonial: (testimonialId: string) => PublicTestimonial | null;
  /**
   * The listing and seat counts, read on the server for every products
   * section of the page at once (`prefetchLandingProducts`), or null when the
   * page has none or the read failed — in which case a products section's
   * live query fetches for itself.
   */
  products: ProductRailPrefetch | null;
  /**
   * The page has a sticky card on each side, which narrows the sections'
   * measure from `2xl` — what a picture's `sizes` states.
   */
  twoCards: boolean;
}

/** A picture as a renderer draws it: where it is, and the shape its box is reserved at. */
export interface ShownPicture {
  src: string;
  shape: LandingPictureShape;
}

interface LandingSectionProps<Type extends LandingSectionType> {
  section: LandingSectionOf<Type>;
  text: LandingTextOf<Type>;
  context: LandingRenderContext;
}

/**
 * Each shape's frame. The stored size already gives the box its ratio; the
 * frame holds it too for an entry from before sizes were enforced, which is
 * cut to the frame rather than let its own shape move the layout.
 */
const PICTURE_FRAME: Record<LandingPictureShape, string> = {
  wide: "aspect-video",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
};

/**
 * A landing picture at its shape's stored size, through the image optimizer
 * with its box reserved, so nothing moves when it arrives. `sizes` is the CSS
 * width its column resolves to, stated by each caller.
 */
function LandingPicture({
  picture,
  alt,
  sizes,
  eager = false,
}: {
  picture: ShownPicture;
  alt: string | undefined;
  sizes: string;
  eager?: boolean;
}) {
  const { width, height } = landingPictureSize(picture.shape);
  return (
    <Image
      src={picture.src}
      alt={written(alt) ?? ""}
      width={width}
      height={height}
      sizes={sizes}
      priority={eager}
      className={cn("w-full rounded-lg object-cover", PICTURE_FRAME[picture.shape])}
    />
  );
}

/**
 * A section's button: an own-site target in the page's language, in the same
 * tab; another site's in a new one, saying so; an email address in the
 * reader's mail app, with the page's subject line when one is written. A plain
 * anchor rather than the wrapped `Link`, because the target is stored as a
 * path (`buttonTargetHref` localises it), not as a typed route — the shared
 * markdown renderer opens its own-site links the same way.
 */
function LandingButton({
  target,
  label,
  subject,
  context,
  className,
}: {
  target: ButtonTarget;
  label: string;
  /** The email's subject line in this language, for an email target. */
  subject: string | undefined;
  context: Pick<LandingRenderContext, "locale" | "textLocale">;
  className?: string;
}) {
  const t = useTranslations("richText");
  const classes = buttonVariants({ size: "lg", className: cn("gap-2", className) });
  const href = buttonTargetHref(target, context.locale, { subject });
  switch (target.kind) {
    case "external":
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {label}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only" lang={pageLang(context)}>
            {t("opensInNewTab")}
          </span>
        </a>
      );
    case "email":
      return (
        <a href={href} className={classes}>
          {label}
          <Mail aria-hidden="true" className="h-4 w-4" />
        </a>
      );
    case "internal":
      return (
        <a href={href} className={classes}>
          {label}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </a>
      );
  }
}

/**
 * **A sticky section's card frame, from `2xl`** — the one frame every type
 * that may be sticky is drawn in there, so the cards beside a page read as one
 * family: the closing card's world rule along its top, the card's own padding,
 * the words start-aligned under a heading a step down
 * (`LANDING_STICKY_WORDS`), and the action the card's full width. In the
 * page's gutter it is an object standing on the page beside the sections
 * rather than one of them, so it carries its own edge. The call to action is
 * a card in the flow already, so it restyles its own card rather than take
 * this one, since a card does not contain a card.
 *
 * **Below `2xl` the frame is not there at all**: the card and its content are
 * `display: contents`, so they draw no box and the section's own children are
 * laid out as they are on a section that is not sticky, and the world rule is
 * hidden. On a section that is not sticky it is nothing but its children.
 */
function StickyFrame({ sticky, children }: { sticky: boolean; children: ReactNode }) {
  if (!sticky) return children;
  return (
    <Card data-sticky-card className="relative overflow-hidden max-2xl:contents">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-world max-2xl:hidden" />
      <CardContent className="pt-8 max-2xl:contents">{children}</CardContent>
    </Card>
  );
}

/**
 * The CSS width of a picture across a sticky card from `2xl`, the card's
 * 20rem, ahead of the `sizes` it has in the flow below that.
 */
function stickyCardSizes(flowSizes: string): string {
  return `(min-width: 1536px) 20rem, ${flowSizes}`;
}

/**
 * The `lang` for words in the page's own language — ours, the store's, the
 * shop's — inside a body marked with the version's: the page's locale where
 * the two differ, else nothing, since the document already says it.
 */
function pageLang(context: Pick<LandingRenderContext, "locale" | "textLocale">) {
  // exact-locale: resets the body's language mark for words in the page's language
  return context.textLocale === context.locale ? undefined : context.locale;
}

/**
 * The `lang` for the version's words set inside a part reset to the page's
 * (`pageLang`): the version's language where the two differ, else nothing.
 */
function textLang(context: Pick<LandingRenderContext, "locale" | "textLocale">) {
  // exact-locale: marks the version's words inside a part in the page's language
  return context.textLocale === context.locale ? undefined : context.textLocale;
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

/**
 * The page's opening and its only H1, drawn the way the home hero is: the
 * headline in ink over one world rule that runs its measure, the line under
 * it, one act button. Centred alone; with a picture, the words and the picture
 * share the width from `lg`, the words first on a phone so the headline and the
 * button are what the first screen shows.
 */
function HeroSection({ section, text, context }: LandingSectionProps<"hero">) {
  const picture = section.imageId === undefined ? null : context.picture(section.imageId);
  const eyebrow = written(text.eyebrow);
  const subline = written(text.subline);
  const buttonLabel = written(text.buttonLabel);
  return (
    <section className={cn(LANDING_CONTENT, "pb-16 pt-8 sm:py-24")}>
      <div
        className={cn(
          "mx-auto",
          picture === null
            ? "max-w-3xl text-center"
            : "grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16",
        )}
      >
        <div className={cn(picture !== null && "text-center lg:text-left")}>
          {eyebrow !== null && (
            <div className="mb-4">
              <Eyebrow>{eyebrow}</Eyebrow>
            </div>
          )}
          {/* Shrink-to-fit, so the rule runs the headline's own measure. */}
          <div className="inline-block">
            {/* The heading changes alignment at `md`, but this hero's columns
                split at `lg`, so between 768 and 1023px the headline sits
                start-aligned over centred words. Accepted until the
                landing-page design is settled. */}
            <Heading
              level={1}
              step="hero"
              align={picture === null ? "center" : "center-narrow"}
            >
              {text.headline}
            </Heading>
            <span className="mt-5 block h-1.5 w-full rounded-full bg-world sm:mt-8" />
          </div>
          {subline !== null && (
            <p className="mt-5 text-lg leading-8 text-muted-foreground sm:mt-6 sm:text-xl">
              {subline}
            </p>
          )}
          {section.button !== undefined && buttonLabel !== null && (
            <div
              className={cn(
                "mt-8 flex justify-center sm:mt-10",
                picture !== null && "lg:justify-start",
              )}
            >
              <LandingButton
                target={section.button}
                label={buttonLabel}
                subject={text.emailSubject}
                context={context}
              />
            </div>
          )}
        </div>
        {picture !== null && (
          <LandingPicture
            picture={picture}
            alt={text.imageAlt}
            sizes={halfColumnSizes(HALF_COLUMN_PX, context.twoCards)}
            eager
          />
        )}
      </div>
    </section>
  );
}

/**
 * Where a page with a sticky card on each side narrows the sections' measure:
 * from `2xl` both gutters hold their 344px floor, so the content box is the
 * viewport less 720px (the two floors and the section's 1rem padding either
 * side) until it reaches its full 1152px at 1872 (the page body's width
 * budget). One card leaves the full measure from `2xl` on — its opposite
 * gutter gives way first — so only two narrow it.
 */
const TWO_CARDS_FROM = 1536;
const TWO_CARDS_TAKE = 720;

/**
 * A `sizes` whose picture, between two sticky cards, is `calc(<vw>vw - <px>px)`
 * until it reaches `fixedPx`, prepended to the page's own `sizes` — which
 * holds below `2xl`. Nothing changes where the picture is already at its fixed
 * width by `2xl`.
 */
function betweenTwoCards(
  sizes: string,
  fixedPx: number,
  fluid: { vw: number; px: number },
): string {
  const fixedFrom = Math.ceil((fixedPx + fluid.px) / (fluid.vw / 100));
  if (fixedFrom <= TWO_CARDS_FROM) return sizes;
  return [
    `(min-width: ${fixedFrom}px) ${fixedPx}px`,
    `(min-width: ${TWO_CARDS_FROM}px) calc(${css(fluid.vw, "vw")} - ${Number(fluid.px.toFixed(3))}px)`,
    sizes,
  ].join(", ");
}

/**
 * The CSS width of a picture in one of the two columns words and a picture
 * share from `lg` (their gap 4rem), held to `maxPx` within it when it is
 * narrower than the column: the column's 544px at the full measure.
 */
function halfColumnSizes(maxPx: number, twoCards: boolean): string {
  const sizes =
    maxPx === HALF_COLUMN_PX
      ? `(min-width: 1152px) ${HALF_COLUMN_PX}px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)`
      : `(min-width: ${maxPx + 32}px) ${maxPx}px, calc(100vw - 2rem)`;
  return twoCards
    ? betweenTwoCards(sizes, maxPx, { vw: 50, px: (TWO_CARDS_TAKE + 64) / 2 })
    : sizes;
}

/** One of the two columns at the full 1152px measure: (1152 − 64) / 2. */
const HALF_COLUMN_PX = 544;

/**
 * How a text section's picture is drawn beside the words, by its shape: a
 * wide one fills its column; a square or a portrait one is held narrower and
 * centred in it, so it stands about as tall as a few paragraphs rather than
 * towering over them, and does not fill a phone's whole screen either.
 */
const BESIDE_WORDS: Record<LandingPictureShape, { width: string; widthPx: number }> = {
  wide: { width: "", widthPx: HALF_COLUMN_PX },
  square: { width: "max-w-md", widthPx: 448 },
  portrait: { width: "max-w-sm", widthPx: 384 },
};

/**
 * A heading over authored prose, in the reading column alone or beside a
 * picture from `lg`, on the side the admin chose. On a phone the picture
 * follows the words whichever side it takes.
 */
function TextSection({ section, text, context }: LandingSectionProps<"text">) {
  const picture = section.imageId === undefined ? null : context.picture(section.imageId);
  const body = written(text.body);
  return (
    <section className={LANDING_SECTION}>
      <div
        className={cn(
          "mx-auto",
          picture === null
            ? "max-w-3xl"
            : "grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16",
        )}
      >
        <div>
          <SectionHeader eyebrow={text.eyebrow} heading={text.heading} centred={false} />
          {body !== null && (
            <Markdown variant="landing" className="mt-6">
              {body}
            </Markdown>
          )}
        </div>
        {picture !== null && (
          <div
            className={cn(
              "mx-auto w-full",
              BESIDE_WORDS[picture.shape].width,
              section.imageSide === "start" && "lg:order-first",
            )}
          >
            <LandingPicture
              picture={picture}
              alt={text.imageAlt}
              sizes={halfColumnSizes(BESIDE_WORDS[picture.shape].widthPx, context.twoCards)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * One way of laying out an image section's pictures: the figure's width, as
 * its class and in px, and from which viewport width how many columns it
 * has — one below the first step.
 */
interface PictureGrid {
  width: string;
  widthPx: number;
  columns: string;
  steps: readonly { from: number; columns: number }[];
}

const SM = 640;
const LG = 1024;

/**
 * The picture grid by the pictures' shape and how many there are. Wide
 * pictures take the page's measure: one across it, two or four in pairs,
 * three in a row. Square and portrait pictures are taller for their width, so
 * each count is held narrower — one alone sits at about the height a wide
 * one would, two make a pair rather than two towers — and four go four across
 * from `lg`, a single row. All stack on a phone.
 */
const PICTURE_GRIDS: Record<LandingPictureShape, Record<1 | 2 | 3 | 4, PictureGrid>> = {
  wide: {
    1: { width: "max-w-4xl", widthPx: 896, columns: "", steps: [] },
    2: { width: "max-w-5xl", widthPx: 1024, columns: "sm:grid-cols-2", steps: [{ from: SM, columns: 2 }] },
    3: { width: "max-w-6xl", widthPx: 1152, columns: "sm:grid-cols-3", steps: [{ from: SM, columns: 3 }] },
    4: { width: "max-w-5xl", widthPx: 1024, columns: "sm:grid-cols-2", steps: [{ from: SM, columns: 2 }] },
  },
  square: {
    1: { width: "max-w-xl", widthPx: 576, columns: "", steps: [] },
    2: { width: "max-w-4xl", widthPx: 896, columns: "sm:grid-cols-2", steps: [{ from: SM, columns: 2 }] },
    3: { width: "max-w-5xl", widthPx: 1024, columns: "sm:grid-cols-3", steps: [{ from: SM, columns: 3 }] },
    4: {
      width: "max-w-6xl",
      widthPx: 1152,
      columns: "sm:grid-cols-2 lg:grid-cols-4",
      steps: [{ from: SM, columns: 2 }, { from: LG, columns: 4 }],
    },
  },
  portrait: {
    1: { width: "max-w-md", widthPx: 448, columns: "", steps: [] },
    2: { width: "max-w-3xl", widthPx: 768, columns: "sm:grid-cols-2", steps: [{ from: SM, columns: 2 }] },
    3: { width: "max-w-5xl", widthPx: 1024, columns: "sm:grid-cols-3", steps: [{ from: SM, columns: 3 }] },
    4: {
      width: "max-w-6xl",
      widthPx: 1152,
      columns: "sm:grid-cols-2 lg:grid-cols-4",
      steps: [{ from: SM, columns: 2 }, { from: LG, columns: 4 }],
    },
  },
};

/** A figure in `rem` or `vw`, to three places at most. */
function css(value: number, unit: "rem" | "vw"): string {
  return `${Number(value.toFixed(3))}${unit}`;
}

/**
 * The CSS width each picture of a grid resolves to, as `sizes` states it: the
 * page's 1rem gutters either side and the grid's 1rem gaps taken out of the
 * viewport, until the figure reaches its own width and each picture stops
 * growing — and, between two sticky cards, the cards' gutters taken out too
 * from `2xl` (`betweenTwoCards`), where every grid has its most columns.
 */
function pictureGridSizes(
  grid: Pick<PictureGrid, "widthPx" | "steps">,
  twoCards: boolean,
): string {
  const gutters = 2;
  const widest = grid.steps.at(-1)?.columns ?? 1;
  const fixed = Math.round((grid.widthPx - (widest - 1) * 16) / widest);
  const fluid = [...grid.steps]
    .reverse()
    .map(
      ({ from, columns }) =>
        `(min-width: ${from}px) calc(${css(100 / columns, "vw")} - ${css((gutters + columns - 1) / columns, "rem")})`,
    );
  const sizes = [
    `(min-width: ${grid.widthPx + gutters * 16}px) ${fixed}px`,
    ...fluid,
    `calc(100vw - ${gutters}rem)`,
  ].join(", ");
  return twoCards
    ? betweenTwoCards(sizes, fixed, {
        vw: 100 / widest,
        px: (TWO_CARDS_TAKE + (widest - 1) * 16) / widest,
      })
    : sizes;
}

/** The grid of `count` pictures of one shape. */
function pictureGrid(shape: LandingPictureShape, count: number): PictureGrid {
  return PICTURE_GRIDS[shape][count === 1 || count === 2 || count === 3 ? count : 4];
}

/**
 * One to four pictures of one shape, with an optional heading and caption. A
 * picture removed from the catalogue is unlinked from the section, and a
 * section left with none is dropped, so there is always one to draw. The
 * database keeps a section's pictures one shape, so the first one's is the
 * grid's.
 */
function ImageSection({ section, text, context }: LandingSectionProps<"image">) {
  const pictures = section.images.map((image) => ({
    id: image.id,
    picture: context.picture(image.imageId),
    alt: text.alts?.[image.id],
  }));
  const grid = pictureGrid(pictures[0].picture.shape, pictures.length);
  const sizes = pictureGridSizes(grid, context.twoCards);
  const caption = written(text.caption);
  const hasHeader = hasSectionHeader({ eyebrow: text.eyebrow, heading: text.heading });
  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={text.eyebrow} heading={text.heading} />
      <figure className={cn("mx-auto", grid.width, hasHeader && "mt-12")}>
        <div className={cn("grid gap-4", grid.columns)}>
          {pictures.map(({ id, picture, alt }) => (
            <LandingPicture key={id} picture={picture} alt={alt} sizes={sizes} />
          ))}
        </div>
        {caption !== null && (
          <figcaption className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
            {caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}

/**
 * Two to six points as the home page's feature cards: the glyph tile with an
 * act edge, a title, a short body. Pairs on a tablet; three across from `lg`
 * when three, five or six make a row of three the better fit.
 */
function PointsSection({ section, text }: LandingSectionProps<"points">) {
  const threeAcross = section.items.length % 3 === 0 || section.items.length === 5;
  const titleLevel = itemHeadingLevel(text.heading);
  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={text.eyebrow} heading={text.heading} intro={text.intro} />
      <div
        className={cn(
          "mx-auto mt-12 grid gap-6 sm:grid-cols-2 lg:mt-16",
          threeAcross ? "max-w-6xl lg:grid-cols-3" : "max-w-5xl",
        )}
      >
        {section.items.map((item) => {
          const words = text.items?.[item.id];
          const Icon = LANDING_ICON_GLYPHS[item.icon];
          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-act bg-lifted">
                    <Icon aria-hidden="true" className="h-5 w-5 text-act" />
                  </div>
                  <Heading level={titleLevel} step="card-title">{words?.title}</Heading>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">{words?.body}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/** Each step's width in the wrapped row, by how many steps there are. */
function stepWidth(count: number): string {
  switch (count) {
    case 2:
      return "sm:w-[calc(50%-1rem)]";
    case 4:
      return "sm:w-[calc(50%-1rem)] lg:w-[calc(25%-1.5rem)]";
    default:
      return "sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.334rem)]";
  }
}

/**
 * Two to six steps as the how-it-works rows: an act-filled number over a
 * title and a body, centred. A wrapped row rather than a grid, so a step left
 * alone on the last row sits in the middle rather than at the left edge.
 */
function StepsSection({ section, text }: LandingSectionProps<"steps">) {
  const width = stepWidth(section.items.length);
  const titleLevel = itemHeadingLevel(text.heading);
  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={text.eyebrow} heading={text.heading} intro={text.intro} />
      <ol
        className={cn(
          "mx-auto mt-12 flex flex-wrap justify-center gap-x-8 gap-y-12 lg:mt-16",
          section.items.length === 2 ? "max-w-3xl" : "max-w-5xl",
        )}
      >
        {section.items.map((item, index) => {
          const words = text.items?.[item.id];
          return (
            <li key={item.id} className={cn("w-full text-center", width)}>
              <div
                aria-hidden="true"
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-act text-xl font-bold text-act-foreground"
              >
                {index + 1}
              </div>
              <div className="mt-4">
                <Heading level={titleLevel} step="card-title" align="center">
                  {words?.title}
                </Heading>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{words?.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Testimonials from the store, in the arrangement the admin chose, laid out
 * exactly as the home page and About lay theirs — through the same shared
 * arrangements — under the section's optional header.
 *
 * Each quote is the store's current words, in the version the reader fallback
 * picks for the page's locale. Those words are the testimonial's rather than
 * the version's, so the arrangement is marked with the page's language
 * wherever the version shown is in another, and a quote in another language
 * than the page's is marked with its own. A testimonial the read did not
 * answer leaves its slot out; the page body leaves out a section with none
 * answered, so one drawn here has at least one quote.
 */
function TestimonialsSection({ section, text, context }: LandingSectionProps<"testimonials">) {
  const pick = (ids: readonly string[]): ShownTestimonial[] =>
    ids.flatMap((id) => {
      const testimonial = context.testimonial(id);
      if (testimonial === null) return [];
      const version = resolveRequiredTranslation(testimonial.versions, context.locale);
      return [
        {
          key: id,
          quote: version.quote,
          attribution: version.from,
          // exact-locale: marking a quote shown in another language than the page's
          lang: version.locale === context.locale ? undefined : version.locale,
        },
      ];
    });
  const shown = pick(section.testimonialIds);
  const afterHeader =
    written(text.eyebrow) !== null || written(text.heading) !== null || written(text.intro) !== null;
  const placement = cn(afterHeader && "mt-12 lg:mt-16");

  const arrangement = (() => {
    switch (section.arrangement) {
      case "feature":
        return <FeatureTestimonial testimonial={shown[0]} className={placement} />;
      case "pair":
        return <TestimonialPair testimonials={shown} className={placement} />;
      case "row":
        return <TestimonialRow testimonials={shown} className={placement} />;
      case "showcase":
        // The slots by position, so a quote the read left out never moves
        // another into its group.
        return (
          <TestimonialShowcase
            afterHeading={afterHeader}
            groups={{
              feature: pick(section.testimonialIds.slice(0, 1)),
              pair: pick(section.testimonialIds.slice(1, 3)),
              row: pick(section.testimonialIds.slice(3, 6)),
            }}
          />
        );
    }
  })();

  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={text.eyebrow} heading={text.heading} intro={text.intro} />
      {/* The store's own words, not the version's. */}
      <div lang={pageLang(context)}>{arrangement}</div>
    </section>
  );
}

/**
 * The admin's picked products as the shop's own cards in the shared product
 * rail, drawn by a client component that keeps them live
 * (`landing-products-section.tsx`, which says what is drawn and when). The
 * page's prefetch is narrowed here to this section's picks. The cards are the
 * shop's, in the page's language, so the rail resets the body's mark.
 */
function ProductsSection({ section, text, context }: LandingSectionProps<"products">) {
  return (
    <LandingProductsSection
      productIds={section.productIds}
      eyebrow={text.eyebrow}
      heading={text.heading}
      intro={text.intro}
      railLang={pageLang(context)}
      seed={productRailSeed(context.products, {
        kind: "picks",
        productIds: section.productIds,
      })}
    />
  );
}

/**
 * Questions and answers in the site's FAQ rows, the answers authored markdown
 * set in the quiet ink the rows give an answer. A question not yet written is
 * left out, since a row is opened by its question.
 */
function FaqSection({ section, text }: LandingSectionProps<"faq">) {
  const items = section.items.flatMap((item) => {
    const words = text.items?.[item.id];
    const question = written(words?.question);
    if (question === null) return [];
    const answer = written(words?.answer);
    return [
      {
        key: item.id,
        question,
        answer:
          answer === null ? null : (
            <Markdown variant="landing-faq" emphasis="quiet">
              {answer}
            </Markdown>
          ),
      },
    ];
  });
  return (
    <section className={LANDING_SECTION}>
      <div className="mx-auto max-w-3xl">
        <SectionHeader eyebrow={text.eyebrow} heading={text.heading} />
        <div className="mt-12">
          <FaqAccordion items={items} questionLevel={itemHeadingLevel(text.heading)} />
        </div>
      </div>
    </section>
  );
}

/**
 * The closing call to action, as the home and Roblox pages close: the plain
 * card with one world rule along its top edge, a heading, a line, one button.
 * As a sticky section it is the same card, and from `2xl` the sticky card: the
 * words start-aligned under the card's heading, the button the card's width.
 */
function CtaSection({ section, text, context }: LandingSectionProps<"cta">) {
  const sticky = section.sticky !== undefined;
  const eyebrow = written(text.eyebrow);
  const body = written(text.body);
  const buttonLabel = written(text.buttonLabel);
  return (
    <section className={cn(LANDING_SECTION, sticky && LANDING_STICKY_SECTION)}>
      <Card
        data-sticky-card={sticky || undefined}
        className="relative mx-auto max-w-3xl overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
        <CardContent
          className={cn(
            "flex flex-col items-center py-12 text-center",
            sticky && ["2xl:items-stretch 2xl:pb-6 2xl:pt-8", LANDING_STICKY_WORDS],
          )}
        >
          {eyebrow !== null && (
            <div className="mb-4">
              <Eyebrow>{eyebrow}</Eyebrow>
            </div>
          )}
          <Heading level={2} step="display" align="center">
            {text.heading}
          </Heading>
          {body !== null && <p className="mt-4 max-w-xl text-muted-foreground">{body}</p>}
          {buttonLabel !== null && (
            <LandingButton
              target={section.button}
              label={buttonLabel}
              subject={text.emailSubject}
              context={context}
              className={cn("mt-8", sticky && ["2xl:mt-6", LANDING_STICKY_ACTION])}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * A guide to download: the section's header and line over the download, laid
 * out like the hero — centred alone; with a cover picture, the words beside it
 * from `lg`, start-aligned there and centred on a phone, the picture after
 * them.
 *
 * As a sticky section it is the same section, and from `2xl` the sticky card:
 * the cover picture across its top, the header and line under it, the
 * download the card's full width.
 *
 * The page body leaves out a guide the read did not answer, so one drawn here
 * has a file, and the download route picks the reader's by the reader
 * fallback. Whether the reader may download is decided in the browser
 * (`guide-download.tsx`); everything here is the same for every reader.
 */
function GuideSection({ section, text, context }: LandingSectionProps<"guide">) {
  const sticky = section.sticky !== undefined;
  const picture = section.imageId === undefined ? null : context.picture(section.imageId);
  const eyebrow = written(text.eyebrow);
  const heading = written(text.heading);
  const description = written(text.description);
  const ownLang = pageLang(context);
  // A sticky guide is in the flow only below `2xl`, where the page's measure
  // is never narrowed for a card; from there it is the card's 20rem.
  const cover =
    picture === null ? null : (
      <LandingPicture
        picture={picture}
        alt={text.imageAlt}
        sizes={
          sticky
            ? stickyCardSizes(halfColumnSizes(HALF_COLUMN_PX, false))
            : halfColumnSizes(HALF_COLUMN_PX, context.twoCards)
        }
      />
    );
  return (
    <section className={cn(LANDING_SECTION, sticky && LANDING_STICKY_SECTION)}>
      <StickyFrame sticky={sticky}>
        <div
          className={cn(
            "mx-auto",
            picture === null
              ? "max-w-3xl text-center"
              : "grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16",
            sticky && picture !== null && "2xl:grid-cols-1 2xl:gap-6",
          )}
        >
          <div
            className={cn(
              picture !== null && "text-center lg:text-left",
              sticky && LANDING_STICKY_WORDS,
            )}
          >
            {eyebrow !== null && <Eyebrow>{eyebrow}</Eyebrow>}
            {heading !== null && (
              <div className={cn(eyebrow !== null && "mt-4")}>
                {/* As in the hero, the heading turns start-aligned at `md` while
                    the columns split at `lg`. */}
                <Heading
                  level={2}
                  step="display"
                  align={picture === null ? "center" : "center-narrow"}
                >
                  {heading}
                </Heading>
              </div>
            )}
            {description !== null && (
              <p
                className={cn(
                  "mt-4 text-lg leading-8 text-muted-foreground",
                  // The card's line is body text, as its header's intro.
                  sticky && "2xl:text-base 2xl:leading-normal",
                )}
              >
                {description}
              </p>
            )}
            <div lang={ownLang}>
              <GuideDownload
                guideId={section.guideId}
                locale={context.locale}
                placement={picture === null ? "centred" : "beside-picture"}
                sticky={sticky}
              />
            </div>
          </div>
          {/* After the words in the flow; across the card's top from `2xl`. */}
          {cover !== null && sticky ? <div className="2xl:order-first">{cover}</div> : cover}
        </div>
      </StickyFrame>
    </section>
  );
}

/**
 * An email sign-up: the heading and intro the page wrote over the site's own
 * form, in the reading column. As a sticky section it is the same section, and
 * from `2xl` the sticky card: the form's names stacked and its button the
 * card's full width.
 */
function SubscribeSection({ section, text, context }: LandingSectionProps<"subscribe">) {
  const sticky = section.sticky !== undefined;
  return (
    <section className={cn(LANDING_SECTION, sticky && LANDING_STICKY_SECTION)}>
      <StickyFrame sticky={sticky}>
        <div className="mx-auto max-w-xl">
          <SectionHeader
            eyebrow={text.eyebrow}
            heading={text.heading}
            intro={text.intro}
            sticky={sticky}
          />
          {/* The form's own words are the page's; only its button label is the version's. */}
          <div lang={pageLang(context)} className={cn("mt-10", sticky && "2xl:mt-6")}>
            <LandingSubscribeForm
              pageId={context.pageId}
              sectionId={section.id}
              locale={context.locale}
              buttonLabel={written(text.buttonLabel) ?? ""}
              buttonLabelLang={textLang(context)}
              preview={context.preview}
              sticky={sticky}
            />
          </div>
        </div>
      </StickyFrame>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export const LANDING_SECTION_RENDERERS: {
  [Type in LandingSectionType]: (props: LandingSectionProps<Type>) => ReactNode;
} = {
  hero: HeroSection,
  text: TextSection,
  image: ImageSection,
  points: PointsSection,
  steps: StepsSection,
  testimonials: TestimonialsSection,
  products: ProductsSection,
  guide: GuideSection,
  faq: FaqSection,
  subscribe: SubscribeSection,
  cta: CtaSection,
};

/**
 * Draw one section through its type's renderer. The section's `type` is
 * passed beside it so the map's entry and the section are correlated without
 * a cast; a caller hands over a stored section and its words as they are.
 */
export function renderLandingSection<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionByType[Type],
  text: LandingTextByType[Type],
  context: LandingRenderContext,
): ReactNode {
  const Renderer: (props: LandingSectionProps<Type>) => ReactNode =
    LANDING_SECTION_RENDERERS[type];
  return <Renderer section={section} text={text} context={context} />;
}
