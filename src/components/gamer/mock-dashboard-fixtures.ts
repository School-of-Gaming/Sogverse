import {
  sortFamilyEnrollments,
  type FamilyEnrollmentSummary,
} from "@/components/family/enrollment-rollup";
import {
  FIXTURE_TIMEZONE,
  buildEnrollmentFixture,
  type EnrollmentFixtureSpec,
  type FixtureClock,
} from "@/components/family/mock-enrollment-fixtures";
import { futureSlot, liveNowSlot } from "@/components/preview/fixture-clock";
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
 * **Two scenarios — populated and empty, the one mutually exclusive split.**
 *
 * `typical` carries everything that can coexist: a club running right now with
 * its Join lit, a second club the gamer is queued for (the waitlist sentence in
 * the child's voice, and no link anywhere on the card), and an in-person camp
 * naming its venue where the Join would be. The dynamic type nouns' *absence*
 * (a one-noun page renders one heading, not empty sections) is the same
 * mechanism the gedu dashboard already proves.
 *
 * `empty` is the child with nothing booked yet: the greeting, one "Clubs"
 * heading over the quiet empty card — the same convention the gedu's empty
 * dashboard uses — and the Yty grid, which is theirs regardless.
 */
export const GAMER_DASHBOARD_SCENARIOS = ["typical", "empty"] as const;

/**
 * Whose dashboard this is. The same child the parent scene's busy family leads
 * with, holding the same club, so the two scenes can be read side by side as
 * one family's two views of one evening — and so the greeting is checked
 * against a real name rather than a placeholder.
 */
export const GAMER_DASHBOARD_FIRST_NAME = "Aino";

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

  switch (scenario) {
    case "empty":
      return [];
    case "typical":
      break;
  }

  const specs: EnrollmentFixtureSpec[] = [
    {
      participationId: "mock-gamer-minecraft-club",
      productName: "Minecraft Explorers Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [liveNowSlot(now, 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 84,
      endsInDays: null,
    },
    {
      participationId: "mock-gamer-fortnite-waitlist",
      productName: "Fortnite Creative Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [futureSlot(now, 4, "17:00", 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 21,
      endsInDays: null,
      waitlistPosition: 3,
    },
    {
      // The unplaced seat, on the child's own page. Worth having here as well
      // as on the parent's: this is the one card state whose copy is genuinely
      // rewritten for the child rather than merely re-toned, and it is the card
      // most likely to be met by a *new* gamer — the account is a day old, the
      // purchase has landed, and nothing has a group yet.
      participationId: "mock-gamer-terraria-awaiting",
      productName: "Terraria Builders Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [futureSlot(now, 5, "16:00", 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 1,
      endsInDays: null,
      awaiting: true,
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
