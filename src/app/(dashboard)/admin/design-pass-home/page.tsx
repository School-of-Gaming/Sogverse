/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  HomeCtaSection,
  HomeFeaturesSection,
  HomeHeroSection,
  HomeHowItWorksSection,
  type HomeDraftClasses,
} from "@/components/home/home-page-body";
import type { YtyPalette } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The home page's own pass, split out of the colour deck.
 *
 * The owner parked the home page into a dedicated review (ruling, 2026-09-01):
 * he is comfortable with today's amber/violet hero and is not sure the page
 * needs changing at all, so no home draft rides with the main colour review.
 * This page is where the home slides that were cut from
 * `/admin/design-pass-walkthrough` now live, and it is deleted from this branch
 * before the wiring phase lands, together with the other two decks.
 *
 * Deliberately absent from the admin sidebar and from every index. The proxy
 * role-gates every path under `/admin`, so reaching it by URL is already gated
 * without this page doing anything.
 *
 * **Show, don't tell — this page is exhibits, not argument** (owner direction,
 * 2026-09-01). Every slide is a title, the rendered thing as large as honesty
 * allows, at most one caption line, and a one-line ruling with the
 * recommendation folded in. The reasoning behind each draft is not on the page:
 * it lives in the session reports, in the plan, and in these code comments. A
 * slide carrying more words than the UI it shows is a bug.
 *
 * **Every exhibit is the real component.** The four colour-bearing home
 * sections are exported from the page body precisely so a deck can draw them
 * under a different palette prop, which means a sample here cannot drift from
 * the page it shows — it *is* the page's code. Nothing is screenshotted and
 * nothing is iframed.
 *
 * **Honesty caveat, stated once rather than on every slide.** Tailwind
 * breakpoints read the *viewport*, so every sample below is showing desktop
 * styling however narrow its box is, and a section sample is the deck column's
 * width rather than the page's. Where the full-page truth is the point, the
 * link beside the sample is what carries it.
 *
 * **The furniture is a copy of the other two decks', not an import.** All three
 * pages are deleted in the same change, and a shared module between three
 * doomed pages is a fourth thing to delete plus a reason for someone to keep it.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "hero", title: "The hero, four ways" },
  { id: "features", title: "Feature cards" },
  { id: "how-it-works", title: "How it works" },
  { id: "cta", title: "The closing CTA" },
  { id: "marker", title: "The marker stroke" },
  { id: "recap", title: "Recap" },
] as const;

type SlideId = (typeof SLIDES)[number]["id"];

/**
 * The three doses, each with the scenario that draws the whole page in it.
 *
 * Slug and palette travel together so a sample and the link beside it can never
 * point at different things.
 */
const HOME_DOSES: readonly {
  slug: string;
  label: string;
  palette: YtyPalette;
}[] = [
  { slug: "current", label: "Today", palette: "current" },
  { slug: "brand-palette", label: "Accented", palette: "brand" },
  { slug: "brand-lively", label: "Lively", palette: "brand-lively" },
];

/**
 * **The retired dusk hero, kept as an exhibit and nothing else.**
 *
 * Flat is the drafts' default (owner direction: gradients smear colours this
 * palette no longer needs smeared), so no scenario draws this and no page
 * anywhere renders it. It survives because it is the one brand-hue blend with a
 * case to make — it imitates the dusk sky of the brand's own social imagery
 * rather than mixing two hues for want of a third — and a case cannot be judged
 * against a description.
 *
 * The class strings are the ones the lively dose carried before the flat default
 * landed, recovered verbatim from the walkthrough deck's gradient slide and
 * frozen here. Every slot but the hero's own is the *current* lively dose,
 * because nothing else in this exhibit is under question: the hero section reads
 * only `hero`, `heroTitle`, `heroPrimary` and `heroSecondary`, and the rest are
 * here to satisfy the shape.
 *
 * **Exhibit-only. Do not copy these into a dose.** If the ruling keeps the dusk
 * sky it goes back into the lively dose as a sanctioned exception and this
 * constant is deleted; if the ruling kills it, this constant is deleted. Either
 * way it has no future outside this slide.
 */
const DUSK_HERO_EXHIBIT: HomeDraftClasses = {
  hero:
    "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),radial-gradient(75%_60%_at_74%_6%,_color-mix(in_oklab,_var(--color-yty-harmony-strong)_22%,_transparent)_0%,_transparent_72%),radial-gradient(70%_62%_at_16%_34%,_color-mix(in_oklab,_var(--color-yty-wit-strong)_18%,_transparent)_0%,_transparent_72%)] pt-[var(--header-height)]",
  heroTitle:
    "font-display text-2xl font-bold leading-tight tracking-tight md:text-6xl",
  heroPrimary: "text-foreground",
  heroSecondary:
    "box-decoration-clone rounded-lg bg-yty-glow-strong px-3 text-background",
  howItWorksSection: "bg-yty-harmony-strong/10 py-24",
  stepCircles: [
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background ring-4 ring-yty-harmony-strong/25",
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background ring-4 ring-yty-glow-strong/25",
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background ring-4 ring-yty-wit-soft/25",
  ],
  ctaCard: "mx-auto max-w-3xl bg-yty-harmony-strong/15",
  sectionRule: "mx-auto mt-6 h-1 w-24 rounded-full bg-yty-harmony-strong",
};

/* ------------------------------------------------------------------ */
/*  Slide furniture                                                    */
/* ------------------------------------------------------------------ */

function Slide({ id, children }: { id: SlideId; children: React.ReactNode }) {
  const index = SLIDES.findIndex((slide) => slide.id === id);
  const slide = SLIDES[index];

  return (
    <section
      id={id}
      className="scroll-mt-[calc(var(--header-height)+1rem)] space-y-4 rounded-lg border p-6"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums text-primary">
          {index + 1}
        </span>
        <h2 className="text-2xl font-bold">{slide.title}</h2>
      </div>
      {children}
    </section>
  );
}

/** One line, and only where the exhibit above it is not self-labelling. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

/** The ask, in one line, with the recommendation folded in rather than argued. */
function Ruling({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Ruling
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function DeckLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  );
}

/** The row of full-page links a slide ends with, where any exist. */
function Links({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4 text-xs">{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Inline samples                                                     */
/* ------------------------------------------------------------------ */

/**
 * One live sample — the real section, rendered here — with a plain link to the
 * scenario that holds the full-page truth.
 *
 * `surface` gives the sample the page's own ground rather than the deck's card,
 * and absorbs the hero's negative top margin where one is inside.
 */
function Sample({
  label,
  href,
  linkLabel = "Open the full page",
  surface,
  children,
}: {
  label: string;
  href: string;
  linkLabel?: string;
  surface?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {label}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {linkLabel}
        </a>
      </div>
      <div className={cn("overflow-hidden rounded-lg border", surface)}>
        {children}
      </div>
    </div>
  );
}

/** A vertical run of samples meant to be compared with each other. */
function SampleRun({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}

/** The page ground, plus the room the hero's negative top margin eats. */
const PAGE_SURFACE = "bg-background";
const HERO_SURFACE = "bg-background pt-[var(--header-height)]";

/* ------------------------------------------------------------------ */
/*  Slide 5 — the marker stroke, close up                              */
/* ------------------------------------------------------------------ */

/**
 * The headline's own beats, decomposed from `home.hero.title`: the `<br>` chunks
 * are the four lines, `<primary>` is "Screen Time" and `<secondary>` is "Quality
 * Time" — the payoff words the lively dose strokes.
 *
 * Written at a literal `text-6xl` rather than the component's `md:text-6xl`,
 * because a breakpoint inside a narrow box on a wide screen would quietly show
 * the wide size and call it the phone. This is the desktop size, stated as one.
 * Both settings are otherwise the lively dose's own classes, so the only
 * difference on screen is the stroke.
 */
function MarkerHeadline({ payoff }: { payoff: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background p-6">
      <p className="w-max font-display text-6xl font-bold leading-tight tracking-tight text-foreground">
        Where
        <br />
        Screen Time
        <br />
        Becomes
        <br />
        <span className={payoff}>Quality Time</span>
      </p>
    </div>
  );
}

const PAYOFF_STROKED =
  "box-decoration-clone rounded-lg bg-yty-glow-strong px-3 text-background";
const PAYOFF_PLAIN = "text-foreground";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassHomePage() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
        <p className="max-w-prose text-sm text-foreground">
          <span className="font-semibold text-destructive">Temporary</span> —
          review aid for the brand design pass, deleted before merge.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Brand design pass — the home page</h1>
        <p className="max-w-prose text-muted-foreground">
          Does the home page change at all — and if so, how far? Each slide draws
          one section as it ships beside the drafts, and asks one question; the
          links open the whole page, which is where the width and the scroll are
          honest.
        </p>
      </div>

      <Links>
        <DeckLink href="/preview/home/current">
          The whole page — today
        </DeckLink>
        <DeckLink href="/preview/home/brand-palette">
          The whole page — accented
        </DeckLink>
        <DeckLink href="/preview/home/brand-lively">
          The whole page — lively
        </DeckLink>
        <DeckLink href="/admin/design-pass-walkthrough">
          Colour, everywhere else
        </DeckLink>
        <DeckLink href="/admin/design-pass-typography">Typography</DeckLink>
      </Links>

      <nav className="rounded-lg border p-4">
        <ol className="flex flex-wrap gap-x-2 gap-y-2">
          {SLIDES.map((slide, index) => (
            <li key={slide.id}>
              <a
                href={`#${slide.id}`}
                className="inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span>{slide.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ----------------------------------------------------------- 1 */}
      <Slide id="hero">
        <SampleRun>
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={HERO_SURFACE}
            >
              <HomeHeroSection palette={dose.palette} />
            </Sample>
          ))}
          <Sample
            label="Dusk gradient — retired, exhibit only"
            href="/preview/home/brand-lively"
            linkLabel="Open the flat page it would replace"
            surface={HERO_SURFACE}
          >
            <HomeHeroSection exhibitClasses={DUSK_HERO_EXHIBIT} />
          </Sample>
        </SampleRun>
        <Caption>
          The hero&rsquo;s button knows who is reading it and you are signed in,
          so it says My SOG where a stranger is asked to get started.
        </Caption>

        <Ruling>
          The hero — today&rsquo;s amber-violet band, the accented wash, the
          lively flat, or the dusk sky. (recommended: yours — you are comfortable
          with today&rsquo;s)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="features">
        <SampleRun>
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeFeaturesSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleRun>

        <Ruling>
          Feature cards — today, accented, or lively. (recommended: accented)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="how-it-works">
        <SampleRun>
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeHowItWorksSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleRun>
        <Caption>
          No orange circle in either draft — an orange next to the amber CTA is
          the collision this pass exists to remove.
        </Caption>

        <Ruling>
          How it works — today, accented, or lively. (recommended: accented)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="cta">
        <SampleRun>
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeCtaSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleRun>

        <Ruling>
          The closing CTA — today, accented, or lively. (recommended: accented)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="marker">
        <div className="space-y-3">
          <Marker>The lively hero&rsquo;s headline — stroked</Marker>
          <MarkerHeadline payoff={PAYOFF_STROKED} />
        </div>
        <div className="space-y-3">
          <Marker>The same headline, plain</Marker>
          <MarkerHeadline payoff={PAYOFF_PLAIN} />
        </div>
        <Caption>
          The stroke is the lively dose&rsquo;s only mark on the vision
          statement, and it exists nowhere else in the page.
        </Caption>

        <Ruling>
          The marker stroke — keep or drop. (recommended: it rides with the hero
          — keep only if the hero goes lively)
        </Ruling>

        <Links>
          <DeckLink href="/preview/home/brand-lively">
            The stroke at the page&rsquo;s own width, where it wraps
          </DeckLink>
        </Links>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>The hero — today, accented, lively, or the dusk sky.</li>
          <li>Feature cards — today, accented, or lively.</li>
          <li>How it works — today, accented, or lively.</li>
          <li>The closing CTA — today, accented, or lively.</li>
          <li>The marker stroke — keep or drop.</li>
        </ol>
      </Slide>
    </div>
  );
}
