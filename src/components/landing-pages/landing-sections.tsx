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
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
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
import { Eyebrow, hasSectionHeader, LANDING_SECTION, SectionHeader } from "./landing-section-header";
import {
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
 * reads as part of the same site whatever order an admin puts them in. Every
 * section sits on the plain page ground: an admin chooses the order, and a
 * tinted band beside another tinted band reads as one section with a stray
 * heading in it, so no band is spent at all.
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
   * A picture's servable URL by its catalogue entry id, or null when the copy
   * names no path for it (the picture has left the catalogue).
   */
  imageSrc: (imageId: string) => string | null;
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
  /** Whether the read answered the placed guide with this id. */
  hasGuide: (guideId: string) => boolean;
}

interface LandingSectionProps<Type extends LandingSectionType> {
  section: LandingSectionOf<Type>;
  text: LandingTextOf<Type>;
  context: LandingRenderContext;
}

/** A landing picture's stored size: `next/image` reserves its box from it. */
const PICTURE = CATALOGUE_IMAGE_PURPOSES.landing_image;

/**
 * A landing picture at its stored 16:9, through the image optimizer with its
 * box reserved, so nothing moves when it arrives. `sizes` is the CSS width its
 * column resolves to, stated by each caller.
 */
function LandingPicture({
  src,
  alt,
  sizes,
  eager = false,
}: {
  src: string;
  alt: string | undefined;
  sizes: string;
  eager?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={written(alt) ?? ""}
      width={PICTURE.width}
      height={PICTURE.height}
      sizes={sizes}
      priority={eager}
      className="aspect-video w-full rounded-lg object-cover"
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
  locale,
  className,
}: {
  target: ButtonTarget;
  label: string;
  /** The email's subject line in this language, for an email target. */
  subject: string | undefined;
  locale: SupportedLocale;
  className?: string;
}) {
  const t = useTranslations("richText");
  const classes = buttonVariants({ size: "lg", className: cn("gap-2", className) });
  const href = buttonTargetHref(target, locale, { subject });
  switch (target.kind) {
    case "external":
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
          {label}
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">{t("opensInNewTab")}</span>
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
  const src = section.imageId === undefined ? null : context.imageSrc(section.imageId);
  const eyebrow = written(text.eyebrow);
  const subline = written(text.subline);
  const buttonLabel = written(text.buttonLabel);
  return (
    <section className="container mx-auto px-4 pb-16 pt-8 sm:py-24">
      <div
        className={cn(
          "mx-auto",
          src === null
            ? "max-w-3xl text-center"
            : "grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16",
        )}
      >
        <div className={cn(src !== null && "text-center lg:text-left")}>
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
              align={src === null ? "center" : "center-narrow"}
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
                src !== null && "lg:justify-start",
              )}
            >
              <LandingButton
                target={section.button}
                label={buttonLabel}
                subject={text.emailSubject}
                locale={context.locale}
              />
            </div>
          )}
        </div>
        {src !== null && (
          <LandingPicture
            src={src}
            alt={text.imageAlt}
            sizes="(min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)"
            eager
          />
        )}
      </div>
    </section>
  );
}

/**
 * A heading over authored prose, in the reading column alone or beside a
 * picture from `lg`, on the side the admin chose. On a phone the picture
 * follows the words whichever side it takes.
 */
function TextSection({ section, text, context }: LandingSectionProps<"text">) {
  const src = section.imageId === undefined ? null : context.imageSrc(section.imageId);
  const body = written(text.body);
  return (
    <section className={LANDING_SECTION}>
      <div
        className={cn(
          "mx-auto",
          src === null
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
        {src !== null && (
          <div className={cn(section.imageSide === "start" && "lg:order-first")}>
            <LandingPicture
              src={src}
              alt={text.imageAlt}
              sizes="(min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The picture grid by how many pictures there are: its width, its columns and
 * each picture's CSS width — one across the column, two or four in pairs,
 * three in a row, all stacked on a phone.
 */
function pictureGrid(count: number): { width: string; columns: string; sizes: string } {
  switch (count) {
    case 1:
      return {
        width: "max-w-4xl",
        columns: "",
        sizes: "(min-width: 928px) 896px, calc(100vw - 2rem)",
      };
    case 3:
      return {
        width: "max-w-6xl",
        columns: "sm:grid-cols-3",
        sizes: "(min-width: 1184px) 368px, (min-width: 640px) calc(33vw - 1.5rem), calc(100vw - 2rem)",
      };
    default:
      return {
        width: "max-w-5xl",
        columns: "sm:grid-cols-2",
        sizes: "(min-width: 1056px) 504px, (min-width: 640px) calc(50vw - 1.5rem), calc(100vw - 2rem)",
      };
  }
}

/**
 * One to four pictures with an optional heading and caption. A picture that
 * has left the catalogue is not drawn.
 */
function ImageSection({ section, text, context }: LandingSectionProps<"image">) {
  const pictures = section.images.flatMap((image) => {
    const src = context.imageSrc(image.imageId);
    return src === null ? [] : [{ id: image.id, src, alt: text.alts?.[image.id] }];
  });
  if (pictures.length === 0) return null;
  const grid = pictureGrid(pictures.length);
  const caption = written(text.caption);
  const hasHeader = hasSectionHeader({ eyebrow: text.eyebrow, heading: text.heading });
  return (
    <section className={LANDING_SECTION}>
      <SectionHeader eyebrow={text.eyebrow} heading={text.heading} />
      <figure className={cn("mx-auto", grid.width, hasHeader && "mt-12")}>
        <div className={cn("grid gap-4", grid.columns)}>
          {pictures.map((picture) => (
            <LandingPicture
              key={picture.id}
              src={picture.src}
              alt={picture.alt}
              sizes={grid.sizes}
            />
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
                  <Heading level={3} step="card-title">{words?.title}</Heading>
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
                <Heading level={3} step="card-title" align="center">
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
 * answer leaves its slot out, and a section with none to show is not drawn at
 * all.
 */
function TestimonialsSection({ section, text, context }: LandingSectionProps<"testimonials">) {
  const pick = (ids: readonly string[]): ShownTestimonial[] =>
    ids.flatMap((id) => {
      const testimonial = context.testimonial(id);
      const version =
        testimonial === null ? null : resolveTranslation(testimonial.versions, context.locale);
      if (version === null) return [];
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
  if (shown.length === 0) return null;
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
      {/* exact-locale: resets the body's language mark for the store's own words */}
      <div lang={context.textLocale === context.locale ? undefined : context.locale}>
        {arrangement}
      </div>
    </section>
  );
}

/**
 * The admin's picked products as the shop's own cards in the shared product
 * rail, drawn by a client component that keeps them live
 * (`landing-products-section.tsx`, which says what is drawn and when). The
 * page's prefetch is narrowed here to this section's picks.
 */
function ProductsSection({ section, text, context }: LandingSectionProps<"products">) {
  return (
    <LandingProductsSection
      productIds={section.productIds}
      eyebrow={text.eyebrow}
      heading={text.heading}
      intro={text.intro}
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
          {/* The questions sit under the section's H2, or stand as H2s where
              the section has no heading written yet. */}
          <FaqAccordion
            items={items}
            questionLevel={written(text.heading) === null ? 2 : 3}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The closing call to action, as the home and Roblox pages close: the plain
 * card with one world rule along its top edge, a heading, a line, one button.
 */
function CtaSection({ section, text, context }: LandingSectionProps<"cta">) {
  const eyebrow = written(text.eyebrow);
  const body = written(text.body);
  const buttonLabel = written(text.buttonLabel);
  return (
    <section className={LANDING_SECTION}>
      <Card className="relative mx-auto max-w-3xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
        <CardContent className="flex flex-col items-center py-12 text-center">
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
              locale={context.locale}
              className="mt-8"
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
 * A guide the read did not answer leaves the section out, since there is
 * nothing to offer; one it answered has a file, and the download route picks
 * the reader's by the reader fallback. Whether the reader may download is
 * decided in the browser (`guide-download.tsx`); everything here is the same
 * for every reader.
 */
function GuideSection({ section, text, context }: LandingSectionProps<"guide">) {
  if (!context.hasGuide(section.guideId)) return null;
  const src = section.imageId === undefined ? null : context.imageSrc(section.imageId);
  const eyebrow = written(text.eyebrow);
  const heading = written(text.heading);
  const description = written(text.description);
  return (
    <section className={LANDING_SECTION}>
      <div
        className={cn(
          "mx-auto",
          src === null
            ? "max-w-3xl text-center"
            : "grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16",
        )}
      >
        <div className={cn(src !== null && "text-center lg:text-left")}>
          {eyebrow !== null && <Eyebrow>{eyebrow}</Eyebrow>}
          {heading !== null && (
            <div className={cn(eyebrow !== null && "mt-4")}>
              {/* As in the hero, the heading turns start-aligned at `md` while
                  the columns split at `lg`. */}
              <Heading
                level={2}
                step="display"
                align={src === null ? "center" : "center-narrow"}
              >
                {heading}
              </Heading>
            </div>
          )}
          {description !== null && (
            <p className="mt-4 text-lg leading-8 text-muted-foreground">{description}</p>
          )}
          {/* exact-locale: resets the body's language mark for our own words */}
          <div lang={context.textLocale === context.locale ? undefined : context.locale}>
            <GuideDownload
              guideId={section.guideId}
              locale={context.locale}
              besidePicture={src !== null}
            />
          </div>
        </div>
        {src !== null && (
          <LandingPicture
            src={src}
            alt={text.imageAlt}
            sizes="(min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)"
          />
        )}
      </div>
    </section>
  );
}

/**
 * An email sign-up: the heading and intro the page wrote over the site's own
 * form, in the reading column.
 */
function SubscribeSection({ section, text, context }: LandingSectionProps<"subscribe">) {
  return (
    <section className={LANDING_SECTION}>
      <div className="mx-auto max-w-xl">
        <SectionHeader eyebrow={text.eyebrow} heading={text.heading} intro={text.intro} />
        <div className="mt-10">
          <LandingSubscribeForm
            pageId={context.pageId}
            sectionId={section.id}
            locale={context.locale}
            buttonLabel={written(text.buttonLabel) ?? ""}
            preview={context.preview}
          />
        </div>
      </div>
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
