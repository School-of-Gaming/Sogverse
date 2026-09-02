import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
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
import { ProgrammeFaq } from "@/components/roblox/programme-faq";
import { UpcomingEventsSection } from "@/components/roblox/upcoming-events-section";
import { ROBLOX_OG_DESCRIPTION, ROBLOX_OG_TITLE } from "./metadata-copy";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    // The tab title follows the viewer's locale like every other page — the
    // page body is fully localised, and a tab is read by the viewer, not by a
    // share recipient. The FRENCH strings below are the *card's*: a preview
    // card is composed for the programme's French audience, and `openGraph`
    // and `twitter` carry them regardless of who shared the link.
    // `metadata-copy.ts` next door explains the deliberate French in full.
    title: t("roblox"),
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

type WhyKey = (typeof whyKeys)[number];

/**
 * The four steps wear the four tertiaries, in the home page's own order —
 * harmony, glow, wit, then valor for the fourth step home does not have. The
 * circles are a sequence, not four facts, so the colour is free and the
 * ensemble rule spends it evenly: one element family per step.
 *
 * **Valor is here and is deliberately absent from home's three.** There, an
 * orange circle sat a scroll away from the amber CTA the section exists to
 * feed; this band carries no button at all, and a fourth step needs a fourth
 * family rather than a repeat.
 *
 * **Wit is the one circle drawn soft, and that is the measured answer** (the
 * same one home's third circle takes): ink on wit-strong is 4.10:1, under the
 * 4.5:1 bar, while soft clears at 8.10 and keeps one ink colour across the run.
 * The other three on ink: harmony 6.11:1, glow 6.63:1, valor 6.69:1
 * (`node scripts/yty-contrast.mjs`).
 */
const STEP_CIRCLES: readonly [string, string, string, string] = [
  "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yty-harmony-strong text-xl font-bold text-background",
  "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yty-glow-strong text-xl font-bold text-background",
  "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yty-wit-soft text-xl font-bold text-background",
  "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yty-valor-strong text-xl font-bold text-background",
];

/**
 * One element family per reason, chosen by what the reason's own copy says —
 * the ruled accent tile (tint ground, full-value family edge, soft glyph),
 * replacing the generic amber medallion all six used to share. Six cards over
 * four families means two families sit twice; the grid is two columns, and no
 * family lands beside or under its own repeat.
 *
 * Classes are literal strings because Tailwind scans source text — a templated
 * `bg-yty-${id}-strong/10` emits a class name with no rule behind it.
 */
const WHY_ACCENTS: Record<WhyKey, { tile: string; glyph: string }> = {
  // "Roblox Studio, AI-assisted design and the fundamentals of coding logic" —
  // knowledge and the machinery behind it, which is wit's whole territory.
  skills: {
    tile: "border-yty-wit-strong bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
  },
  // "Meet your people. Connect with other creators" — people, harmony.
  people: {
    tile: "border-yty-harmony-strong bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
  },
  // "Walk away with a real, published creation" — you leave with more than you
  // arrived with, which is growth.
  portfolio: {
    tile: "border-yty-glow-strong bg-yty-glow-strong/10",
    glyph: "text-yty-glow-soft",
  },
  // "Top projects are showcased at our closing celebration event" — the payoff
  // is an event, and events are valor's own noun in the grammar.
  recognised: {
    tile: "border-yty-valor-strong bg-yty-valor-strong/10",
    glyph: "text-yty-valor-soft",
  },
  // "Creative, social, and made to be enjoyed" — the one concrete claim in it
  // is social, so it goes to harmony rather than reading as decoration.
  fun: {
    tile: "border-yty-harmony-strong bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
  },
  // "Dedicated parent sessions on digital safety, civility, and parental
  // controls" — safety told as mechanism, the same fact /about's
  // keep-children-safe value states, and it wears the same family there.
  safe: {
    tile: "border-yty-wit-strong bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
  },
};

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
    circle: STEP_CIRCLES[i],
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
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
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
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("how.heading")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("how.subheading")}</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.key} className="text-center">
                {/* The four steps wear the four tertiaries — see STEP_CIRCLES. */}
                <div className={step.circle}>{step.number}</div>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <UpcomingEventsSection />

      {/* Why join — after the events, where it answers the hesitation a reader
          has once they have seen what is actually on offer. */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t("why.eyebrow")}</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("why.heading")}
            </h2>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2">
            {reasons.map((reason) => (
              <Card key={reason.key} className="bg-card/50">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    {/* The ruled accent tile — tint ground, full-value family
                        edge, soft glyph — and the shading rule's one standing
                        exemption (owner, 2026-09-01): a brand colour lighting a
                        glyph at chip scale, not a colour painted as a card's
                        ground. The card behind it stays neutral, which is the
                        constraint the exemption came with. The family is the
                        reason's own meaning; see WHY_ACCENTS above. */}
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${WHY_ACCENTS[reason.key].tile}`}
                    >
                      <reason.icon className={`h-5 w-5 ${WHY_ACCENTS[reason.key].glyph}`} />
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
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("parents.heading")}
            </h2>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              {t("parents.body")}
            </p>
            {/* The parent-audience slice of the storefront, not the teens' one
                the hero and closing CTAs point at — the sessions this paragraph
                describes are sold to the parent, not to the child. */}
            <Link
              href={ROUTES.robloxParentSessions}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "mt-8 gap-2",
              })}
            >
              {t("parents.cta")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <ProgrammeFaq />

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
