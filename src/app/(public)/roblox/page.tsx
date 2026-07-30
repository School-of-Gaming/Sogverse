import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { ArrowRight, Cpu, ShieldCheck, Sparkles, Trophy, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PartnerLockup } from "@/components/roblox/partner-lockup";
import { PartnershipCta } from "@/components/roblox/partnership-cta";
import { UpcomingEvents } from "@/components/roblox/upcoming-events";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("roblox"),
    // Copy is still pending SOG and Roblox signoff, so the page is shared by URL
    // rather than published. This tag is what actually keeps it out of search
    // results; the route is deliberately absent from sitemap.ts and has no nav
    // link anywhere.
    //
    // Note it is NOT disallowed in robots.txt, which would be the intuitive move
    // and is the wrong one: a disallowed URL is never fetched, so the crawler
    // never reads this tag, and the URL can still be indexed bare off an
    // external link. Disallow also publishes the path to anyone who reads
    // robots.txt. Allowing the crawl and serving noindex is what deindexes.
    robots: { index: false, follow: false },
  };
}

const whyIcons = [Cpu, Users, Trophy, Sparkles, ShieldCheck];
const whyKeys = ["skills", "people", "recognised", "fun", "safe"] as const;

const stepKeys = ["step1", "step2", "step3", "step4"] as const;

/** Small uppercase section label — the [WHAT IS THIS] / [WHY JOIN] markers. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-primary">
      {children}
    </p>
  );
}

export default function RobloxPage() {
  const t = useTranslations("roblox");

  const reasons = whyKeys.map((key, i) => ({
    key,
    title: t(`why.${key}.title`),
    description: t(`why.${key}.description`),
    icon: whyIcons[i],
  }));

  const steps = stepKeys.map((key, i) => ({
    key,
    number: i + 1,
    title: t(`how.${key}.title`),
    description: t(`how.${key}.description`),
  }));

  return (
    <>
      {/* Hero — mirrors the home page's treatment (pulled up under the
          translucent header, with the same two-stop brand gradient) so the
          programme page reads as part of the same site rather than a microsite
          bolted on. */}
      <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
        <div className="container mx-auto px-4 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            {/* Deliberately *not* `font-display` (Press Start 2P). The pixel
                face is the right voice for the home page's playful promise, but
                here it fights the page's job: this is the surface where three
                organisations put their names to something, and a pixel headline
                sitting above three corporate wordmarks reads as a novelty
                rather than as credibility. Inter at a large tight-tracked size
                carries the same warmth in the words without undercutting them.
                `text-balance` evens the line lengths, which is why there is no
                hand-placed <br /> in the copy. */}
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              {t.rich("hero.title", {
                primary: (chunks) => <span className="text-primary">{chunks}</span>,
                secondary: (chunks) => (
                  <span className="text-secondary">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              {t("hero.subtitle")}
            </p>
            {/* Every CTA on this page is an inert <button>, not a link. The
                storefront cannot express this programme yet — `product_topic`
                has no `roblox` member, and the 15–18 age target exceeds
                MAX_PRODUCT_AGE — so any href would land on an empty shop. A
                real destination arrives with the products; until then the
                buttons exist to be judged as design, and going nowhere is
                honest where a wrong destination would not be. */}
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                className={buttonVariants({ size: "lg", className: "gap-2" })}
              >
                {t("hero.cta")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* The lockup sits directly under the hero: it is what makes the free
              programme above credible, so it lands above the fold rather than
              being buried as a footer strip. A hairline rule separates it from
              the copy instead of a card, so the marks read as part of the hero
              rather than as a widget. */}
          <div className="mx-auto mt-16 max-w-2xl border-t pt-12">
            <PartnerLockup />
          </div>
        </div>
      </section>

      {/* What is this */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <Eyebrow>{t("what.eyebrow")}</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("what.heading")}
          </h2>
          <div className="mt-8 space-y-6 text-lg leading-8 text-muted-foreground">
            <p>{t("what.paragraph1")}</p>
            <p>{t("what.paragraph2")}</p>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t("why.eyebrow")}</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("why.heading")}
            </h2>
          </div>
          {/* Five items in a two-column grid leaves a lone card on the last row;
              the last one spans both columns so the block ends square rather
              than lopsided. */}
          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2">
            {reasons.map((reason, i) => (
              <Card
                key={reason.key}
                className={
                  i === reasons.length - 1 ? "bg-card/50 sm:col-span-2" : "bg-card/50"
                }
              >
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <reason.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{reason.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {reason.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>{t("how.eyebrow")}</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("how.heading")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("how.subheading")}</p>
        </div>
        <div className="mx-auto mt-14 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <div key={step.key} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                {step.number}
              </div>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <UpcomingEvents />

      {/* For parents */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>{t("parents.eyebrow")}</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("parents.heading")}
            </h2>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              {t("parents.body")}
            </p>
            <button
              type="button"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "mt-8 gap-2",
              })}
            >
              {t("parents.cta")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <PartnershipCta />

      {/* Trademark attribution. Required wherever the Roblox mark appears, and
          the courteous equivalent for Lynx. Small and quiet, but on the page. */}
      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto max-w-3xl space-y-2 border-t pt-8 text-xs leading-relaxed text-muted-foreground/70">
          <p>{t("legal.roblox")}</p>
          <p>{t("legal.lynx")}</p>
        </div>
      </section>
    </>
  );
}
