import type { Metadata } from "next";
import Link from "next/link";
import { useLocale, useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Heart, Shield, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("about"),
    description: "School of Gaming — where screen time becomes quality time through Minecraft clubs led by professional game educators.",
    openGraph: {
      title: "About Sogverse",
      description: "Learn about Sogverse and our mission to make screen time quality time through Minecraft clubs led by professional game educators.",
    },
  };
}

const valueIcons = [Sparkles, Heart, Shield, Users];
const valueKeys = ["playIsEssential", "friendsCarry", "keepChildrenSafe", "familyInTheLoop"] as const;

const easterEggRows = [
  "brandName", "tagline", "delete", "deleting", "close", "cancel", "getStarted",
  "password", "error", "english", "ok", "sorg", "copyright", "learnMore",
] as const;

export default function AboutPage() {
  const t = useTranslations('about');
  const c = useTranslations('common');
  const locale = useLocale();

  const values = valueKeys.map((key, i) => ({
    key,
    title: t(`values.${key}.title`),
    description: t(`values.${key}.description`),
    icon: valueIcons[i],
  }));

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t.rich('hero.title', {
            primary: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          {t('hero.subtitle')}
        </p>
      </div>

      {/* Quote */}
      <div className="mx-auto mt-16 max-w-3xl text-center">
        <blockquote className="text-xl italic text-muted-foreground">
          {t('quote.text')}
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('quote.attribution')}
        </p>
      </div>

      {/* Mission Section */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('mission.heading')}</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              {t('mission.text')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Values Section */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">{t('values.heading')}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <Card key={value.key}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <value.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{value.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {value.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How Clubs Work Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">{t('howClubsWork.heading')}</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t('howClubsWork.paragraph1')}</p>
          <p>{t('howClubsWork.paragraph2')}</p>
          <p>{t('howClubsWork.paragraph3')}</p>
          <p>{t('howClubsWork.paragraph4')}</p>
        </div>
      </div>

      {/* Parents Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">{t('forParents.heading')}</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t('forParents.paragraph1')}</p>
          <p>{t('forParents.paragraph2')}</p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <Card className="bg-muted/30">
          <CardContent className="py-8">
            <h3 className="text-xl font-semibold">{t('cta.heading')}</h3>
            <p className="mt-2 text-muted-foreground">
              {t('cta.subheading')}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={ROUTES.products}>
                <Button variant="outline" size="lg">{c('exploreClubs')}</Button>
              </Link>
              <Link href={ROUTES.register}>
                <Button size="lg">
                  {c('getStarted')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Section */}
      <div className="mx-auto mt-16 max-w-2xl text-center">
        <h2 className="text-2xl font-bold">{t('contact.heading')}</h2>
        <p className="mt-4 text-muted-foreground">
          {t('contact.subheading')}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          {t('contact.email')}
        </p>
      </div>

      {/* Klingon Easter Egg — only visible when the locale is tlh.
          Inline hardcoded colours (#d00, #0a0a0a) are intentional here —
          these are Klingon Empire flag colours for a one-off easter egg,
          not brand/theme colours that belong in the design system. */}
      {/* eslint-disable i18next/no-literal-string -- Klingon easter egg: the "English"/"tlhIngan Hol"/"Literal meaning" reference headers are intentionally untranslated since this block only renders when locale === "tlh" */}
      {locale === "tlh" && (
        <div className="mx-auto mt-16 max-w-3xl">
          {/* Styled like a Klingon ship console: dark base, red accents, functional text */}
          <Card
            className="overflow-hidden border"
            style={{ borderColor: 'rgba(221,0,0,0.4)', backgroundColor: '#0a0a0a' }}
          >
            <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #d00, transparent)' }} />
            <CardHeader className="text-center">
              {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
              <CardTitle className="text-2xl" style={{ color: '#d00' }}>{t('easterEgg.heading')}</CardTitle>
              <CardDescription className="text-base text-white/60">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t('easterEgg.intro')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left" style={{ borderColor: 'rgba(221,0,0,0.3)' }}>
                      <th className="pb-2 pr-4 font-medium text-white/50">English</th>
                      <th className="pb-2 pr-4 font-medium text-white/50">tlhIngan Hol</th>
                      <th className="pb-2 font-medium text-white/50">Literal meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {easterEggRows.map((row) => (
                      <tr key={row} className="border-b" style={{ borderColor: 'rgba(221,0,0,0.1)' }}>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 text-white/70">{t(`easterEgg.${row}Label`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 pr-4 font-mono" style={{ color: '#d00' }}>{t(`easterEgg.${row}Value`)}</td>
                        {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                        <td className="py-2 italic text-white/40">{t(`easterEgg.${row}Meaning`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-6 text-center text-xs text-white/30">
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t('easterEgg.note')}
              </p>
              <p className="mt-4 text-center text-2xl font-bold" style={{ color: '#d00' }}>
                {/* @ts-expect-error — easterEgg keys only exist in tlh locale */}
                {t('easterEgg.qapla')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {/* eslint-enable i18next/no-literal-string -- end of Klingon easter egg block */}
    </div>
  );
}
