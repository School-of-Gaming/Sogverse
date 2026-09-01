import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Shield, Users, Sparkles, Gamepad2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeCtaLink } from "@/components/home/cta-link";
import { ROUTES } from "@/lib/constants";

const featureIcons = [Gamepad2, Sparkles, Users, Shield];
const featureKeys = ["minecraftClubs", "screenTime", "newFriends", "parents"] as const;

type FeatureKey = (typeof featureKeys)[number];

/* ------------------------------------------------------------------ */
/*  The brand palette on the home page                                  */
/* ------------------------------------------------------------------ */

/**
 * The page's colour, as ruled (owner, 2026-09-01).
 *
 * The home page is a marketing surface and the Guidebook's colour rationing
 * puts marketing on the side that welcomes the full palette. The question the
 * design pass asked was not *whether* pink, green, orange and blue reach into
 * this page but *how far*, and the answer is **accented**: one element family
 * per feature card as a tinted tile, and the palette on the three how-it-works
 * circles. Nothing else moves. (There is no Yty section here to fence them
 * into — the elements are explained on `/about`.)
 *
 * Three rules hold the rest of the page still, and each is why a construct that
 * used to be proposed here is absent:
 *
 * - **The hero is today's, exactly** ("let's keep the current yellow and purple
 *   gradient"): the amber→violet band and the amber/violet headline chunks, in
 *   the settled Poppins. The band is one of two sanctioned exceptions to the
 *   flat-gradient default — a pre-existing identity moment, not a licence.
 * - **No surface is a washed brand colour.** A brand hue at low alpha over the
 *   near-black ground composites into a darker colour that is no longer the
 *   brand's, so every ground here is neutral (`background`, `card`, `muted`)
 *   and the brand arrives at authored strength: solid fills, ink, full-value
 *   edges. A brand colour *accenting an icon* is a different construct and is
 *   ruled tinted, with the constraint that the tint never escapes into a card
 *   surface. The glow card-lift was tried and dropped — feature cards carry no
 *   family edge and no glow.
 * - **The closing CTA is today's card, exactly**, the second sanctioned keep.
 *
 * Every pairing here is script-measured (`node scripts/yty-contrast.mjs` for the
 * palette's own numbers; the composites are recorded per slot below). The split
 * is the one the Yty element map follows: soft carries text and glyphs, strong
 * carries fills and edges.
 *
 * Classes are literal strings because Tailwind scans source text — a templated
 * `bg-yty-${id}-strong/10` emits a class name with no rule behind it.
 */
interface FeatureAccent {
  /** The 48px icon tile: its wash and its border. */
  tile: string;
  /** The 24px glyph inside it. Soft, always — 3:1 is the bar and soft clears 5.6–7.5. */
  glyph: string;
}

/**
 * One element family per feature card, in the palette's display order —
 * harmony pink, glow green, valor orange, wit blue — so the four cards echo the
 * Four Yty-Elements without a word of copy saying so.
 *
 * The tile's own edge is drawn at **full value** — the owner chose the coloured
 * column knowing it held colour ("I want the icon's border to have color"). The
 * `/30` edge it replaced was the one part of this construct the shading rule
 * bound: the tint ground is the ruled exemption, a mixed-down edge never was.
 *
 * Measured on the composited card ground (`bg-card/50` over the page is
 * `#161616`): the soft glyph reads 6.60–7.49 over its tint, against a 3:1 bar
 * for a 24px icon.
 */
const FEATURE_ACCENTS: Record<FeatureKey, FeatureAccent> = {
  minecraftClubs: {
    tile: "border-yty-harmony-strong bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
  },
  screenTime: {
    tile: "border-yty-glow-strong bg-yty-glow-strong/10",
    glyph: "text-yty-glow-soft",
  },
  newFriends: {
    tile: "border-yty-valor-strong bg-yty-valor-strong/10",
    glyph: "text-yty-valor-soft",
  },
  parents: {
    tile: "border-yty-wit-strong bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
  },
};

/**
 * The settled type.
 *
 * The pixel display face is gone from the whole product and every site it held
 * is re-set in Poppins at the Guidebook's own scale (A.3: H1 48–56px / 600 /
 * 1.1, H2 ~36px / 600 / 1.2); headings are SemiBold 600 rather than the
 * habitual 700. The CTA row's 16px / 600 lives in the shared button recipe, so
 * nothing on this page states it.
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

/**
 * The three numbered circles, in order.
 *
 * Harmony, glow and wit — valor is deliberately *not* among them, because an
 * orange circle next to the amber CTA is the same collision the whole pass
 * exists to remove.
 *
 * Ink on the fill, uniformly, so three sibling circles carry one ink colour:
 * harmony-strong 6.11:1, glow-strong 6.63:1, wit-soft 8.10:1, against a 4.5:1
 * bar (the numeral is 24px bold, so WCAG would allow 3:1 — the stricter bar is
 * taken because there was a variant that met it).
 *
 * **Wit is the one circle drawn in the soft variant, and that is the measured
 * answer, not a slip.** Ink on wit-*strong* is 4.10:1, under the bar; the
 * alternative that keeps the strong fill is white text at 4.57:1, which clears
 * by seven hundredths *and* puts a second ink colour in a run of three. Soft
 * clears by a mile and keeps the run uniform, so the fill strength gives way
 * rather than the ink.
 */
const STEP_CIRCLES: readonly [string, string, string] = [
  "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background",
  "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background",
  "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background",
];

/* ------------------------------------------------------------------ */
/*  The page's four colour-bearing sections                            */
/* ------------------------------------------------------------------ */

function HomeHeroSection() {
  const t = useTranslations('home');
  const c = useTranslations('common');

  return (
    // The amber→violet band is the first of the two sanctioned keeps: a
    // pre-existing identity moment the owner ruled kept exactly as it is, and
    // the one exception to the flat-gradient default. Not a licence for new
    // washes elsewhere.
    <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
      <div className="container mx-auto px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className={HERO_TITLE_TYPE}>
            {t.rich('hero.title', {
              br: () => <br />,
              primary: (chunks) => <span className="text-primary">{chunks}</span>,
              secondary: (chunks) => <span className="text-secondary">{chunks}</span>,
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

function HomeFeaturesSection() {
  const t = useTranslations('home');

  const features = featureKeys.map((key, i) => ({
    key,
    title: t(`features.${key}.title`),
    description: t(`features.${key}.description`),
    icon: featureIcons[i],
  }));

  return (
    <section className="container mx-auto px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className={SECTION_HEADING_TYPE}>
          {t('features.heading')}
        </h2>
        <p className="mt-4 text-muted-foreground">
          {t('features.subheading')}
        </p>
      </div>
      {/* The tinted tile is the shading rule's one standing exemption (owner,
          2026-09-01) — a brand colour lighting a 48px glyph is not a colour
          painted as a card's ground, which is what the rule is aimed at. The
          card behind it stays neutral, which is the constraint that exemption
          came with. */}
      <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.key} className="bg-card/50">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${FEATURE_ACCENTS[feature.key].tile}`}>
                  <feature.icon className={`h-6 w-6 ${FEATURE_ACCENTS[feature.key].glyph}`} />
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

function HomeHowItWorksSection() {
  const t = useTranslations('home');

  return (
    <section className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className={SECTION_HEADING_TYPE}>
            {t('howItWorks.heading')}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t('howItWorks.subheading')}
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
          <div className="text-center">
            <div className={STEP_CIRCLES[0]}>
              1
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step1.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('howItWorks.step1.description')}
            </p>
          </div>
          <div className="text-center">
            <div className={STEP_CIRCLES[1]}>
              2
            </div>
            <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step2.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('howItWorks.step2.description')}
            </p>
          </div>
          <div className="text-center">
            <div className={STEP_CIRCLES[2]}>
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

function HomeCtaSection() {
  const t = useTranslations('home');
  const c = useTranslations('common');

  return (
    <section className="container mx-auto px-4 py-24">
      {/* The amber→violet wash is the second of the two sanctioned keeps (the
          hero band is the first): a pre-existing identity moment the owner
          ruled kept exactly as it is, not a licence for new washes. */}
      <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <h2 className={CTA_HEADING_TYPE}>
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
 *
 * The four sections above are local to this file. They were exported for a
 * review deck that rendered them inline, one dose beside another; the deck is
 * gone and the doses collapsed to one, so the page composes them and nothing
 * outside names them. They live in one file rather than four because they are
 * one page's sections, not a component library.
 */
export function HomePageBody() {
  return (
    <>
      <HomeHeroSection />
      <HomeFeaturesSection />
      <HomeHowItWorksSection />
      <HomeCtaSection />
    </>
  );
}
