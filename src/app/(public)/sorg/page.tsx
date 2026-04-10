import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from 'next-intl/server';
import {
  Coins,
  CalendarCheck,
  ShieldCheck,
  Wallet,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TokenPurchaseSection } from "@/components/tokens";
import { getStripeProducts } from "@/lib/stripe/products";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("sorg"),
    description: "Sorg is the currency that powers your child's club sessions in the Sogverse. Purchase tokens and pay per session with full flexibility.",
    openGraph: {
      title: "Sorg - the Sogverse Currency",
      description: "Learn about Sorg, the virtual currency of the Sogverse. Purchase tokens and pay per session with full flexibility.",
    },
  };
}

const benefitIcons = [CalendarCheck, Wallet, RefreshCw, ShieldCheck];
const benefitKeys = ["payPerSession", "fullTransparency", "flexibleTopUps", "safeByDesign"] as const;
const faqKeys = ["isRealMoney", "howSpent", "parentControl", "doExpire", "refund"] as const;

export default async function SorgPage() {
  const { oneTimePackages, subscriptionPackages } = await getStripeProducts();
  const t = await getTranslations('sorg');
  const c = await getTranslations('common');

  const benefits = benefitKeys.map((key, i) => ({
    key,
    title: t(`benefits.${key}.title`),
    description: t(`benefits.${key}.description`),
    icon: benefitIcons[i],
  }));

  const faqs = faqKeys.map((key) => ({
    key,
    question: t(`faqs.${key}.question`),
    answer: t(`faqs.${key}.answer`),
  }));

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-4 flex justify-center">
          <Coins className="h-16 w-16 text-primary" />
        </div>
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
          <CardContent className="text-center">
            <p className="text-lg text-muted-foreground">
              {t('overview.text')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Buy Sorgs */}
      <TokenPurchaseSection
        oneTimePackages={oneTimePackages}
        subscriptionPackages={subscriptionPackages}
      />

      {/* Benefits */}
      <div className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">
          {t('benefits.heading')}
        </h2>
        <p className="mt-2 text-center text-muted-foreground">
          {t('benefits.subheading')}
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <Card key={benefit.key}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <benefit.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{benefit.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {benefit.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-center text-2xl font-bold">
          {t('faqs.heading')}
        </h2>
        <div className="mt-8 space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.key}>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <CardTitle className="text-base">{faq.question}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="-mt-2 pl-12">
                <CardDescription className="text-base">
                  {faq.answer}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
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
              <Link href={ROUTES.products} className={buttonVariants({ variant: "outline", size: "lg" })}>
                {c('exploreClubs')}
              </Link>
              <Link href={ROUTES.register} className={buttonVariants({ size: "lg" })}>
                {c('getStarted')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
