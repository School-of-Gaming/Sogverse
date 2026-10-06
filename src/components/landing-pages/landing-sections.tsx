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
  CardTitle,
} from "@/components/ui/card";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { Markdown } from "@/components/ui/markdown";
import type { SupportedLocale } from "@/lib/constants/locales";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import type {
  ButtonTarget,
  LandingSectionOf,
  LandingSectionType,
} from "@/lib/landing-pages/sections";
import { buttonTargetHref } from "@/lib/links/button-target";
import { cn } from "@/lib/utils";
import { LANDING_ICON_GLYPHS } from "./landing-icons";
import {
  written,
  type LandingSectionByType,
  type LandingTextByType,
  type LandingTextOf,
} from "./landing-section-types";

/*
 * **One renderer per section type**, in an exhaustive map, so a type added to
 * the registry fails type-check here until it is drawn.
 *
 * The sections are built from the app's own components in the treatments the
 * home and Roblox pages already use — the act eyebrow over a section heading,
 * the centred heading over a card grid, the act-filled step numbers, the FAQ
 * rows, the closing card with the world rule along its top — so a landing page
 * reads as part of the same site whatever order an admin puts them in. Every
 * section sits on the plain page ground: an admin chooses the order, and a
 * tinted band beside another tinted band reads as one section with a stray
 * heading in it, so no band is spent at all.
 *
 * **Every word is the admin's**, so the renderers paint what is written and
 * leave out what is not: a published version has every required word, and the
 * preview of one still being written shows its blanks as gaps rather than as
 * placeholder copy. The one string of our own is the screen reader's "opens in
 * a new tab" beside a button that leaves the site.
 */

/** What every renderer is handed besides its own section and words. */
export interface LandingRenderContext {
  /** The page's locale: what an own-site button's address is localised to. */
  locale: SupportedLocale;
  /**
   * A picture's servable URL by its catalogue entry id, or null when the copy
   * names no path for it (the picture has left the catalogue).
   */
  imageSrc: (imageId: string) => string | null;
}

interface LandingSectionProps<Type extends LandingSectionType> {
  section: LandingSectionOf<Type>;
  text: LandingTextOf<Type>;
  context: LandingRenderContext;
}

/** A landing picture's stored size: `next/image` reserves its box from it. */
const PICTURE = CATALOGUE_IMAGE_PURPOSES.landing_image;

/** Vertical rhythm shared by every section after the hero. */
const SECTION = "container mx-auto px-4 py-16 sm:py-24";

/** The section heading every section but the hero takes. */
const HEADING = "text-3xl font-bold tracking-tight sm:text-4xl";

/** Small uppercase section label — furniture, so caps; act, as the Roblox page's. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-act">
      {children}
    </p>
  );
}

/** A section's eyebrow, heading and intro, each drawn only when written. */
function SectionHeader({
  eyebrow,
  heading,
  intro,
  centred = true,
}: {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  centred?: boolean;
}) {
  const label = written(eyebrow);
  const title = written(heading);
  const lead = written(intro);
  if (label === null && title === null && lead === null) return null;
  return (
    <div className={cn(centred && "mx-auto max-w-2xl text-center")}>
      {label !== null && <Eyebrow>{label}</Eyebrow>}
      {title !== null && (
        <h2 className={cn(HEADING, label !== null && "mt-4")}>{title}</h2>
      )}
      {lead !== null && <p className="mt-4 text-muted-foreground">{lead}</p>}
    </div>
  );
}

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
            <h1 className="text-balance text-h1-mobile font-bold tracking-tight md:text-5xl">
              {text.headline}
            </h1>
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
    <section className={SECTION}>
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
  const hasHeader = written(text.eyebrow) !== null || written(text.heading) !== null;
  return (
    <section className={SECTION}>
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
    <section className={SECTION}>
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
                  <CardTitle className="text-lg leading-snug">{words?.title}</CardTitle>
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
    <section className={SECTION}>
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
              <h3 className="mt-4 text-lg font-semibold">{words?.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{words?.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
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
            <Markdown variant="landing" emphasis="quiet">
              {answer}
            </Markdown>
          ),
      },
    ];
  });
  return (
    <section className={SECTION}>
      <div className="mx-auto max-w-3xl">
        <SectionHeader eyebrow={text.eyebrow} heading={text.heading} />
        <div className="mt-12">
          <FaqAccordion items={items} />
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
    <section className={SECTION}>
      <Card className="relative mx-auto max-w-3xl overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
        <CardContent className="flex flex-col items-center py-12 text-center">
          {eyebrow !== null && (
            <div className="mb-4">
              <Eyebrow>{eyebrow}</Eyebrow>
            </div>
          )}
          <h2 className="text-2xl font-bold sm:text-3xl">{text.heading}</h2>
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
  faq: FaqSection,
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
