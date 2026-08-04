import {
  sortFamilyEnrollments,
  type FamilyEnrollmentSummary,
} from "@/components/parent/enrollment-rollup";
import {
  buildEnrollmentFixture,
  futureSlot,
  liveNowSlot,
  type EnrollmentFixtureSpec,
  type FixtureClock,
} from "@/components/parent/mock-enrollment-fixtures";
import type { SupportedLocale } from "@/lib/constants/locales";

/**
 * Fixtures for the gamer dashboard preview scene — the same enrollment builder
 * the parent's scene uses, so the two pages cannot describe one club two
 * different ways.
 *
 * No identicons appear on this page (there is only one person on it and they are
 * the viewer), so nothing here needs a UUID.
 */

/**
 * **Two scenarios.**
 *
 * `typical` is one club and nothing else: a single heading, a single pill entry,
 * and no camps or events anywhere — the composition most gamers have, and the
 * one that proves the empty nouns really are absent rather than empty.
 *
 * `camp-and-club` is the two-noun page: a club running right now with its Join
 * lit, and an in-person camp naming its venue where the Join would be. It exists
 * to show the grouping and the two footer shapes side by side, and to check the
 * kid-facing voice on a corner badge — the club's card carries a payment problem
 * that says "ask a parent" and does nothing when pressed.
 */
export const GAMER_DASHBOARD_SCENARIOS = ["typical", "camp-and-club"] as const;

export type GamerDashboardScenario = (typeof GAMER_DASHBOARD_SCENARIOS)[number];

export function isGamerDashboardScenario(
  s: string,
): s is GamerDashboardScenario {
  return (GAMER_DASHBOARD_SCENARIOS as readonly string[]).includes(s);
}

const CAMP_SITE_NAME = "Kirjasto Oodi, Helsinki";

export function buildGamerDashboardFixture(
  now: Date,
  scenario: GamerDashboardScenario,
  locale: SupportedLocale,
  timeZone: string,
): FamilyEnrollmentSummary[] {
  const clock: FixtureClock = { now, locale, timeZone };

  const specs: EnrollmentFixtureSpec[] =
    scenario === "typical"
      ? [
          {
            participationId: "mock-gamer-minecraft-club",
            productName: "Minecraft Explorers Club",
            productType: "consumer_club",
            isRemote: true,
            slots: [futureSlot(now, 3, "17:00", 90)],
            startedDaysAgo: 35,
            endsInDays: null,
          },
        ]
      : [
          {
            participationId: "mock-gamer-minecraft-club",
            productName: "Minecraft Explorers Club",
            productType: "consumer_club",
            isRemote: true,
            slots: [liveNowSlot(now, 90)],
            startedDaysAgo: 84,
            endsInDays: null,
            // Renders the non-interactive "ask a parent" alert rather than the
            // parent's clickable money badge — a child never meets billing.
            paymentProblem: true,
          },
          {
            participationId: "mock-gamer-roblox-camp",
            productName: "Roblox Builders Camp",
            productType: "camp",
            isRemote: false,
            slots: [0, 1, 2, 3, 4].map((weekday) => ({
              weekday,
              startTime: "10:00",
              durationMinutes: 180,
            })),
            startedDaysAgo: 2,
            endsInDays: 5,
            siteName: CAMP_SITE_NAME,
          },
        ];

  return sortFamilyEnrollments(
    specs.map((spec) => buildEnrollmentFixture(clock, spec)),
    now,
  );
}
