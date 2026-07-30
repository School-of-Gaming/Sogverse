import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Cpu,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { RobloxHero } from "@/components/roblox/roblox-hero";
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

// Six reasons, in the order they were signed off, filling an even 2 x 3 grid.
// Rows pair as skills+people, portfolio+recognised, fun+safety.
const whyIcons = [Cpu, Users, FolderOpen, Trophy, Sparkles, ShieldCheck];
const whyKeys = [
  "skills",
  "people",
  "portfolio",
  "recognised",
  "fun",
  "safe",
] as const;

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
      <RobloxHero />

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

      {/* How it works — ahead of the events list, so a reader knows what the
          four steps are before meeting the thing they take those steps on. */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
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
        </div>
      </section>

      <UpcomingEvents />

      {/* Why join — after the events, where it answers the hesitation a reader
          has once they have seen what is actually on offer. */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t("why.eyebrow")}</Eyebrow>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("why.heading")}
            </h2>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2">
            {reasons.map((reason) => (
              <Card key={reason.key} className="bg-card/50">
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

      {/* For parents */}
      {/* Plain ground, not the tinted one it used to sit on: "Why join" now runs
          directly above it, and two tinted bands in a row read as a single
          section with a stray heading in the middle. */}
      <section className="py-16 sm:py-24">
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
