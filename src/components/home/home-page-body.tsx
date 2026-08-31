import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Shield, Users, Sparkles, Gamepad2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeCtaLink } from "@/components/home/cta-link";
import { ROUTES } from "@/lib/constants";
import type { YtyPalette } from "@/lib/constants/yty";

const featureIcons = [Gamepad2, Sparkles, Users, Shield];
const featureKeys = ["minecraftClubs", "screenTime", "newFriends", "parents"] as const;

type FeatureKey = (typeof featureKeys)[number];

/**
 * The two draft doses. `"current"` has no entry anywhere below — the live path
 * keeps its own literal classes at every call site, so the public route renders
 * character-for-character what it rendered before the design pass existed.
 */
type HomeDraftPalette = Exclude<YtyPalette, "current">;

/* ------------------------------------------------------------------ */
/*  Design-pass draft — the brand palette beyond the Yty section        */
/* ------------------------------------------------------------------ */

/**
 * **Design-pass draft. Read only on the two `brand*` paths, which no live route
 * takes.**
 *
 * The home page is a marketing surface, and the Guidebook's own colour
 * rationing puts marketing on the side that welcomes the full palette — so the
 * question this draft exists to answer is not *whether* pink, green, orange and
 * blue reach past the Yty cards but *how far*. Two doses, drawn as two
 * scenarios, because a page cannot be seen at two doses at once:
 *
 * - **`brand`** — accents. One element family per feature card, the palette on
 *   the three how-it-works circles, a single pink hint in the hero glow, the
 *   violet end of the closing CTA swapped for pink. Nothing else moves.
 * - **`brand-lively`** — the marketing site's own energy: a dusk sky in the
 *   hero (pink and blue over the dark ground, and **no ambient amber**, so the
 *   one amber on the screen is the CTA button), a glow-green marker stroke
 *   behind the headline's payoff words, fuller card washes, a tinted
 *   how-it-works band, and a palette rule under each section heading.
 * - **`brand-lively-flat`** — the same dose with **no blended gradient
 *   anywhere**. Brand-hue gradients are a Sogverse invention rather than a
 *   Guidebook construct — a crutch from the two-colour era — so this dose asks
 *   what the page looks like with the colour laid down as flat fields and
 *   single-hue washes instead. Same hues, same numbers, same everything else.
 *   A same-hue fade to transparent is a wash, not a blend, so the Yty element
 *   cards are identical here too.
 *
 * **Amber stays the identity mark and the CTA colour in both.** It is the
 * ambient wash that the lively dose gives up, not the button.
 *
 * **Every pairing here is script-measured, not eyeballed** (`node
 * scripts/yty-contrast.mjs` for the palette's own numbers; the draft-specific
 * composites are recorded per slot below). The split is the one the Yty draft
 * map follows: soft carries text and glyphs, strong carries fills and edges.
 *
 * Classes are literal strings for the same reason the Yty draft map's are —
 * Tailwind scans source text, so a templated `bg-yty-${id}-strong/10` emits a
 * class name with no rule behind it. All of it retires with the draft.
 */
interface FeatureAccent {
  /** Extra classes on the Card itself — a family-tinted edge on the lively dose. */
  card: string;
  /** The 48 px icon tile: its wash and its border. */
  tile: string;
  /** The 24 px glyph inside it. Soft, always — 3:1 is the bar and soft clears 5.6–7.5. */
  glyph: string;
}

/**
 * One element family per feature card, in the palette's display order —
 * harmony pink, glow green, valor orange, wit blue — so the four cards echo the
 * Four Yty-Elements without a word of copy saying so.
 *
 * Measured on the composited card ground (`bg-card/50` over the page is
 * `#161616`): the soft glyph over its own strong tint reads 6.60–7.49 at the
 * accented dose and 5.64–6.36 at the lively one, against a 3:1 bar for a 24 px
 * icon. Nothing in the card carries text over a tint, so no other pairing here
 * moves at all.
 */
const FEATURE_DRAFT_ACCENTS: Record<
  HomeDraftPalette,
  Record<FeatureKey, FeatureAccent>
> = {
  brand: {
    minecraftClubs: {
      card: "bg-card/50",
      tile: "border-yty-harmony-strong/30 bg-yty-harmony-strong/10",
      glyph: "text-yty-harmony-soft",
    },
    screenTime: {
      card: "bg-card/50",
      tile: "border-yty-glow-strong/30 bg-yty-glow-strong/10",
      glyph: "text-yty-glow-soft",
    },
    newFriends: {
      card: "bg-card/50",
      tile: "border-yty-valor-strong/30 bg-yty-valor-strong/10",
      glyph: "text-yty-valor-soft",
    },
    parents: {
      card: "bg-card/50",
      tile: "border-yty-wit-strong/30 bg-yty-wit-strong/10",
      glyph: "text-yty-wit-soft",
    },
  },
  "brand-lively": {
    minecraftClubs: {
      card: "border-yty-harmony-strong/25 bg-card/50",
      tile: "border-yty-harmony-strong/40 bg-yty-harmony-strong/20",
      glyph: "text-yty-harmony-soft",
    },
    screenTime: {
      card: "border-yty-glow-strong/25 bg-card/50",
      tile: "border-yty-glow-strong/40 bg-yty-glow-strong/20",
      glyph: "text-yty-glow-soft",
    },
    newFriends: {
      card: "border-yty-valor-strong/25 bg-card/50",
      tile: "border-yty-valor-strong/40 bg-yty-valor-strong/20",
      glyph: "text-yty-valor-soft",
    },
    parents: {
      card: "border-yty-wit-strong/25 bg-card/50",
      tile: "border-yty-wit-strong/40 bg-yty-wit-strong/20",
      glyph: "text-yty-wit-soft",
    },
  },
  /**
   * Identical to the lively dose, and that is the finding rather than a
   * shortcut: the feature cards were never drawn with a gradient. A solid tint,
   * a solid edge and a soft glyph are already flat, so the flat scenario has
   * nothing to take away here and the comparison between the two pages stays
   * about the hero, the band and the CTA.
   */
  "brand-lively-flat": {
    minecraftClubs: {
      card: "border-yty-harmony-strong/25 bg-card/50",
      tile: "border-yty-harmony-strong/40 bg-yty-harmony-strong/20",
      glyph: "text-yty-harmony-soft",
    },
    screenTime: {
      card: "border-yty-glow-strong/25 bg-card/50",
      tile: "border-yty-glow-strong/40 bg-yty-glow-strong/20",
      glyph: "text-yty-glow-soft",
    },
    newFriends: {
      card: "border-yty-valor-strong/25 bg-card/50",
      tile: "border-yty-valor-strong/40 bg-yty-valor-strong/20",
      glyph: "text-yty-valor-soft",
    },
    parents: {
      card: "border-yty-wit-strong/25 bg-card/50",
      tile: "border-yty-wit-strong/40 bg-yty-wit-strong/20",
      glyph: "text-yty-wit-soft",
    },
  },
};

/** Every non-feature slot the draft repaints, per dose. */
interface HomeDraftClasses {
  /** The hero `<section>`, whose background is the page's one big gradient. */
  hero: string;
  /** The hero `<h1>`. */
  heroTitle: string;
  /** The `<primary>` chunk of the hero headline. */
  heroPrimary: string;
  /** The `<secondary>` chunk of the hero headline. */
  heroSecondary: string;
  /** The how-it-works band. */
  howItWorksSection: string;
  /** The three numbered circles, in order. */
  stepCircles: readonly [string, string, string];
  /** The closing CTA card. */
  ctaCard: string;
  /** A palette rule under a section heading, or `null` where the dose has none. */
  sectionRule: string | null;
}

const HOME_DRAFT_CLASSES: Record<HomeDraftPalette, HomeDraftClasses> = {
  /**
   * Accents. The hero keeps today's amber-left / violet-right wash and gains
   * one restrained pink glow at 16%; the headline, the section grounds and the
   * page's rhythm are untouched. The three circles take harmony, glow and wit —
   * valor is deliberately *not* among them, because an orange circle next to
   * the amber CTA is the same collision the whole pass exists to remove.
   */
  brand: {
    hero:
      "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),radial-gradient(70%_60%_at_78%_16%,_color-mix(in_oklab,_var(--color-yty-harmony-strong)_16%,_transparent)_0%,_transparent_70%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]",
    heroTitle: "font-display text-2xl font-bold tracking-tight md:text-6xl",
    heroPrimary: "text-primary",
    heroSecondary: "text-secondary",
    howItWorksSection: "bg-muted/30 py-24",
    /**
     * Ink on the fill, uniformly, so three sibling circles carry one ink
     * colour: harmony-strong 6.11:1, glow-strong 6.63:1, wit-soft 8.10:1,
     * against a 4.5:1 bar (the numeral is 24 px bold, so WCAG would allow 3:1
     * — the stricter bar is taken because there was a variant that met it).
     *
     * **Wit is the one circle drawn in the soft variant, and that is the
     * measured answer, not a slip.** Ink on wit-*strong* is 4.10:1, under the
     * bar; the alternative that keeps the strong fill is white text at 4.57:1,
     * which clears by seven hundredths *and* puts a second ink colour in a run
     * of three. Soft clears by a mile and keeps the run uniform, so the fill
     * strength gives way rather than the ink.
     */
    stepCircles: [
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background",
    ],
    ctaCard: "mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-yty-harmony-strong/10",
    sectionRule: null,
  },

  /**
   * The marketing site's dose, read off the brand's own social imagery: a
   * dusk/night sky in pink and blue, white headlines, harmony pink as the
   * workhorse, glow green kept for a marker stroke behind the words that
   * matter, and amber spent only on the identity mark and the CTA.
   *
   * The hero's two glows are 22% pink and 18% blue. Those numbers are the
   * answer to the worst case rather than a taste: where the two overlap they
   * composite to a dusk purple `#4a2f4d`, and the subtitle's muted foreground
   * over *that* is 4.78:1 — the binding measurement on the whole hero, since
   * either glow alone is looser (5.69 and 6.45) and the fade-to-background
   * layer above them only ever darkens. A third glow was drafted and cut: three
   * overlapping washes fall to 4.08:1, and "they cannot geometrically all peak
   * in one place" is not a contrast argument.
   */
  "brand-lively": {
    hero:
      "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),radial-gradient(75%_60%_at_74%_6%,_color-mix(in_oklab,_var(--color-yty-harmony-strong)_22%,_transparent)_0%,_transparent_72%),radial-gradient(70%_62%_at_16%_34%,_color-mix(in_oklab,_var(--color-yty-wit-strong)_18%,_transparent)_0%,_transparent_72%)] pt-[var(--header-height)]",
    /**
     * `leading-tight` is the marker stroke's doing: the wash below is an inline
     * background, and at the default line-height of 1 for `text-6xl` two
     * stacked lines of it would touch.
     */
    heroTitle: "font-display text-2xl font-bold leading-tight tracking-tight md:text-6xl",
    /**
     * White, not amber — the ambient amber is what this dose gives up. The
     * face stays Press Start 2P in both drafts, so the comparison between them
     * stays about colour; the face itself is ruled on its own slide.
     */
    heroPrimary: "text-foreground",
    /**
     * The marker stroke: a full glow-green fill behind the headline's payoff
     * words, ink on top at 6.63:1. `box-decoration-clone` is what keeps it a
     * stroke rather than one long box when the phrase wraps at 360 px, which
     * it does in every locale.
     */
    heroSecondary:
      "box-decoration-clone rounded-lg bg-yty-glow-strong px-3 text-background",
    /**
     * A tinted band instead of the neutral `bg-muted/30`: harmony into wit,
     * both at 10%. Body copy over the extremes reads 6.87:1 and 7.05:1 for the
     * muted foreground, 14.29 and 14.65 for the full one.
     */
    howItWorksSection:
      "bg-gradient-to-br from-yty-harmony-strong/10 to-yty-wit-strong/10 py-24",
    /** Same fills and same ink as the accented dose, plus a halo of the fill's own hue. */
    stepCircles: [
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background ring-4 ring-yty-harmony-strong/25",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background ring-4 ring-yty-glow-strong/25",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background ring-4 ring-yty-wit-soft/25",
    ],
    /**
     * Three families and no amber, so the amber button inside it is the only
     * amber in the frame. Muted copy over the stops reads 5.86 / 6.49 / 6.24.
     */
    ctaCard:
      "mx-auto max-w-3xl bg-gradient-to-br from-yty-harmony-strong/15 via-yty-wit-strong/10 to-yty-glow-strong/10",
    /** Pink-led, amber-free, and never on the same heading twice. */
    sectionRule:
      "mx-auto mt-6 h-1 w-24 rounded-full bg-gradient-to-r from-yty-harmony-strong via-yty-wit-strong to-yty-glow-strong",
  },

  /**
   * The lively dose again, with every two-hue blend replaced by a flat field or
   * a single-hue wash. Four slots differ from `brand-lively` and nothing else
   * does — the feature cards, the circles, the headline and its marker stroke
   * are already flat and are carried over untouched, which is what keeps the
   * two pages a comparison of gradients rather than of two designs.
   *
   * **The hero is the ruling this dose exists for.** The dusk sky is two
   * radial glows blended over the ground; taking them out leaves the flat
   * `--background` the rest of the page sits on, and the liveliness is then
   * carried by solid things: the white headline, the glow-green marker stroke
   * behind its payoff words, and the amber CTA. One element the gradient
   * version does not have is added, because a hero of three centred lines on
   * bare ground reads as an unstyled page rather than a restrained one — a
   * solid harmony edge closing the section. It is a 4 px band of the dose's own
   * workhorse hue, it carries no text, and it is the whole of what was added.
   *
   * **Contrast: nothing here needs a new measurement, and every changed pairing
   * is looser than the one it replaces.** The subtitle now sits on the plain
   * page ground at 7.70:1 rather than on the lively hero's dusk composite at
   * 4.78:1 — removing colour from behind text can only help. The band is the
   * lively band's own from-stop (harmony at 10% over the page: muted foreground
   * 6.87:1, full foreground 14.29:1). The CTA card's wash replaces the card
   * ground rather than layering over it, so its muted copy reads 6.39:1 against
   * the lively card's 5.86:1. The marker stroke's ink on glow-strong is
   * unchanged at 6.63:1, and the section rule and the hero edge carry no text
   * at all.
   */
  "brand-lively-flat": {
    hero:
      "relative -mt-[var(--header-height)] overflow-hidden border-b-4 border-yty-harmony-strong bg-background pt-[var(--header-height)]",
    heroTitle: "font-display text-2xl font-bold leading-tight tracking-tight md:text-6xl",
    heroPrimary: "text-foreground",
    heroSecondary:
      "box-decoration-clone rounded-lg bg-yty-glow-strong px-3 text-background",
    /** One hue where the lively dose blends two: harmony at the same 10%. */
    howItWorksSection: "bg-yty-harmony-strong/10 py-24",
    stepCircles: [
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background ring-4 ring-yty-harmony-strong/25",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background ring-4 ring-yty-glow-strong/25",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background ring-4 ring-yty-wit-soft/25",
    ],
    /**
     * One hue where the lively dose runs three stops. A flat wash is a
     * background *colour*, so it replaces the card's own ground rather than
     * layering on it — which is why this reads slightly lighter than the same
     * alpha does under a gradient, and why its measured number is the better
     * one.
     */
    ctaCard: "mx-auto max-w-3xl bg-yty-harmony-strong/15",
    /**
     * Solid harmony, where the lively rule runs pink through blue into green.
     * Flattening a multi-hue rule forces a hue to be chosen, and that choice is
     * itself part of what the gradient ruling decides — pink is taken because
     * it is the dose's workhorse everywhere else.
     */
    sectionRule: "mx-auto mt-6 h-1 w-24 rounded-full bg-yty-harmony-strong",
  },
};

/** Every colour-bearing home section takes the palette and nothing else. */
interface HomeSectionProps {
  /**
   * Which brand palette — and at what dose — the section draws in. Defaults to
   * the live one, so the public route is byte-for-byte what it was.
   */
  palette?: YtyPalette;
}

/** `null` on the live path — which is what keeps every literal reachable. */
function draftClassesFor(palette: YtyPalette): HomeDraftClasses | null {
  return palette === "current" ? null : HOME_DRAFT_CLASSES[palette];
}

/* ------------------------------------------------------------------ */
/*  The page's four colour-bearing sections                            */
/* ------------------------------------------------------------------ */

/**
 * **The four sections below are exported because the design-pass walkthrough
 * renders them inline, one per dose, as its own comparison.** That deck used to
 * frame whole preview pages in iframes; rendering the real section instead
 * means the picture in the deck cannot drift from the page, because it *is* the
 * page's code. The body below composes them in the same order and with the same
 * wrappers it always had, so the live route's output is unchanged.
 *
 * They export together with the page body rather than moving to files of their
 * own: they are one page's sections, not a component library, and splitting
 * them would put the draft class map at arm's length from the markup it
 * describes.
 */
export function HomeHeroSection({ palette = "current" }: HomeSectionProps) {
  const t = useTranslations('home');
  const c = useTranslations('common');
  const draft = draftClassesFor(palette);

  return (
    <section className={draft ? draft.hero : "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]"}>
      <div className="container mx-auto px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className={draft ? draft.heroTitle : "font-display text-2xl font-bold tracking-tight md:text-6xl"}>
            {t.rich('hero.title', {
              br: () => <br />,
              primary: (chunks) => <span className={draft ? draft.heroPrimary : "text-primary"}>{chunks}</span>,
              secondary: (chunks) => <span className={draft ? draft.heroSecondary : "text-secondary"}>{chunks}</span>,
            })}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            {t('hero.subtitle')}
          </p>
          {/* The app-wide button order shape — root `CLAUDE.md`, "Button
              Order". Getting started is what the hero is steering toward,
              so it is last in the DOM (right in a row, top in a stack);
              the trip to About is the alternative beside it, and it is the
              home page's one route to the identity copy that used to sit
              further down this page. */}
          <div className="mt-10 flex flex-col-reverse items-center justify-center gap-4 sm:flex-row">
            <Link
              href={ROUTES.about}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {t('hero.aboutCta')}
            </Link>
            <HomeCtaLink
              signedOutHref={ROUTES.register}
              signedOutLabel={c('getStarted')}
              className={buttonVariants({ size: "lg", className: "gap-2" })}
            >
              <ArrowRight className="h-4 w-4" />
            </HomeCtaLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeFeaturesSection({ palette = "current" }: HomeSectionProps) {
  const t = useTranslations('home');
  const draft = draftClassesFor(palette);
  const featureAccents = palette === "current" ? null : FEATURE_DRAFT_ACCENTS[palette];

  const features = featureKeys.map((key, i) => ({
    key,
    title: t(`features.${key}.title`),
    description: t(`features.${key}.description`),
    icon: featureIcons[i],
  }));

  return (
    <section className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('features.heading')}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t('features.subheading')}
        </p>
        {draft?.sectionRule ? <div className={draft.sectionRule} aria-hidden /> : null}
      </div>
      <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.key} className={featureAccents ? featureAccents[feature.key].card : "bg-card/50"}>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className={featureAccents ? `flex h-12 w-12 items-center justify-center rounded-lg border ${featureAccents[feature.key].tile}` : "flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10"}>
                  <feature.icon className={featureAccents ? `h-6 w-6 ${featureAccents[feature.key].glyph}` : "h-6 w-6 text-primary"} />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base">
                {feature.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function HomeHowItWorksSection({ palette = "current" }: HomeSectionProps) {
  const t = useTranslations('home');
  const draft = draftClassesFor(palette);

  return (
    <section className={draft ? draft.howItWorksSection : "bg-muted/30 py-24"}>
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('howItWorks.heading')}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t('howItWorks.subheading')}
          </p>
          {draft?.sectionRule ? <div className={draft.sectionRule} aria-hidden /> : null}
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className={draft ? draft.stepCircles[0] : "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground"}>
              1
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step1.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('howItWorks.step1.description')}
            </p>
          </div>
          <div className="text-center">
            <div className={draft ? draft.stepCircles[1] : "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-bold text-secondary-foreground"}>
              2
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step2.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('howItWorks.step2.description')}
            </p>
          </div>
          <div className="text-center">
            <div className={draft ? draft.stepCircles[2] : "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground"}>
              3
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step3.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('howItWorks.step3.description')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HomeCtaSection({ palette = "current" }: HomeSectionProps) {
  const t = useTranslations('home');
  const c = useTranslations('common');
  const draft = draftClassesFor(palette);

  return (
    <section className="container mx-auto px-4 py-24">
      <Card className={draft ? draft.ctaCard : "mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10"}>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            {t('cta.heading')}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t('cta.subheading')}
          </p>
          {/* The app-wide button order shape — root `CLAUDE.md`, "Button
              Order". Creating an account is the primary CTA (last in the DOM,
              so right in a row and top in a stack); exploring the shop is the
              secondary alternative beside it. This is the same pair the
              purchase confirmation draws, and the two have to agree. */}
          <div className="mt-8 flex flex-col-reverse gap-4 sm:flex-row">
            <Link
              href={ROUTES.shop}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {c('exploreClubs')}
            </Link>
            <HomeCtaLink
              signedOutHref={ROUTES.register}
              signedOutLabel={t('cta.createFreeAccount')}
              className={buttonVariants({ size: "lg" })}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * The public home page's body — everything the route renders.
 *
 * Extracted so the preview scene and the live route render one body rather
 * than two forks of it (the scene rules' "one body, two shells"). There is no
 * data shell above it: the page is translations plus static arrays, so the
 * route is the body and nothing else, and the scene composes the same public
 * chrome around it.
 */
export function HomePageBody({
  palette = "current",
}: {
  /**
   * Which brand palette — and at what dose — the page draws in. Defaults to
   * the live one, so the public route is byte-for-byte what it was; the home
   * scene's three `brand*` scenarios pass the drafts. Retires when the draft
   * palette promotes and the Yty tokens change value.
   */
  palette?: YtyPalette;
}) {
  return (
    <>
      <HomeHeroSection palette={palette} />
      <HomeFeaturesSection palette={palette} />
      <HomeHowItWorksSection palette={palette} />

      <HomeCtaSection palette={palette} />
    </>
  );
}
