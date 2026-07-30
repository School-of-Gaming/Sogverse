"use client";

import { useTranslations } from "next-intl";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { UnverifiedVoiceNotice } from "./unverified-voice-notice";

/**
 * **Draft** gedu dashboard body — what the page becomes once the session feed
 * lands. Rendered today only by a full-page preview scene; at promotion it
 * replaces the live body and the route passes the wired sections in.
 *
 * The one change from the page it replaces is small on purpose: per the feed
 * plan the dashboard gets *no* queue UI, only an aggregate "N sessions need
 * attention" badge on each product's card, pointing into that product's feed.
 * That badge lives in the session's card components behind an optional count,
 * so the live dashboard is untouched until the shell starts supplying numbers —
 * the draft here is not a second copy of those cards.
 *
 * Both data-bound sections arrive as nodes rather than being reached for
 * directly. That is the shell/body seam: the live shell will pass the
 * query-bound Sessions section and the wired instant-room card, a preview scene
 * passes their presentational cores over fixtures with the backend actions
 * inert. The body itself stays a plain function of its props, which is what
 * lets one body serve both shells.
 */
export function GeduDashboardPageBodyDraft({
  sessionsSection,
  verified,
  instantRoomCard,
}: {
  /** The Sessions section — the whole list of upcoming occurrences. */
  sessionsSection: React.ReactNode;
  /** Has an admin verified this gedu? Gates the instant-room panel. */
  verified: boolean;
  /** The instant-voice-room panel shown to a verified gedu. */
  instantRoomCard: React.ReactNode;
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
            {sessionsSection}
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
            {verified ? instantRoomCard : <UnverifiedVoiceNotice />}
          </div>
        </section>
      </div>
    </>
  );
}
