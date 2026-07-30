import { useTranslations } from "next-intl";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import type { MyAssignedProductSessionRow } from "@/services/assignments";
import { GroupsSection } from "./GroupsSection";
import { UnverifiedVoiceNotice } from "./unverified-voice-notice";

/**
 * The gedu dashboard's page body — everything below the route's data shell.
 *
 * It lives apart from `app/(dashboard)/gedu/page.tsx` so the page is only a
 * data shell (auth, prefetch) and the body is a plain component: that is what
 * lets a full-page preview scene render the dashboard exactly as a gedu meets
 * it, with fixtures in place of the server reads.
 */
export function GeduDashboardPageBody({
  initialRows,
  verified,
}: {
  initialRows: MyAssignedProductSessionRow[];
  verified: boolean;
}) {
  const t = useTranslations("dashboardSections");

  const sections: DashboardSection[] = [
    { id: "sessions", label: t("upcomingSessions") },
    { id: "instant-voice-room", label: t("instantVoiceRoom") },
  ];

  return (
    <>
      {/* Visually-hidden page title — the two sections below are equal-weight
          h2s under it, and the section pill is the visual nav. Matches the
          parent dashboard so screen readers get a single "My SOG" page
          heading instead of competing h1s.

          It reads `dashboardSections`, not the `metadata` namespace that names
          the document title: `metadata` is server-only and stripped from the
          client bundle, so a client component reading it throws. This body is a
          server component and would get away with it; its draft twin is a client
          component and did not. Rendered page copy belongs in a page namespace
          either way — `metadata` is for `generateMetadata()`. */}
      <h1 className="sr-only">{t("pageTitle")}</h1>

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
