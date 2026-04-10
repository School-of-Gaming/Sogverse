import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("yty"),
    description: "Yty is the magical force that maintains the balance of the Sogverse. Learn how gamers earn Yty by doing good things.",
  };
}


export default function YtyPage() {
  const t = useTranslations('yty');
  const c = useTranslations('common');

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

      {/* Overview Card */}
      <div className="mx-auto mt-16 max-w-4xl">
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{t('overview.heading')}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-lg text-muted-foreground">
              {t('overview.paragraph1')}
            </p>
            <p className="text-lg text-muted-foreground">
              {t('overview.paragraph2')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* The Four Elements */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">{t('elements.heading')}</h2>
        <p className="mt-2 text-center text-muted-foreground">
          {t('elements.subheading')}
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {YTY_ELEMENTS.map((el) => (
            <Card key={el.id} className={`border-2 ${el.color.border}`}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${el.color.bg}`}>
                    <el.icon className={`h-6 w-6 ${el.color.accent}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{el.name}</CardTitle>
                    <p className={`text-sm ${el.color.accent}`}>{el.description}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t(`elements.${el.id}.detail`)}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Earning Yty */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">{t('earning.heading')}</h2>
        <div className="mt-8 space-y-6 text-muted-foreground">
          <p>{t('earning.paragraph1')}</p>
          <p>{t('earning.paragraph2')}</p>
          <p>{t('earning.paragraph3')}</p>
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
                <Button size="lg">{c('getStarted')}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
