import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";
import { GroupsSection } from "@/components/gedu/GroupsSection";
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
 * Server-prefetch the assignment rows so the "My Groups" section paints
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
  const t = useTranslations("gedu.myGroups");
  const sections = useTranslations("dashboardSections");
  const m = useTranslations("metadata.pages");

  return (
    <>
      {/* Visually-hidden page title — the sections below are equal-weight
          h2s under it. Matches the parent dashboard's structure so screen
          readers get a single "My SOG" page heading instead of two
          competing h1s. */}
      <h1 className="sr-only">{m("geduDashboard")}</h1>

      <div className="mx-auto max-w-2xl space-y-12 pb-24">
        <section className="space-y-6">
          <h2 className="text-3xl font-bold">{t("title")}</h2>
          <GroupsSection initialRows={initialRows} />
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-bold">{sections("instantVoiceRoom")}</h2>
          <CreateInstantRoomCard />
        </section>
      </div>
    </>
  );
}
