import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Coins, Gamepad2, ShoppingCart, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("parentDashboard"), description: "Manage your gamers and enrollments" };
}

const quickActionIcons = [Gamepad2, Coins, ShoppingCart, Settings] as const;
const quickActionHrefs = [
  ROUTES.customer.gamers,
  ROUTES.customer.sorg,
  ROUTES.products,
  ROUTES.settings,
] as const;
const quickActionKeys = ["gamers", "sorg", "browseClubs", "settings"] as const;

export default function CustomerDashboardPage() {
  const t = useTranslations('parent');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('dashboard.welcome')}</h1>
        <p className="text-muted-foreground">
          {t('dashboard.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {quickActionKeys.map((key, i) => {
          const Icon = quickActionIcons[i];
          const href = quickActionHrefs[i];
          const secondary = i >= 2;
          return (
          <Link key={href} href={href}>
            <Card className="group h-full transition-colors hover:bg-accent hover:text-accent-foreground">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${secondary ? "bg-secondary/10" : "bg-primary/10"}`}>
                    <Icon className={`h-6 w-6 ${secondary ? "text-secondary" : "text-primary"}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{t(`dashboard.quickActions.${key}.title`)}</CardTitle>
                    <CardDescription>{t(`dashboard.quickActions.${key}.description`)}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.gettingStarted.title')}</CardTitle>
          <CardDescription>
            {t('dashboard.gettingStarted.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </div>
            <div>
              <h3 className="font-medium">{t('dashboard.gettingStarted.step1.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.gettingStarted.step1.description')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
              2
            </div>
            <div>
              <h3 className="font-medium">{t('dashboard.gettingStarted.step2.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.gettingStarted.step2.description')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </div>
            <div>
              <h3 className="font-medium">{t('dashboard.gettingStarted.step3.title')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.gettingStarted.step3.description')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
