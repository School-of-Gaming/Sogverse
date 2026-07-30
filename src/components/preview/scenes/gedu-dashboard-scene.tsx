"use client";

import { useLocale } from "next-intl";
import { GeduDashboardPageBodyDraft } from "@/components/gedu/gedu-dashboard-page-body-draft";
import { GeduAssignmentsSectionView } from "@/components/gedu/GeduAssignmentsSectionView";
import {
  buildGeduDashboardFixture,
  type GeduDashboardScenario,
} from "@/components/gedu/mock-dashboard-fixtures";
import { CreateInstantRoomCardView } from "@/components/voice/instant/CreateInstantRoomCardView";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";

/**
 * The gedu dashboard as a gedu meets it, rolled up to one card per assignment
 * with each card's needs-attention badge counted out of the feed it links to.
 *
 * Both sections are the real presentational components over fixtures. The
 * instant-room panel renders its idle state with the create action inert — the
 * section has to be *there*, looking like itself, or the page stops reading as
 * the real dashboard; what it must not do is create a room.
 */
export function GeduDashboardScene({
  scenario,
}: {
  scenario: GeduDashboardScenario;
}) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const fixture = buildGeduDashboardFixture(now, scenario, locale, timeZone);

  return (
    <GeduDashboardPageBodyDraft
      verified={fixture.verified}
      groupsSection={<GeduAssignmentsSectionView items={fixture.assignments} />}
      instantRoomCard={
        <CreateInstantRoomCardView
          createdCode={null}
          creating={false}
          joining={false}
          error={null}
          onCreate={noop}
          onJoin={noop}
        />
      }
    />
  );
}

function noop() {}
