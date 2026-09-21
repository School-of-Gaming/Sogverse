"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { GeduSubstitutionPoolSectionView } from "@/components/gedu/GeduSubstitutionPoolSectionView";
import { GeduSubstitutionsPageBody } from "@/components/gedu/gedu-substitutions-page-body";
import {
  buildGeduSubstitutionsFixture,
  type GeduSubstitutionsScenario,
} from "@/components/gedu/mock-substitutions-fixtures";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";

/**
 * The Substitutions page as a gedu meets it: the open queue above, what they
 * have taken below.
 *
 * The real section view over fixture rows, with the two writes inert — the same
 * split every other scene takes. Offering and withdrawing reach the database,
 * so they do nothing here; what is on show is the card itself, the two resting
 * states of its one control, the urgency treatment on the sessions inside the
 * next day, and the confirm dialog the offer opens.
 *
 * **The dialog's confirm resolves rather than rejects**, after a beat. It is
 * the state worth looking at — the question, the held moment, and the dialog
 * closing over a card that has not changed — and a scene that always refused
 * would show the failure line and nothing else. The card behind it does not
 * flip to the offered state, because no write happened; that pair is already
 * side by side in the fixture, which carries one card in each state.
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state, the same way the dashboard scene holds its own. Rebuilding it on every
 * 30-second tick would rebuild every schedule slot off a new `now`, so a card's
 * session time would creep forward while somebody was looking at it. What still
 * follows the clock is the relative-time line, because the card derives that
 * from `useNow()` itself — which is what makes the countdown on the soonest
 * card visibly a countdown.
 */
export function GeduSubstitutionsScene({
  scenario,
}: {
  scenario: GeduSubstitutionsScenario;
}) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const [fixture] = useState(() =>
    buildGeduSubstitutionsFixture(now, scenario, locale, timeZone),
  );

  return (
    <GeduSubstitutionsPageBody
      pool={
        <GeduSubstitutionPoolSectionView
          rows={fixture.pool}
          committingRequestId={null}
          error={null}
          onOffer={inertWrite}
          onWithdraw={noop}
        />
      }
      substitutions={fixture.substitutions}
    />
  );
}

function noop() {}

/**
 * A write that reaches nothing and takes about as long as the real one, so the
 * dialog's held moment is on show rather than skipped in a frame.
 */
function inertWrite(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600));
}
