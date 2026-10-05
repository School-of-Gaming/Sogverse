import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from 'next-intl';
import { getLocale } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import {
  ArrowRight,
  Check,
  Gamepad2,
  KeyRound,
  MessageSquareOff,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  UsersRound,
  VideoOff,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroBackdrop } from "@/components/home/hero-backdrop";
import { MarketingPhoto } from "@/components/marketing/marketing-photo";
import clubPhoto from "@/assets/marketing/club-lauttasaari.jpg";
import { Testimonial } from "@/components/home/testimonial";
import {
  featureTestimonialKey,
  rowTestimonialKeys,
  safetyTestimonialKeys,
} from "@/components/home/testimonial-keys";
import { ROUTES, resolveLocale } from "@/lib/constants";
import { spokenLanguagesPhrase } from "@/lib/i18n/spoken-languages-phrase";
import { cn } from "@/lib/utils";

/**
 * The home page states no title or description of its own — it inherits the
 * root layout's, which are the site's. What it does need is what a layout
 * cannot emit: its own `hreflang` set and a canonical pointing at itself.
 */
export async function generateMetadata(): Promise<Metadata> {
  return localizedPageMetadata("/", await getLocale());
}

const featureIcons = [Gamepad2, Sparkles, Users, Shield];
const featureKeys = ["minecraftClubs", "screenTime", "newFriends", "parents"] as const;

/**
 * The safety facts, in the order a parent asks them: who is with my child,
 * who can reach them, where, what is kept, and what they can spend. Each one
 * is checked against the About FAQ answer and the code before it is written —
 * `src/CLAUDE.md`, "Safety copy: mechanisms, never intentions". Four are
 * mechanisms the product enforces. The record check is not: certification does
 * not wait on it, so that fact is worded as the requirement it is, never as an
 * outcome every Gedu has met.
 */
const safetyFacts = [
  { key: "vetted", icon: ShieldCheck },
  { key: "noDirectMessages", icon: MessageSquareOff },
  { key: "groupOnlyRooms", icon: UsersRound },
  { key: "notRecorded", icon: VideoOff },
  { key: "parentPin", icon: KeyRound },
] as const;

const trustKeys = ["cancel", "guarantee"] as const;

/**
 * Every call to action on this page goes to the shop, not to signup, and
 * unfiltered: clubs lead its list anyway, and a parent scrolling on meets the
 * camps and events without touching a filter.
 */
const findClubHref = ROUTES.shop;

/**
 * The risk reversal under each "Find a club": cancel any time, and the 30-day
 * money-back guarantee. Both are promises the About FAQ's billing and
 * cancellation answers make for every club, and this line may say no more
 * than they do.
 */
function TrustLine({ className }: { className?: string }) {
  const t = useTranslations('home.trust');
  return (
    <ul className={cn("flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground", className)}>
      {trustKeys.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-act" />
          {t(key)}
        </li>
      ))}
    </ul>
  );
}

export default function HomePage() {
  const t = useTranslations('home');
  const locale = resolveLocale(useLocale());

  const features = featureKeys.map((key, i) => ({
    key,
    title: t(`features.${key}.title`),
    description: t(`features.${key}.description`),
    icon: featureIcons[i],
  }));

  return (
    <>
      {/* Hero Section */}
      {/* The hero sits on the page ground and marks itself with one world
          rule under the headline. It used to carry a two-hue wash — act at
          20% blended into world at 10% under a vertical fade — and a brand
          colour is never blended into another and never starts at a lower
          alpha: what that painted was two colours neither of which was ours.
          The rule is world at its authored value, which is the display and
          identity colour, and it is the whole of the colour the hero spends
          besides the headline's one act phrase and the act call to action.

          The headline is the library's declared departure from "anything a
          reader reads through is ink" (`brand.ts`, beside the label rule): a
          public page's hero headline sits between artwork and a heading, so
          the payoff phrase is drawn in act, the rest in ink, and the world
          rule beneath carries the second colour. The OG card draws the same
          three things, so a share and the page it lands on say one thing.

          **The call to action and the trust line must fit a 390×844 phone's
          first screen**, banner aside. That is what the phone's tighter top
          padding and smaller subhead are buying; judge any change here at
          that size before anything else.

          Behind it all runs the "Calm" loop under the scrim (`HeroBackdrop`).
          The backdrop takes the hero's box and never sizes it, so the text
          still decides the hero's height and the first-screen budget above is
          unchanged. Over it, every word is in the foreground ink: the quiet
          ink falls short of AA over the loop's brightest frames, the
          foreground ink and the act phrase do not. */}
      <section className="relative -mt-[var(--header-height)] overflow-hidden pt-[var(--header-height)]">
        <HeroBackdrop />
        <div className="container relative mx-auto px-4 pb-16 pt-8 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            {/* The wrapper shrinks to the headline's longest line, so the rule
                beneath it runs exactly the headline's measure with nothing
                measured at runtime. */}
            <div className="inline-block">
              <h1 className="text-h1-mobile font-bold tracking-tight md:text-6xl">
                {t.rich('hero.title', {
                  br: () => <br />,
                  act: (chunks) => <span className="text-act">{chunks}</span>,
                })}
              </h1>
              <span className="mt-5 block h-1.5 w-full rounded-full bg-world sm:mt-8" />
            </div>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-foreground sm:mt-6 sm:text-lg sm:leading-8">
              {t('hero.subtitle')}
            </p>
            {/* One call to action: the home page's job is to send a parent to
                choose a club, and the shop is public. It is the same link for
                every reader, signed in or not, so the trust line under it is
                always true of the button it sits under. */}
            <div className="mt-7 flex justify-center sm:mt-10">
              <Link
                href={findClubHref}
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                {t('findClub')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <TrustLine className="mt-4 text-foreground" />
          </div>
        </div>
      </section>

      {/* The emotional proof: one parent's words, large, straight after the
          offer. No heading — the quote is the section. Its top padding is
          the room between the quote and the hero backdrop's lower edge. */}
      <section className="container mx-auto px-4 py-16 sm:pb-24">
        <Testimonial
          size="feature"
          quote={t(`testimonials.items.${featureTestimonialKey}.quote`)}
          attribution={t(`testimonials.items.${featureTestimonialKey}.attribution`)}
          className="mx-auto max-w-3xl"
        />
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('features.heading')}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {t('features.subheading')}
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
          {features.map((feature) => (
            <Card key={feature.key}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-act bg-lifted">
                    <feature.icon className="h-6 w-6 text-act" />
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

      {/* Safety: checkable facts, then two parents saying what they saw.
          A trust-building section on a parent surface spends act alone —
          never world (`packages/sog-ui/CLAUDE.md`, the colour budget).

          The club photo is the first thing under the heading on a phone and
          heads the right-hand column on a wide screen, beside the facts: a
          parent reading who is with their child sees the room it happens in.
          The DOM order is the phone's; the wide layout places the three by
          grid position, so the facts span both rows of the left column. */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t('safety.heading')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-12 lg:mt-16 lg:grid-cols-[3fr_2fr] lg:gap-x-16 lg:gap-y-10">
          <MarketingPhoto
            image={clubPhoto}
            alt={t('safety.photo.alt')}
            caption={t('safety.photo.caption')}
            sizes="(min-width: 1024px) 384px, min(calc(100vw - 2rem), 576px)"
            className="mx-auto w-full max-w-xl lg:col-start-2 lg:row-start-1 lg:max-w-none"
          />
          <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <ul className="space-y-6">
              {safetyFacts.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-act bg-lifted">
                    <Icon aria-hidden="true" className="h-5 w-5 text-act" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t(`safety.facts.${key}.title`)}</h3>
                    <p className="mt-1 text-muted-foreground">
                      {t(`safety.facts.${key}.description`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href={{ pathname: ROUTES.about, hash: "faq" }}
              className="mt-8 inline-flex items-center gap-2 font-semibold text-act underline-offset-4 hover:underline"
            >
              {t('safety.faqLink')}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex flex-col gap-10 lg:col-start-2">
            {safetyTestimonialKeys.map((key) => (
              <Testimonial
                key={key}
                quote={t(`testimonials.items.${key}.quote`)}
                attribution={t(`testimonials.items.${key}.attribution`)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* More parents: joy, a child for whom large groups are hard, and
          language. The quotes are peers with no action of their own, so they
          sit on the page ground under one heading rather than in cards. */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t('testimonials.heading')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-10 md:grid-cols-3 lg:mt-16">
          {rowTestimonialKeys.map((key) => (
            <Testimonial
              key={key}
              quote={t(`testimonials.items.${key}.quote`)}
              attribution={t(`testimonials.items.${key}.attribution`)}
            />
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="bg-card py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t('howItWorks.heading')}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t('howItWorks.subheading')}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-act text-2xl font-bold text-act-foreground">
                1
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step1.title')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('howItWorks.step1.description')}
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-world text-2xl font-bold text-world-foreground">
                2
              </div>
              <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step2.title')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('howItWorks.step2.description')}
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-act text-2xl font-bold text-act-foreground">
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

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <Card className="relative mx-auto max-w-3xl overflow-hidden">
          {/* The card is the plain card ground with one world rule along its
              top edge — the hero's construct, so the page opens and closes on
              the same idea. It used to be washed act-to-world; two brand
              colours blended into each other is a smear, and act here would
              only repeat the colour of the button inside the card. */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-world" />
          <CardContent className="flex flex-col items-center py-12 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              {t('cta.heading')}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t('cta.subheading')}
            </p>
            {/* The page closes on the hero's own call to action and its trust
                line, so the two ends of the page ask for the same thing. */}
            <div className="mt-8 flex justify-center">
              <Link
                href={findClubHref}
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                {t('findClub')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <TrustLine className="mt-4" />
            {/* The card signs off below the button with where we are: a plain
                fact a search engine or an assistant can quote (clubs online in
                the spoken languages we deliver in, for families anywhere), then
                a smile about our "global headquarters" being a small office in
                Helsinki, Finland. The joke is about the company's office, never
                about where clubs are run from: Gedus are not all there. It sits after
                the ask so the card reads as one pitch rather than two stacked
                paragraphs, and it matches the subheading's size and ink so it
                reads as the same voice. The measure is narrowed and balanced
                so centred lines stay even. The language list is derived, never
                written into the copy, because it grows as we expand. */}
            <p className="mx-auto mt-8 max-w-xl text-balance text-muted-foreground">
              {t('cta.whereWeAre', { languages: spokenLanguagesPhrase(locale) })}
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
