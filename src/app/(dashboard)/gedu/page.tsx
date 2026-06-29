import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";
import { GroupsSection } from "@/components/gedu/GroupsSection";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { isGeduVerified } from "@/services/gedu/gedu-profiles.service";
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
 *
 * TODO: distinguish "no assignments" from "load failed" in the UI. Today
 * a Supabase blip during the prefetch is indistinguishable from a real
 * empty state (the client-side refetch should self-heal in practice).
 * If we ever see this fire in the wild, render a "couldn't load — try
 * refreshing" surface instead of the empty-state copy.
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

/**
 * Has an admin verified this gedu? Creating an instant voice room is gated on
 * it server-side (the create route 403s an unverified gedu); we mirror that gate
 * in the UI so the user sees a clear "awaiting verification" notice instead of a
 * button that fails. Fail-closed: any lookup error hides the card (the worst
 * case is a verified gedu briefly not seeing it, which a refresh fixes — better
 * than showing a button that 403s).
 */
async function getIsVerified(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return false;
    return await isGeduVerified(supabase, userId);
  } catch {
    return false;
  }
}

export default async function GeduDashboardPage() {
  const [initialRows, verified] = await Promise.all([
    getInitialAssignmentRows(),
    getIsVerified(),
  ]);
  return <GeduDashboardPageBody initialRows={initialRows} verified={verified} />;
}

function GeduDashboardPageBody({
  initialRows,
  verified,
}: {
  initialRows: MyAssignedProductSessionRow[];
  verified: boolean;
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
            {verified ? <CreateInstantRoomCard /> : <UnverifiedVoiceNotice />}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Shown in place of the create card while a gedu is awaiting admin
 * verification. The real boundary is server-side (the create route 403s); this
 * just explains why the button isn't here, so an unverified gedu isn't left
 * clicking a button that fails.
 */
function UnverifiedVoiceNotice() {
  const t = useTranslations("voice.instant.createPage");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          {t("unverifiedTitle")}
        </CardTitle>
        <CardDescription>{t("unverifiedBody")}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
