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
  // information. The labels are the bare document names — the block that
  // renders them names the Programme once, in its heading; see there for why.
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

      <UpcomingEventsSection />

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

      {/* The Programme's own legal documents — linked from here and nowhere
          else while the whole surface stays unpublished — and beneath them the
          trademark attribution required wherever the Roblox mark appears, plus
          the courteous equivalent for Lynx.

          Two things about this block are load-bearing, and both answer the same
          problem: the site footer renders immediately below it, carrying its own
          "Privacy Policy" and "Terms & Conditions" for School of Gaming.

          First, the heading. The three labels below it are the bare document
          names, so the Programme is named once above them rather than repeated
          into every row. A reader's question here is not which box a link sits
          in, it is which document governs them — and only a heading answers
          that. Putting the scope in the labels instead is what this replaces:
          three rows each opening "Creator Academy …" read as a wall and still
          leave the grouping implicit.

          Second, the order. The fine print sits *under* the links rather than
          over them, which puts the Programme's rows as far from the footer's as
          this section can, and reads the right way round anyway — boilerplate
          belongs at the bottom of the page, not above the thing it qualifies. */}
      <section className="container mx-auto px-4 pb-16">
        <div className="mx-auto max-w-3xl border-t border-border pt-8">
          {/* Furniture, not voice: a small tracked marker a reader scans as
              structure, so caps are the right treatment here. Muted rather than
              the page's primary-coloured Eyebrow — three primary-coloured rows
              would shout from the bottom of the page, and a primary label over
              them shouts just as loudly. An h2 because it genuinely heads the
              list below it in the outline, whatever its size says. */}
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("legal.documents")}
          </h2>
          {/* A step more present than the trademark boilerplate below — a
              parent looking for the terms has to be able to find them. */}
          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
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
          <div className="mt-8 space-y-2 text-xs leading-relaxed text-muted-foreground/70">
            <p>{t("legal.roblox")}</p>
            <p>{t("legal.lynx")}</p>
          </div>
        </div>
      </section>
    </>
  );
}
