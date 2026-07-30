"use client";

import { useLocale } from "next-intl";
import { GeduDashboardPageBodyDraft } from "@/components/gedu/gedu-dashboard-page-body-draft";
import { GroupsSectionView } from "@/components/gedu/GroupsSectionView";
import {
  buildGeduDashboardFixture,
  type GeduDashboardScenario,
} from "@/components/gedu/mock-dashboard-fixtures";
import { CreateInstantRoomCardView } from "@/components/voice/instant/CreateInstantRoomCardView";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow } from "@/providers";

/**
 * The gedu dashboard as a gedu meets it, with the draft body's per-product
 * alert badges in place.
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
  const fixture = buildGeduDashboardFixture(now, scenario, locale);

  return (
    <GeduDashboardPageBodyDraft
      verified={fixture.verified}
      sessionsSection={
        <GroupsSectionView
          items={fixture.sessions}
          attentionByProductId={fixture.attentionByProductId}
        />
      }
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
