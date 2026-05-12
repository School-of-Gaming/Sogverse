import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { FamilyProfileSelector } from "@/components/family";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("gamerHome"), description: "Your gamer dashboard in the Sogverse" };
}

export default function GamerDashboardPage() {
  const t = useTranslations('gamer');
  const ds = useTranslations('dashboardSections');
  const yty = useTranslations('yty');

  const sections: DashboardSection[] = [
    { id: 'my-family', label: ds('myFamily') },
    { id: 'yty', label: ds('yty') },
  ];

  return (
    <>
      <DashboardSectionPill sections={sections} ariaLabel={ds('myFamily')} />

      <div className="space-y-24 pb-24">
        <section id="my-family" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-3xl font-bold">{ds('myFamily')}</h1>
            <FamilyProfileSelector />
          </div>
        </section>

        <section id="yty" className="scroll-mt-32 space-y-6">
          <div className="text-center">
            {/* Two-size pattern matching the public Home heading:
                font-display (Press Start 2P) is monospaced ~1em-wide, so a
                long Finnish word like "Tervetuloa," overflows mobile at
                text-3xl. break-words is a safety net for longer translations. */}
            <h2 className="font-display text-xl font-bold text-primary break-words md:text-3xl">
              {t('welcome')}
            </h2>
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
        </section>

      </div>
    </>
  );
}
