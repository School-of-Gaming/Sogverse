"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { GeduDashboardPageBody } from "@/components/gedu/gedu-dashboard-page-body";
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
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state, the same way the product-page scene holds its own. Rebuilding it on
 * every 30-second tick would rebuild every schedule slot off a new `now`, so the
 * live card's session time would creep forward while somebody was looking at it
 * — an unasked-for change to painted text, and a lot of work per tick to
 * produce it. The card's live state still follows the clock, because the card
 * derives that from `useNow()` itself; what is frozen is the schedule it is
 * derived from, which is the half a fixture is standing in for.
 */
export function GeduDashboardScene({
  scenario,
}: {
  scenario: GeduDashboardScenario;
}) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const [fixture] = useState(() =>
    buildGeduDashboardFixture(now, scenario, locale, timeZone),
  );

  return (
    <GeduDashboardPageBody
      certified={fixture.certified}
      assignments={fixture.assignments}
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
