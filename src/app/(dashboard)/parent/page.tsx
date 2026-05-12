import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { FamilyProfileSelector } from "@/components/family";
import { FeedbackSectionContent } from "@/components/feedback/feedback-section-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("parentDashboard"), description: "Manage your gamers and enrollments" };
}

export default function CustomerDashboardPage() {
  const t = useTranslations('dashboardSections');

  const sections: DashboardSection[] = [
    { id: 'my-family', label: t('myFamily') },
    { id: 'feedback', label: t('feedback') },
  ];

  return (
    <>
      <DashboardSectionPill sections={sections} ariaLabel={t('myFamily')} />

      <div className="space-y-24 pb-24">
        <section id="my-family" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-3xl font-bold">{t('myFamily')}</h1>
            <FamilyProfileSelector />
          </div>
        </section>

        <section id="feedback" className="scroll-mt-32">
          <FeedbackSectionContent />
        </section>
      </div>
    </>
  );
}
