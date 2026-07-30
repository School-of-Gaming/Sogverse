import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import {
  Blocks,
  GraduationCap,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PartnerLockup } from "@/components/roblox/partner-lockup";
import { PartnershipCta } from "@/components/roblox/partnership-cta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("roblox"),
    // Placeholder content, shared by URL with partners rather than published.
    // This tag is what actually keeps it out of search results; the route is
    // deliberately absent from sitemap.ts and has no nav link anywhere.
    //
    // Note it is NOT disallowed in robots.txt, which would be the intuitive
    // move and is the wrong one: a disallowed URL is never fetched, so the
    // crawler never reads this tag, and the URL can still be indexed bare off
    // an external link. Disallow also publishes the path to anyone who reads
    // robots.txt. Allowing the crawl and serving noindex is what deindexes.
    robots: { index: false, follow: false },
  };
}

const whatIcons = [Blocks, GraduationCap, ShieldCheck, Users];
const whatKeys = ["studio", "gedus", "safe", "parents"] as const;

const partnerIcons = [Sparkles, HeartHandshake, Blocks];
const partnerKeys = ["sog", "lynx", "roblox"] as const;

export default function RobloxPage() {
  const t = useTranslations("roblox");

  const whatCards = whatKeys.map((key, i) => ({
    key,
    title: t(`what.${key}.title`),
    description: t(`what.${key}.description`),
    icon: whatIcons[i],
  }));

  const partners = partnerKeys.map((key, i) => ({
    key,
    name: t(`partners.${key}.name`),
    role: t(`partners.${key}.role`),
    icon: partnerIcons[i],
  }));

  return (
    <>
      {/* Hero — mirrors the home page's treatment (pulled up under the
          translucent header, with the same two-stop brand gradient) so the
          partnership page reads as part of the same site rather than a
          microsite bolted on. */}
      <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
        <div className="container mx-auto px-4 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="border-primary/40 text-primary">
              {t("hero.badge")}
            </Badge>
            <h1 className="mt-6 font-display text-3xl font-bold tracking-tight md:text-6xl">
              {t.rich("hero.title", {
                br: () => <br />,
                primary: (chunks) => <span className="text-primary">{chunks}</span>,
                secondary: (chunks) => (
                  <span className="text-secondary">{chunks}</span>
                ),
              })}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              {t("hero.subtitle")}
            </p>
          </div>

          {/* The lockup sits directly under the hero copy: it is the whole
              point of the page — the credibility signal — so it should land
              above the fold rather than being buried as a footer strip. */}
          <div className="mx-auto mt-14 max-w-3xl">
            <PartnerLockup />
          </div>
        </div>
      </section>

      {/* Placeholder notice — stated plainly and early. A visitor who reaches
          a page this thin deserves to know it is unfinished on purpose rather
          than wondering what they are missing. */}
      <section className="container mx-auto px-4 pt-4">
        <Card className="mx-auto max-w-3xl border-primary/30 bg-primary/5">
          <CardContent className="flex gap-4 py-6">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{t("placeholder.heading")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("placeholder.body")}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* What the clubs are */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("what.heading")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("what.subheading")}</p>
        </div>
        <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2">
          {whatCards.map((card) => (
            <Card key={card.key} className="bg-card/50">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <card.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{card.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Who does what */}
      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t("partners.heading")}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t("partners.subheading")}
            </p>
          </div>
          <div className="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-3">
            {partners.map((partner) => (
              <div key={partner.key} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <partner.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{partner.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {partner.role}
                </p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-muted-foreground">
            {t("partners.hosted")}
          </p>
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
