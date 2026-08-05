"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { GamerDashboardPageBody } from "@/components/gamer/gamer-dashboard-page-body";
import {
  GAMER_DASHBOARD_FIRST_NAME,
  buildGamerDashboardFixture,
  type GamerDashboardScenario,
} from "@/components/gamer/mock-dashboard-fixtures";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";

/**
 * The gamer dashboard as a child meets it: the greeting by name, their
 * enrollments under the type nouns, and the Yty grid.
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
    />
  );
}
