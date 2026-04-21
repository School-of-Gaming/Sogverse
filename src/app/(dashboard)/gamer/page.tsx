import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ROUTES } from "@/lib/constants";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("gamerHome"), description: "Your gamer dashboard in the Sogverse" };
}

export default function GamerDashboardPage() {
  const t = useTranslations('gamer');
  const yty = useTranslations('yty');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-primary">
          {t('welcome')}
        </h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {YTY_ELEMENTS.map((el) => (
          <Card key={el.id} className={`bg-gradient-to-br ${el.color.bgGradient}`}>
            <CardHeader className="text-center pb-2">
              <el.icon className={`mx-auto h-8 w-8 ${el.color.accent}`} />
              <CardTitle className="text-base">{yty(`elements.${el.id}.name`)}</CardTitle>
            </CardHeader>
            <CardContent className="text-center pt-0">
              <p className="text-3xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">{yty(`elements.${el.id}.description`)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Link href={ROUTES.gamer.groups} className="block">
        <Card className="group cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{t('myGroups')}</p>
              <p className="text-sm text-muted-foreground">
                {t('myGroupsDescription')}
              </p>
            </div>
            <NavChevron />
          </CardContent>
        </Card>
      </Link>

      <Card className="border-secondary/50 bg-secondary/5">
        <CardContent className="flex items-center gap-4 py-4">
          {/* eslint-disable-next-line i18next/no-literal-string -- decorative emoji, not translatable content */}
          <div className="text-4xl">🎮</div>
          <div>
            <h3 className="font-medium">{t('tipOfTheDay')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('tipOfTheDayMessage')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
