import type { Metadata } from "next";
import Link from "next/link";
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
import { ROUTES } from "@/lib/constants/routes";
import { RobloxHero } from "@/components/roblox/roblox-hero";
import { ProgrammeCta } from "@/components/roblox/programme-cta";
import { UpcomingEvents } from "@/components/roblox/upcoming-events";
import { ROBLOX_OG_DESCRIPTION, ROBLOX_OG_TITLE } from "./metadata-copy";

export function generateMetadata(): Metadata {
  return {
    // French for every locale, and absolute so the `%s | School of Gaming`
    // template in the root layout does not append anything to it: this is the
    // string a recipient sees on the preview card, and it has to be exactly the
    // one that was signed off. `metadata-copy.ts` next door explains why the
    // programme's card does not follow the viewer's locale; `openGraph` and
    // `twitter` restate both fields rather than inheriting, so the card cannot
    // drift from the tab.
    title: { absolute: ROBLOX_OG_TITLE },
    description: ROBLOX_OG_DESCRIPTION,
    // `type` and `siteName` are restated, not inherited, and `card` with them:
    // Next *assigns* a child's `openGraph` and `twitter` blocks over the
    // parent's rather than merging them, so declaring either block at all
    // discards every key the root set. Omitting these three would silently drop
    // `og:type`, `og:site_name` and `twitter:card` from exactly the page that
    // exists to be shared by URL. They are verbatim copies of the root layout's
    // values, not a second decision — the repetition is what Next's merge
    // costs, so keep them in step. The same restatement is documented at length
    // in `src/lib/products/product-metadata.ts`.
    //
    // **No `images` in either block** — deliberately absent rather than
    // `undefined`. The file-based `opengraph-image.tsx` next door is only merged
    // in when the child's `openGraph` has no own `images` property, and
    // `{ images: undefined }` has one; spelling it out would leave this page
    // with no card image whatsoever.
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      title: ROBLOX_OG_TITLE,
      description: ROBLOX_OG_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: ROBLOX_OG_TITLE,
      description: ROBLOX_OG_DESCRIPTION,
    },
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

  // The Programme's own legal documents, in the order a family meets them:
  // what you are agreeing to, how your child is kept safe, what happens to your
  // information. This footer is the only link to any of them while the whole
  // Programme surface is unpublished.
  const programmeDocuments = [
    { href: ROUTES.robloxTerms, label: t("legal.terms") },
    { href: ROUTES.robloxSafeguarding, label: t("legal.safeguarding") },
    { href: ROUTES.robloxPrivacy, label: t("legal.privacy") },
  ];

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

      <ProgrammeCta />

      {/* Trademark attribution. Required wherever the Roblox mark appears, and
          the courteous equivalent for Lynx. Small and quiet, but on the page —
          alongside the Programme's own legal documents, which are linked from
          here and nowhere else while the whole surface stays unpublished. */}
      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto max-w-3xl space-y-2 border-t pt-8 text-xs leading-relaxed text-muted-foreground/70">
          <p>{t("legal.roblox")}</p>
          <p>{t("legal.lynx")}</p>
          {/* A step more present than the trademark boilerplate above — a
              parent looking for the terms has to be able to find them. Still
              quiet (muted, not primary): three primary-coloured rows would
              shout from the bottom of the page. */}
          <div className="space-y-1.5 pt-4 text-sm text-muted-foreground">
            {programmeDocuments.map((document) => (
              <p key={document.href}>
                <Link
                  href={document.href}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {document.label}
                </Link>
              </p>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
