import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { Heart, Shield, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About Us",
  description: "School of Gaming — where screen time becomes quality time through Minecraft clubs led by professional game educators.",
  openGraph: {
    title: "About Sogverse",
    description: "Learn about Sogverse and our mission to make screen time quality time through Minecraft clubs led by professional game educators.",
  },
};

const valueIcons = [Sparkles, Heart, Shield, Users];
const valueKeys = ["playIsEssential", "friendsCarry", "keepChildrenSafe", "familyInTheLoop"] as const;

export default function AboutPage() {
  const t = useTranslations('about');
  const c = useTranslations('common');

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
    </div>
  );
}
