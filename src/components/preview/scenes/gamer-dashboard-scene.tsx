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
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import { displayFaceFor, ytyPaletteFor } from "../palette-scenarios";

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
 *
 * One scenario differs from `typical` in nothing but the brand draft: the Yty
 * hues and the greeting's face are judged here rather than on a card in the
 * style guide, because this is a mobile-first surface — the grid is two columns
 * at 360px, and the greeting is the one heading in the app whose face has to
 * survive the widest locale in that width.
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
      helpForm={<InertHelpFeedbackCard audience="gamer" />}
      palette={ytyPaletteFor(scenario)}
      greetingFace={displayFaceFor(scenario)}
    />
  );
}
