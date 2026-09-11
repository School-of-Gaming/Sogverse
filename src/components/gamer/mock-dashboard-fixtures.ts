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
 * its Join lit and the prep guide's quiet link beneath it, a second club whose
 * room is days away and whose locked Join the guide's button has taken over, a
 * third club the gamer is queued for (the waitlist sentence in
 * the child's voice, and no link anywhere on the card), an in-person camp naming
 * its site where the Join would be, and a one-afternoon event. The dynamic type
 * nouns' *absence* (a one-noun page renders one heading, not empty sections) is
 * the same mechanism the gedu dashboard already proves.
 *
 * **All three activity nouns on purpose**, which is what makes this the page the
 * pill is judged on: Clubs · Camps · Events · Help is the widest the bar ever
 * gets, and the 360px budget is the reason nothing may be added beside Help. A
 * scenario holding two nouns would show a bar that fits and prove nothing.
 *
 * `empty` is the child with nothing booked yet: the greeting, one "Clubs"
 * heading over the quiet empty card — the same convention the gedu's empty
 * dashboard uses — and the Help section, which is theirs regardless.
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
/** A second building, so the two in-person cards do not read as one booking. */
const EVENT_SITE_NAME = "Kaapelitehdas, Helsinki";

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
      // **The card that offers nothing, and the state most cards on a real
      // dashboard are in.** The topic carries a guide, but this gamer has been
      // turning up to this club since it started twelve weeks ago: their first
      // two sessions are far behind them, the prep window closed with the
      // second one, and the card is simply a card with a lit Join on it. It is
      // here so the page can be judged with an ordinary long-standing club on
      // it — the alternative, every card offering a guide, is a picture of a
      // family who bought five things this morning.
      topic: "minecraft_java",
      slots: [liveNowSlot(now, 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 84,
      enrolledDaysAgo: 84,
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
      // The Roblox Studio club, with its room three days out — so the guide
      // takes the locked Join's slot, which is the placement a child is most
      // likely to meet: a seat bought for them, a first session still ahead,
      // and a guide written to read the same to them as to their parent.
      participationId: "mock-gamer-roblox-studio-club",
      productName: "Roblox Studio Club",
      productType: "consumer_club",
      isRemote: true,
      topic: "roblox_studio",
      slots: [futureSlot(now, 3, "15:00", 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 28,
      endsInDays: null,
    },
    {
      participationId: "mock-gamer-roblox-camp",
      productName: "Roblox Builders Camp",
      productType: "camp",
      isRemote: false,
      // The in-person placement, on a seat taken this week: the guide filters
      // down to its account steps (School of Gaming brings the machines) and
      // its button sits under the site line, where a Join never was. Read
      // against the Minecraft club above it, the pair is the whole window rule
      // — a new seat is offered the guide, a long-standing one is not.
      topic: "roblox_studio",
      slots: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 180,
      })),
      startedDaysAgo: 2,
      endsInDays: 5,
      siteName: CAMP_SITE_NAME,
    },
    {
      // The third noun, and the reason it is here: with clubs and a camp only,
      // the pill draws three chips and the four-chip budget is never tested.
      // A single afternoon rather than a run — one slot, still to come, at its
      // own building — which is what an event is and what separates its card
      // from the camp's above it.
      participationId: "mock-gamer-winter-lan-event",
      productName: "Winter LAN Afternoon",
      productType: "event",
      isRemote: false,
      slots: [futureSlot(now, 5, "13:00", 240, FIXTURE_TIMEZONE)],
      // Starts and ends on the same future day: an event has no run behind it.
      startedDaysAgo: -5,
      endsInDays: 5,
      siteName: EVENT_SITE_NAME,
    },
  ];

  return sortFamilyEnrollments(
    specs.map((spec) => buildEnrollmentFixture(clock, spec)),
    now,
    locale,
  );
}
