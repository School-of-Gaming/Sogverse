/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { Gamepad2, Shield, Sparkles, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HomeCtaSection,
  HomeFeaturesSection,
  HomeHowItWorksSection,
} from "@/components/home/home-page-body";
import type { YtyPalette } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The home page's own pass, split out of the colour deck.
 *
 * The owner parked the home page into a dedicated review (ruling, 2026-09-01),
 * and the hero is now settled outright: today's amber→violet band stays, with
 * the settled Poppins type — so the hero slide is gone and every dose draws
 * the same hero. This page is where the home slides that were cut from
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
 * **The drafts carry the settled typography; the Today rows carry today's.**
 * Type is ruled — Press Start 2P is out of the product, every heading is
 * Poppins SemiBold at the Guidebook's scale, and the CTA row is 16px / 600 — so
 * a draft dose here is drawn on the type it will actually live with, and the
 * pair of doses differ from each other in colour alone. The Today rows keep the
 * pixel face and the 14px / 500 button, because that is what they document.
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
  { id: "features", title: "Feature cards" },
  { id: "how-it-works", title: "How it works" },
  { id: "cta", title: "The closing CTA" },
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

/** The page ground every section sample sits on. */
const PAGE_SURFACE = "bg-background";

/* The marker-stroke close-up slide that sat here is gone: the highlight
   treatment — a glow-green fill behind the headline's payoff words — was ruled
   out entirely (owner, 2026-09-01), so the lively dose's payoff words now carry
   glow as soft ink instead, which the hero slide already shows. */

/* ------------------------------------------------------------------ */
/*  Feature-slide exhibits — the tile treatment, and the glow lift     */
/* ------------------------------------------------------------------ */

/**
 * The icon tile face-off, all four families per row so the ensemble is
 * visible. Two candidates only: **solid is ruled out** (owner, 2026-09-01).
 * The tile-as-accent principle is approved — a brand colour accenting an icon
 * is a different construct from a colour painted as a card's ground, the same
 * effect the voice-zone icon tiles use — so what remains is which accent:
 * "tinted" (the strong hue at 10% under the soft glyph's ink, as drafted) or
 * "neutral" (a muted tile, every bit of colour in the glyph), which the owner
 * currently likes best and wants beside the tinted look before ruling. The
 * wrapper carries the section's own `border` exactly as the live card does.
 */
const TILE_TREATMENTS: readonly {
  label: string;
  tiles: readonly { tile: string; glyph: string }[];
}[] = [
  {
    label: "Tinted — as drafted: strong at 10%, soft glyph",
    tiles: [
      { tile: "border-yty-harmony-strong/30 bg-yty-harmony-strong/10", glyph: "text-yty-harmony-soft" },
      { tile: "border-yty-glow-strong/30 bg-yty-glow-strong/10", glyph: "text-yty-glow-soft" },
      { tile: "border-yty-valor-strong/30 bg-yty-valor-strong/10", glyph: "text-yty-valor-soft" },
      { tile: "border-yty-wit-strong/30 bg-yty-wit-strong/10", glyph: "text-yty-wit-soft" },
    ],
  },
  {
    label: "Neutral — muted tile, the soft glyph carries the colour",
    tiles: [
      { tile: "bg-muted", glyph: "text-yty-harmony-soft" },
      { tile: "bg-muted", glyph: "text-yty-glow-soft" },
      { tile: "bg-muted", glyph: "text-yty-valor-soft" },
      { tile: "bg-muted", glyph: "text-yty-wit-soft" },
    ],
  },
];

const TILE_ICONS = [Gamepad2, Sparkles, Users, Shield] as const;

function TileRow({
  tiles,
}: {
  tiles: readonly { tile: string; glyph: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-4 rounded-lg border bg-background p-4">
      {tiles.map((t, i) => {
        const Icon = TILE_ICONS[i];
        return (
          <div
            key={t.tile + t.glyph}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg border",
              t.tile,
            )}
          >
            <Icon className={cn("h-6 w-6", t.glyph)} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The card lift (owner ruling, 2026-09-01): **edge + inner glow — the voice
 * zones' active-zone treatment, reusing the same code**, drawn beside the
 * solid edge for the final look. The glow is `.zone-glow` verbatim — the
 * inset-shadow geometry from globals.css with the family hue bound into
 * `--glow-color` — and reuse is the point: one glow, one class, no renamed
 * copy. It squares with the watered-surface principle because the ground
 * stays neutral and the hue stays authored — the colour is light spilling in
 * from the edge, not a paint the card's surface claims to be.
 */
const TINTED_TILE = {
  tile: "border-yty-harmony-strong/30 bg-yty-harmony-strong/10",
  glyph: "text-yty-harmony-soft",
} as const;
const NEUTRAL_TILE = {
  tile: "bg-muted",
  glyph: "text-yty-harmony-soft",
} as const;
const EDGE_CARD = "border-yty-harmony-strong bg-card/50";
const GLOW_CARD =
  "border-yty-harmony-strong bg-card/50 zone-glow [--glow-color:var(--color-yty-harmony-strong)]";

/** The lift face-off: one variable, the glow. Both cards wear the drafted tile. */
const LIFT_FACE_OFF: readonly {
  label: string;
  card: string;
  tile: string;
  glyph: string;
}[] = [
  { label: "Solid edge", card: EDGE_CARD, ...TINTED_TILE },
  {
    label: "Edge + inner glow — the voice-zone treatment",
    card: GLOW_CARD,
    ...TINTED_TILE,
  },
];

/** The tile face-off in card context: one variable, the tile. Both cards wear
 *  the chosen lift, so the tile is judged where it will actually live. */
const TILE_FACE_OFF: readonly {
  label: string;
  card: string;
  tile: string;
  glyph: string;
}[] = [
  { label: "Tinted tile", card: GLOW_CARD, ...TINTED_TILE },
  { label: "Neutral tile", card: GLOW_CARD, ...NEUTRAL_TILE },
];

/** A feature card in the section's own shape, one per candidate. */
function LiftCard({
  card,
  tile,
  glyph,
}: {
  card: string;
  tile: string;
  glyph: string;
}) {
  return (
    <Card className={cn("w-72", card)}>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-lg border",
              tile,
            )}
          >
            <Gamepad2 className={cn("h-6 w-6", glyph)} aria-hidden />
          </div>
          <CardTitle>Clubs, camps and events</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription>
          Weekly sessions inside the games children already love, led by a
          trained Gedu.
        </CardDescription>
      </CardContent>
    </Card>
  );
}

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

      {/* The hero slide that opened this deck is gone: settled (owner ruling,
          2026-09-01) — the hero keeps today's amber→violet band, as the one
          sanctioned exception to the flat default, drawn with the settled
          Poppins type. Both dose scenarios now render that hero, so the
          full-page preview links show the ruling rather than a rejected
          draft; the dusk-sky exhibit died with the question. */}

      {/* ----------------------------------------------------------- 1 */}
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

        <div className="space-y-3">
          <Marker>The icon tile face-off — solid is ruled out</Marker>
          {TILE_TREATMENTS.map((treatment) => (
            <div key={treatment.label} className="space-y-1">
              <div className="text-[11px] text-muted-foreground">
                {treatment.label}
              </div>
              <TileRow tiles={treatment.tiles} />
            </div>
          ))}
          <div className="flex flex-wrap gap-4">
            {TILE_FACE_OFF.map((candidate) => (
              <div key={candidate.label} className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {candidate.label}
                </div>
                <LiftCard
                  card={candidate.card}
                  tile={candidate.tile}
                  glyph={candidate.glyph}
                />
              </div>
            ))}
          </div>
        </div>

        <Ruling>
          The tile — tinted as drafted, or neutral with the soft glyph carrying
          the colour.
        </Ruling>

        <div className="space-y-3">
          <Marker>Card lift — ruled: the voice zones&rsquo; glow, same code</Marker>
          <div className="flex flex-wrap gap-4">
            {LIFT_FACE_OFF.map((candidate) => (
              <div key={candidate.label} className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  {candidate.label}
                </div>
                <LiftCard
                  card={candidate.card}
                  tile={candidate.tile}
                  glyph={candidate.glyph}
                />
              </div>
            ))}
          </div>
        </div>
        <Caption>
          The inner glow is <code>.zone-glow</code> reused verbatim — the
          active-voice-zone treatment with the family hue bound in.
        </Caption>

        <Ruling>
          Card lift — edge + inner glow is chosen; confirm it against the bare
          solid edge beside it.
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
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

      {/* ----------------------------------------------------------- 3 */}
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

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>Feature cards — today, accented, or lively.</li>
          <li>The icon tile — tinted, or neutral.</li>
          <li>Card lift — confirm edge + inner glow against the solid edge.</li>
          <li>How it works — today, accented, or lively.</li>
          <li>The closing CTA — today, accented, or lively.</li>
        </ol>
      </Slide>
    </div>
  );
}
