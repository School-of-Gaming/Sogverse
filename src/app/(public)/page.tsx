import Link from "next/link";
import { useTranslations } from 'next-intl';
import { ArrowRight, Shield, Users, Sparkles, Gamepad2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AboutSection } from "@/components/home/about-section";
import { SectionPill } from "@/components/home/section-pill";
import { YtySection } from "@/components/home/yty-section";
import { PerfLogger } from "@/components/dev/perf-logger";
import { ROUTES } from "@/lib/constants";

const featureIcons = [Gamepad2, Sparkles, Users, Shield];
const featureKeys = ["minecraftClubs", "screenTime", "newFriends", "parents"] as const;

export default function HomePage() {
  const t = useTranslations('home');
  const c = useTranslations('common');

  const features = featureKeys.map((key, i) => ({
    key,
    title: t(`features.${key}.title`),
    description: t(`features.${key}.description`),
    icon: featureIcons[i],
  }));

  return (
    <>
      {/* eslint-disable-next-line i18next/no-literal-string -- perf logger identifier, not user-facing copy */}
      <PerfLogger page="home" />
      <SectionPill />

      {/* Home: hero + features + how it works are grouped under a single
          scrollspy anchor so the "Home" pill stays active across all of them. */}
      <div id="home" className="scroll-mt-[var(--header-height)]">
        {/* Hero Section */}
        <section className="relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),linear-gradient(to_right,_hsl(var(--primary)/0.2),_transparent_50%,_hsl(var(--secondary)/0.1))] pt-[var(--header-height)]">
          <div className="container mx-auto px-4 py-24 sm:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="font-display text-2xl font-bold tracking-tight md:text-6xl">
                {t.rich('hero.title', {
                  br: () => <br />,
                  primary: (chunks) => <span className="text-primary">{chunks}</span>,
                  secondary: (chunks) => <span className="text-secondary">{chunks}</span>,
                })}
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                {t('hero.subtitle')}
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href={ROUTES.register}
                  className={buttonVariants({ size: "lg", className: "gap-2" })}
                >
                  {c('getStarted')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
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
              <Card key={feature.key} className="bg-card/50">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <feature.icon className="h-6 w-6 text-primary" />
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

        {/* How It Works Section */}
        <section className="bg-muted/30 py-24">
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
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  1
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step1.title')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('howItWorks.step1.description')}
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-2xl font-bold text-secondary-foreground">
                  2
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t('howItWorks.step2.title')}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('howItWorks.step2.description')}
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
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
      </div>

      <AboutSection id="about" />

      <YtySection id="yty" />

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <Card className="mx-auto max-w-3xl bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              {t('cta.heading')}
            </h2>
            <p className="mt-4 text-muted-foreground">
              {t('cta.subheading')}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={ROUTES.clubs}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {c('exploreClubs')}
              </Link>
              <Link
                href={ROUTES.register}
                className={buttonVariants({ size: "lg" })}
              >
                {t('cta.createFreeAccount')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
