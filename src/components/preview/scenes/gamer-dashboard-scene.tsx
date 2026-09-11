"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { GamerDashboardPageBody } from "@/components/gamer/gamer-dashboard-page-body";
import {
  GAMER_DASHBOARD_FIRST_NAME,
  buildGamerDashboardFixture,
  type GamerDashboardScenario,
} from "@/components/gamer/mock-dashboard-fixtures";
import { InertHelpFeedbackCard } from "@/components/preview/inert-help-feedback-card";
import { NO_TOPIC_PREP_READY } from "@/components/topic-prep/topic-prep-cookie";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";

/**
 * The gamer dashboard as a child meets it: the greeting by name, their
 * enrollments under the type nouns, and the Help section that ends the page.
 *
 * The help form is the real one with its submit inert — a scene must never gain
 * a live submit that emails every admin.
 *
 * The fixture is built once from the first `useNow()` value and held in state,
 * for the same reason the parent and gedu scenes hold theirs — see
 * `parent-dashboard-scene.tsx`.
 */
export function GamerDashboardScene({
  scenario,
}: {
  scenario: GamerDashboardScenario;
}) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const [enrollments] = useState(() =>
    buildGamerDashboardFixture(now, scenario, locale, timeZone),
  );

  return (
    <GamerDashboardPageBody
      firstName={GAMER_DASHBOARD_FIRST_NAME}
      enrollments={enrollments}
      // Nothing dismissed: a scene is where the prep placements are judged, and
      // the answer is a prop now rather than something a browser store could
      // leak into the page. Which cards actually offer the guide is decided by
      // the fixtures' own enrolment dates, through the same window rule the
      // live roll-up runs.
      prepDismissed={NO_TOPIC_PREP_READY}
      helpForm={<InertHelpFeedbackCard audience="gamer" />}
    />
  );
}
