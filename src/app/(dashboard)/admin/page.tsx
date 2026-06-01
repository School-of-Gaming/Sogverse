import type { Metadata } from "next";
import Link from "next/link";
import { Users, Package, TrendingUp, DollarSign } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PerfLogger } from "@/components/dev/perf-logger";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminDashboard"), description: "Manage users, products, and system settings" };
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin.dashboard');
  const c = useTranslations('common');

  const stats = [
    {
      title: t('totalUsers'),
      value: "0",
      description: t('activeAccounts'),
      icon: Users,
      href: ROUTES.admin.users,
    },
    {
      title: t('products'),
      value: "0",
      description: t('activeProducts'),
      icon: Package,
      href: ROUTES.admin.consumerClubs,
    },
    {
      title: t('revenue'),
      value: "$0",
      description: t('thisMonth'),
      icon: DollarSign,
      href: "#",
    },
    {
      title: t('growth'),
      value: "0%",
      description: t('fromLastMonth'),
      icon: TrendingUp,
      href: "#",
    },
  ];

  return (
    <div className="space-y-6">
      {/* eslint-disable-next-line i18next/no-literal-string -- perf logger identifier, not user-facing copy */}
      <PerfLogger page="admin" />
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="group transition-colors hover:bg-accent hover:text-accent-foreground">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{c('recentActivity')}</CardTitle>
          <CardDescription>{t('latestEvents')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {c('noRecentActivity')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
