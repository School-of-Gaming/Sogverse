import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";
import { GroupsSection } from "@/components/gedu/GroupsSection";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { createClient } from "@/lib/supabase/server";
import {
  AssignmentsService,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard"), description: "Spin up a voice room" };
}

/**
 * Server-prefetch the assignment rows so the Sessions section paints
 * on first frame. Errors fall back to an empty list — the section will
 * render its own empty-state copy, which is the right read in both the
 * truly-empty and could-not-load cases (the user can refresh).
 */
async function getInitialAssignmentRows(): Promise<MyAssignedProductSessionRow[]> {
  try {
    const supabase = await createClient();
    const service = new AssignmentsService(supabase);
    return await service.getMyAssignedProducts();
  } catch {
    return [];
  }
}

export default async function GeduDashboardPage() {
  const initialRows = await getInitialAssignmentRows();
  return <GeduDashboardPageBody initialRows={initialRows} />;
}

function GeduDashboardPageBody({
  initialRows,
}: {
  initialRows: MyAssignedProductSessionRow[];
}) {
  const t = useTranslations("dashboardSections");
  const m = useTranslations("metadata.pages");

  const sections: DashboardSection[] = [
    { id: "sessions", label: t("upcomingSessions") },
    { id: "instant-voice-room", label: t("instantVoiceRoom") },
  ];

  return (
    <>
      {/* Visually-hidden page title — the two sections below are equal-weight
          h2s under it, and the section pill is the visual nav. Matches the
          parent dashboard so screen readers get a single "My SOG" page
          heading instead of competing h1s. */}
      <h1 className="sr-only">{m("geduDashboard")}</h1>

      <DashboardSectionPill sections={sections} ariaLabel={t("upcomingSessions")} />

      <div className="space-y-24 pb-24">
        <section id="sessions" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t("upcomingSessions")}</h2>
            <GroupsSection initialRows={initialRows} />
          </div>
        </section>

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms
            out mid-scroll and the heading stays in the middle of the
            viewport. Same shape as the parent dashboard's last section. */}
        <section
          id="instant-voice-room"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t("instantVoiceRoom")}</h2>
            <CreateInstantRoomCard />
          </div>
        </section>
      </div>
    </>
  );
}
