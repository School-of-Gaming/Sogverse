import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Shield, Users, Sparkles, Gamepad2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeCtaLink } from "@/components/home/cta-link";
import { ROUTES } from "@/lib/constants";
import type { YtyPalette } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

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
/*  Design-pass draft — the brand palette across the home page          */
/* ------------------------------------------------------------------ */

/**
 * **Design-pass draft. Read only on the two `brand*` paths, which no live route
 * takes.**
 *
 * The home page is a marketing surface, and the Guidebook's own colour
 * rationing puts marketing on the side that welcomes the full palette — so the
 * question this draft exists to answer is not *whether* pink, green, orange and
 * blue reach into this page but *how far*. (There is no Yty section here to
 * fence them into: the elements are explained on `/about`.) Two doses, drawn as
 * two scenarios, because a page cannot be seen at two doses at once:
 *
 * - **`brand`** — accents, and the ruled dose for the whole page
 *   (2026-09-01): one element family per feature card as a tinted tile, and
 *   the palette on the three how-it-works circles. Nothing else moves.
 * - **`brand-lively`** — retired. Every construct it proposed was ruled out;
 *   its key mirrors `brand` so any straggler link renders the ruling, and its
 *   scenario row is gone from the scene registry. Promotion deletes both keys
 *   with the map.
 *
 * **The hero is settled and identical in every scenario** (owner ruling,
 * 2026-09-01): today's amber→violet band and today's amber/violet headline
 * chunks stay, with the settled Poppins type. The band is the one sanctioned
 * exception to both rules below — a pre-existing identity moment the owner
 * keeps, not a new construct these drafts may imitate.
 *
 * **Both doses are flat, and that is the default rather than a variant.**
 * Brand-hue gradients are a Sogverse invention rather than a Guidebook construct
 * — a crutch from the two-colour era, when amber and violet were the only hues
 * there were and a third thing to label had to be given a mix of them — and the
 * owner's direction is that a blend smears colours this palette no longer needs
 * smeared. A gradient now needs a case made for it site by site; the hero's
 * band made its case and won, and the dusk-sky candidate died with the hero
 * ruling.
 *
 * **And no surface is a washed brand colour** (owner ruling, 2026-09-01). A
 * brand hue at low alpha over the near-black ground composites into a darker
 * colour that is no longer the brand's — muted, dim, washed out — so every
 * *new* surface here is neutral (`background`, `card`, `muted`) and the brand
 * arrives at authored strength: solid fills, ink. Retired under this rule:
 * the 16% harmony radial an accented draft briefly tried, the lively
 * how-it-works band, and both drafts' CTA-card washes. The two sanctioned
 * keeps — the hero band and the closing CTA card, both today's live washes —
 * are pre-existing identity moments the owner kept, not licences for new
 * ones. A brand colour *accenting an icon* is a different construct (owner:
 * the voice-zone tiles' effect) and is ruled **tinted**, with the owner's
 * constraint that the tinted colours never escape into card surfaces. The
 * glow card-lift idea was tried on the deck and **dropped** — feature cards
 * carry no family edge and no glow.
 *
 * **Amber stays the identity mark and the CTA colour in both.** It is the
 * ambient atmosphere the drafts give up, not the button.
 *
 * **Both doses carry the settled type, so colour is judged on the type it will
 * live with.** The type is identical in the two of them — see
 * `HERO_TITLE_TYPE` below — so nothing about the dose comparison is a type
 * comparison.
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
 * **This set is final** (owner rulings, 2026-09-01). The dose is accented —
 * the lively variant (a /25 family card edge, tiles tinted twice as strong) is
 * dead, so both scenario keys share this one ruled set. The tile face-off went
 * to **tinted**, with the owner's constraint that the tinted colours never
 * escape into card *surfaces* — the tint is a 48 px icon accent, the
 * voice-zone tiles' own effect, and the card ground stays neutral. And the
 * glow card-lift was **dropped** ("let's drop the glow effect"), so the card
 * carries no family edge and no glow: neutral ground, tinted tile, soft glyph.
 *
 * The tile's own edge is drawn at **full value** — the owner chose the coloured
 * column knowing it held colour ("I want the icon's border to have color"). The
 * `/30` edge it replaces was the one part of this construct the shading rule
 * bound: the tint ground is the ruled exemption, a mixed-down edge never was.
 *
 * Measured on the composited card ground (`bg-card/50` over the page is
 * `#161616`): the soft glyph reads 6.60–7.49 over its tint, against a 3:1 bar
 * for a 24 px icon.
 */
const FEATURE_ACCENTS_RULED: Record<FeatureKey, FeatureAccent> = {
  minecraftClubs: {
    card: "bg-card/50",
    tile: "border-yty-harmony-strong bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
  },
  screenTime: {
    card: "bg-card/50",
    tile: "border-yty-glow-strong bg-yty-glow-strong/10",
    glyph: "text-yty-glow-soft",
  },
  newFriends: {
    card: "bg-card/50",
    tile: "border-yty-valor-strong bg-yty-valor-strong/10",
    glyph: "text-yty-valor-soft",
  },
  parents: {
    card: "bg-card/50",
    tile: "border-yty-wit-strong bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
  },
};

const FEATURE_DRAFT_ACCENTS: Record<
  HomeDraftPalette,
  Record<FeatureKey, FeatureAccent>
> = {
  brand: FEATURE_ACCENTS_RULED,
  "brand-lively": FEATURE_ACCENTS_RULED,
};

/**
 * Every non-feature slot the draft repaints, per dose. Internal to this file:
 * the dusk-hero exhibit that used to construct one from the deck died with the
 * hero ruling (today's band stays), so nothing outside builds these any more.
 */
interface HomeDraftClasses {
  /** The hero `<section>`, whose background is the page's one big gradient. */
  hero: string;
  /** The hero `<h1>`, at the Guidebook's H1: Poppins 56px / 600 / 1.1. */
  heroTitle: string;
  /** The `<primary>` chunk of the hero headline. */
  heroPrimary: string;
  /** The `<secondary>` chunk of the hero headline. */
  heroSecondary: string;
  /** The features and how-it-works `<h2>`s, at the Guidebook's H2. */
  sectionHeading: string;
  /** The closing card's `<h2>`, one step down from the section headings. */
  ctaHeading: string;
  /**
   * The type every button on the page wears: Poppins 16px / 600, the
   * Guidebook's CTA row. Merged over the shared recipe's own `text-sm
   * font-medium` rather than replacing it, so only the type moves.
   */
  ctaType: string;
  /** The how-it-works band. */
  howItWorksSection: string;
  /** The three numbered circles, in order. */
  stepCircles: readonly [string, string, string];
  /** The closing CTA card. */
  ctaCard: string;
  /** A palette rule under a section heading, or `null` where the dose has none. */
  sectionRule: string | null;
}

/**
 * The settled type, one copy for both doses **and for the live path** — the
 * type is no longer a draft axis, so the `draft ?` ternaries below reach for
 * these same constants on either side and only colour still differs.
 *
 * The pixel display face is gone from the whole product and every site it held
 * is re-set in Poppins at the Guidebook's own scale (A.3: H1 48–56px / 600 / 1.1,
 * H2 ~36px / 600 / 1.2), headings are SemiBold 600 rather than the habitual
 * 700, and the CTA row is 16px / 600. The doses differ in colour and in nothing
 * else, so the type lives here rather than being written twice.
 *
 * **The mobile step is 30px, not the Guidebook's own H1.** 48–56px is a desktop
 * figure and the floor is 360px, which leaves 328px of hero. The widest line
 * any locale sets is French's "Du temps d'écran" — 16 characters, ~0.55em of
 * Poppins SemiBold advance apiece — so 30px sets it in ~264px on one line and
 * 36px would already be inside a character of the edge.
 */
const HERO_TITLE_TYPE = "font-sans text-3xl font-semibold leading-[1.1] md:text-[56px]";
const SECTION_HEADING_TYPE =
  "text-3xl font-semibold leading-[1.2] tracking-tight sm:text-4xl";
const CTA_HEADING_TYPE = "text-2xl font-semibold leading-[1.2] sm:text-3xl";
const CTA_TYPE = "text-base font-semibold";

const HOME_DRAFT_CLASSES: Record<HomeDraftPalette, HomeDraftClasses> = {
  /**
   * Accents. The section grounds and the page's rhythm are untouched, and the
   * three circles take harmony, glow and wit — valor is deliberately *not*
   * among them, because an orange circle next to the amber CTA is the same
   * collision the whole pass exists to remove.
   *
   * **The hero is settled: today's, exactly** (owner ruling, 2026-09-01 —
   * "let's keep the current yellow and purple gradient"). Both doses draw the
   * live amber→violet band and the live amber/violet headline chunks, with
   * only the settled Poppins type swapped in — so the hero is identical
   * across every scenario and the doses differ from the hero down.
   */
  brand: {
    hero:
      "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]",
    heroTitle: HERO_TITLE_TYPE,
    heroPrimary: "text-primary",
    heroSecondary: "text-secondary",
    sectionHeading: SECTION_HEADING_TYPE,
    ctaHeading: CTA_HEADING_TYPE,
    ctaType: CTA_TYPE,
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
    /**
     * Settled: today's card, exactly (owner ruling, 2026-09-01 — "for the
     * closing CTA, let's keep what we have today"). The amber→violet wash is
     * the second sanctioned keep after the hero band: a pre-existing identity
     * moment, not a licence for new washes. Only the settled type differs.
     */
    ctaCard: "mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10",
    sectionRule: null,
  },

  /**
   * The marketing site's dose, read off the brand's own social imagery: white
   * headlines, harmony pink as the workhorse, glow green as the ink of the
   * payoff words, and amber spent only on the identity mark and the CTA — no
   * ambient amber at all.
   *
   * **Flat, like the accented dose, and this is where the flat default costs
   * something.** An earlier draft of this dose drew a dusk sky — two radial
   * glows, pink at 22% and blue at 18%, blended over the ground in imitation of
   * the brand's own social imagery. It is retired here with the rest of the
   * blends, and what replaces it is the flat `--background` the rest of the page
   * sits on. That alone reads as an unstyled page rather than a restrained one,
   * so one solid element closes the section: a 4 px harmony edge. It carries no
   * text and it is the whole of what was added. (The dusk sky is the one blend
   * still making a case for itself, because it imitates a photograph rather than
   * mixing two brand hues for want of a third — the walkthrough's gradient slide
   * draws it as an exhibit beside this, and the owner rules.)
   *
   * **Contrast: every pairing here is looser than the blended draft's.**
   * Removing colour from behind text can only help — the subtitle sits on the
   * plain page ground at 7.70:1 rather than on the dusk composite's 4.78:1, and
   * the CTA card's muted copy reads 6.39:1 against the three-stop card's 5.86:1.
   * The band is harmony at 10% over the page (muted foreground 6.87:1, full
   * foreground 14.29:1); the payoff words' glow-soft ink on the page ground is
   * 8.83:1; the section rule and the hero edge carry no text at all.
   */
  "brand-lively": {
    /** Today's hero, settled — same slot values as the accented dose above. */
    hero:
      "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]",
    heroTitle: HERO_TITLE_TYPE,
    heroPrimary: "text-primary",
    heroSecondary: "text-secondary",
    sectionHeading: SECTION_HEADING_TYPE,
    ctaHeading: CTA_HEADING_TYPE,
    ctaType: CTA_TYPE,
    /**
     * A neutral band — the harmony-at-10% wash it used to carry is the exact
     * construct the watered-surface ruling names, so the band's colour now
     * lives entirely in the three solid circles it holds.
     */
    howItWorksSection: "bg-muted/30 py-24",
    stepCircles: [
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background",
      "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background",
    ],
    /** Settled: today's card — same ruling and same value as the dose above. */
    ctaCard: "mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10",
    /**
     * The rule was the lively dose's last surviving construct, and it died
     * when the how-it-works section was ruled accented (owner, 2026-09-01) —
     * this key now renders identically to `brand`, and exists only because the
     * shared `YtyPalette` type still carries the value until promotion deletes
     * the whole map.
     */
    sectionRule: null,
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

/**
 * The shared button recipe, plus the draft's CTA type where a draft is in play.
 *
 * The recipe carries `text-sm font-medium` in its own base, so the settled 16px
 * / 600 has to be merged over it rather than appended — `cn`'s twMerge is what
 * resolves the pair. On the live path the recipe is returned untouched.
 */
function ctaClass(recipe: string, draft: HomeDraftClasses | null) {
  return draft ? cn(recipe, draft.ctaType) : recipe;
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
          <h1 className={draft ? draft.heroTitle : HERO_TITLE_TYPE}>
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
              className={ctaClass(
                buttonVariants({ variant: "outline", size: "lg" }),
                draft,
              )}
            >
              {t('hero.aboutCta')}
            </Link>
            <HomeCtaLink
              signedOutHref={ROUTES.register}
              signedOutLabel={c('getStarted')}
              className={ctaClass(
                buttonVariants({ size: "lg", className: "gap-2" }),
                draft,
              )}
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
        <h2 className={draft ? draft.sectionHeading : SECTION_HEADING_TYPE}>
          {t('features.heading')}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t('features.subheading')}
        </p>
        {/* No palette rule under this heading in any dose — the features
            section is ruled accented (owner, 2026-09-01), and the rule was the
            lively dose's construct. `sectionRule` stays a slot only for the
            how-it-works section, whose dose is still open. */}
      </div>
      {/* The live path's tile keeps its `bg-primary/10` ground: a chip-scale
          tile accenting an icon is the shading rule's one standing exemption
          (owner, 2026-09-01) — a brand colour lighting a 48px glyph is not a
          colour painted as a card's ground, which is what the rule is aimed at.
          The card behind it stays neutral, which is the constraint that
          exemption came with. */}
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
          <h2 className={draft ? draft.sectionHeading : SECTION_HEADING_TYPE}>
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
      {/* The amber→violet wash is the second of the two sanctioned keeps (the
          hero band is the first): a pre-existing identity moment the owner
          ruled kept exactly as it is, not a licence for new washes. */}
      <Card className={draft ? draft.ctaCard : "mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10"}>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className={draft ? draft.ctaHeading : CTA_HEADING_TYPE}>
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
              className={ctaClass(
                buttonVariants({ variant: "outline", size: "lg" }),
                draft,
              )}
            >
              {c('exploreClubs')}
            </Link>
            <HomeCtaLink
              signedOutHref={ROUTES.register}
              signedOutLabel={t('cta.createFreeAccount')}
              className={ctaClass(buttonVariants({ size: "lg" }), draft)}
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
