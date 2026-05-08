import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { FeedbackSectionContent } from "@/components/feedback/feedback-section-content";
import { SettingsSectionContent } from "@/components/settings/settings-section-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("parentDashboard"), description: "Manage your gamers and enrollments" };
}

export default function CustomerDashboardPage() {
  const t = useTranslations('dashboardSections');

  const sections: DashboardSection[] = [
    { id: 'my-family', label: t('myFamily') },
    { id: 'feedback', label: t('feedback') },
    { id: 'settings', label: t('settings') },
  ];

  return (
    <>
      <DashboardSectionPill sections={sections} ariaLabel={t('myFamily')} />

      <div className="space-y-24 pb-24">
        <section id="my-family" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-3xl font-bold">{t('myFamily')}</h1>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{t('myFamily')}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {t('myFamilyDescription')}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="feedback" className="scroll-mt-32">
          <FeedbackSectionContent />
        </section>

        <section id="settings" className="scroll-mt-32">
          <SettingsSectionContent />
        </section>
      </div>
    </>
  );
}
