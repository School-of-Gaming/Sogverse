import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { MyGamersGrid } from "@/components/family";
import { PaymentMethodCard } from "@/components/billing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("parentDashboard"), description: "Manage your gamers and enrollments" };
}

export default function CustomerDashboardPage() {
  const t = useTranslations('dashboardSections');
  const p = useTranslations('parent.placeholders');
  const m = useTranslations('metadata.pages');

  const sections: DashboardSection[] = [
    { id: 'my-gamers', label: t('myGamers') },
    { id: 'sessions', label: t('upcomingSessions') },
    { id: 'billing', label: t('billing') },
    { id: 'help', label: t('help') },
  ];

  return (
    <>
      {/* Visually-hidden page title — the four sections below are equal-weight
          h2s under it, and the section pill is the visual nav. Gives screen
          readers a single "My SOG" page heading instead of four competing h1s. */}
      <h1 className="sr-only">{m('parentDashboard')}</h1>

      <DashboardSectionPill sections={sections} ariaLabel={t('myGamers')} />

      <div className="space-y-24 pb-24">
        <section id="my-gamers" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('myGamers')}</h2>
            <MyGamersGrid />
          </div>
        </section>

        <section id="sessions" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('upcomingSessions')}</h2>
            <p className="text-muted-foreground">{p('upcomingSessions')}</p>
          </div>
        </section>

        <section id="billing" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('billing')}</h2>
            <PaymentMethodCard />
          </div>
        </section>

        <section id="help" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('help')}</h2>
            <p className="text-muted-foreground">{p('help')}</p>
          </div>
        </section>
      </div>
    </>
  );
}
