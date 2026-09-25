import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { useTranslations } from 'next-intl';
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
import { HomeCtaLink } from "@/components/home/cta-link";
import { Testimonial } from "@/components/home/testimonial";
import { ROUTES } from "@/lib/constants";
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
 * is a mechanism the About FAQ states and the product enforces — `src/CLAUDE.md`,
 * "Safety copy: mechanisms, never intentions" — so a new entry is checked
 * against the FAQ answer and the code before it is written, never the reverse.
 */
const safetyFacts = [
  { key: "vetted", icon: ShieldCheck },
  { key: "noDirectMessages", icon: MessageSquareOff },
  { key: "groupOnlyRooms", icon: UsersRound },
  { key: "notRecorded", icon: VideoOff },
  { key: "parentPin", icon: KeyRound },
] as const;

/** The quotes paired with the safety facts, and the row further down. */
const safetyTestimonialKeys = ["funAndSupervised", "positiveExperience"] as const;
const rowTestimonialKeys = ["sighWithHappiness", "largeGroups", "finnishImproved"] as const;

const trustKeys = ["cancel", "guarantee"] as const;

/** Every call to action on this page goes to the shop's clubs, not to signup. */
const findClubHref = ROUTES.shopBrowse("consumer_club");

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
          that size before anything else. */}
      <section className="relative -mt-[var(--header-height)] overflow-hidden pt-[var(--header-height)]">
        <div className="container mx-auto px-4 pb-16 pt-8 sm:py-24 lg:py-28">
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
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8">
              {t('hero.subtitle')}
            </p>
            {/* One call to action: the home page's job is to send a parent to
                choose a club, and the shop is public. A signed-in reader the
                server did not see gets the same button aimed at My SOG. */}
            <div className="mt-7 flex justify-center sm:mt-10">
              <HomeCtaLink
                signedOutHref={findClubHref}
                signedOutLabel={t('findClub')}
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                <ArrowRight className="h-4 w-4" />
              </HomeCtaLink>
            </div>
            <TrustLine className="mt-4" />
          </div>
        </div>
      </section>

      {/* The emotional proof: one parent's words, large, straight after the
          offer. No heading — the quote is the section. */}
      <section className="container mx-auto px-4 pb-16 sm:pb-24">
        <Testimonial
          size="feature"
          quote={t('testimonials.items.highlightOfTheWeek.quote')}
          attribution={t('testimonials.items.highlightOfTheWeek.attribution')}
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
          never world (`packages/sog-ui/CLAUDE.md`, the colour budget). */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {t('safety.heading')}
        </h2>
        <div className="mx-auto mt-12 grid max-w-5xl gap-12 lg:mt-16 lg:grid-cols-[3fr_2fr] lg:gap-16">
          <div>
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
          <div className="flex flex-col gap-10 lg:justify-center">
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
              <HomeCtaLink
                signedOutHref={findClubHref}
                signedOutLabel={t('findClub')}
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                <ArrowRight className="h-4 w-4" />
              </HomeCtaLink>
            </div>
            <TrustLine className="mt-4" />
          </CardContent>
        </Card>
      </section>
    </>
  );
}
