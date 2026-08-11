import { sortFamilyEnrollments } from "@/components/family/enrollment-rollup";
import {
  FIXTURE_TIMEZONE,
  buildEnrollmentFixture,
  type EnrollmentFixtureSpec,
  type FixtureClock,
} from "@/components/family/mock-enrollment-fixtures";
import { futureSlot, liveNowSlot } from "@/components/preview/fixture-clock";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ParentDashboardParticipant } from "./parent-dashboard-page-body";

/**
 * Fixtures for the parent dashboard preview scene — a plausible week for a
 * family, computed from a `now` the caller supplies.
 *
 * The participant ids are **real, generated UUIDs pasted in as literals**, and that is
 * load-bearing rather than fussy: the identicon beside each heading is a pattern
 * derived from the id's hex bytes, so a readable stand-in like
 * `"mock-gamer-aino"` renders a degenerate grid instead of a different face, and
 * every avatar in the preview becomes a false picture of the real thing.
 * Generating them at module load would be worse still — the same child would
 * have a different face on every reload, which destroys the stability a fixture
 * exists to provide.
 */

/**
 * **One scenario per mutually exclusive page state.**
 *
 * Card states are not page states: live, waitlisted, in-person, finished,
 * failing, winding down, and empty can all coexist on one page under different
 * people, so they share a scenario rather than each owning one. What cannot
 * coexist is the pill's two shapes, the presence of a parent's own section, and
 * the common case's calm.
 *
 * `typical` is the family the product is actually built for: one child, one
 * club, nothing wrong. It is the page most parents open, and it is here so the
 * redesign can be judged on the common case rather than only on the busy one —
 * a dashboard that reads well with four cards and looks empty with one has
 * failed at its main job.
 *
 * `busy-family` is everything else at once, and it is also **the widest the
 * pill ever gets before it collapses** — three named chips, which since
 * for-parents products exist means *two children and the parent themselves*
 * rather than three children. That is one cap over both kinds of chip, not two
 * (see `MAX_NAMED_PILL_ENTRIES`), and this is the page it is judged on. Across
 * the three sections: a remote club live right now with a failing card beside a
 * waitlist place with no session to join and a seat nobody has been placed in;
 * an in-person camp naming its venue where the Join would be, beside a club
 * winding down and a finished camp sitting muted *below* them (the demotion has
 * to read as history without reading as broken, and that is only visible next
 * to something live); and the parent's own two cards — a club whose Join goes
 * straight to the room with no account switch, and a queue place whose leave
 * dialog is the one that names nobody. One child's name is deliberately long,
 * because a section heading and a nav chip are the two places user content gets
 * to decide the layout. Billing carries two Stripe customers — the
 * migrated-family shape, and the only one where the card grows a button per
 * account.
 *
 * **The child with nothing booked used to be here and is not any more**, and
 * that is the one thing the parent chip cost this scenario: a third child would
 * put the pill over its named limit and take away the state this page exists to
 * show. The per-child empty card is judged in `no-enrollments` instead, where
 * two of them sit side by side.
 *
 * `seven-gamers` is the pill past the limit. Above the cap the nav stops naming
 * the children one by one, so this is the scenario that shows the collapse and
 * the seven headings it collapses — **with a parent section as well**, because
 * the interesting half of the collapse is that the parent's chip survives it:
 * the bar reads Gamers · Marja · Billing · Help, which is one collapsed group,
 * one name, and the two fixed entries.
 *
 * `new-family` is the account before the first child exists — the page a parent
 * meets minutes after registering. No child sections, no add-tile-after-the-last:
 * one dashed card whose add button is the page's whole next step, with billing
 * in its ordinary single-button form and help beneath.
 *
 * `parent-only` is that same childless account **after** the parent has bought
 * a seat for themselves, which is a real state the moment a parents' evening
 * goes on sale. The add-a-child card is still there and is still a section, but
 * it no longer owns the page: the parent's own section sits under it, and the
 * pill names both.
 *
 * `no-enrollments` is the step after `new-family` for everybody else: children
 * linked, nothing booked for any of them. Every section renders its per-child
 * empty card pointing at the shop, and the page has to read as an invitation
 * rather than a fault — this is the state every real family passes through
 * between adding their gamers and their first purchase.
 */
export const PARENT_DASHBOARD_SCENARIOS = [
  "typical",
  "busy-family",
  "seven-gamers",
  "new-family",
  "parent-only",
  "no-enrollments",
] as const;

export type ParentDashboardScenario =
  (typeof PARENT_DASHBOARD_SCENARIOS)[number];

export function isParentDashboardScenario(
  s: string,
): s is ParentDashboardScenario {
  return (PARENT_DASHBOARD_SCENARIOS as readonly string[]).includes(s);
}

/**
 * One Stripe customer's worth of billing, before the copy is composed.
 *
 * The covered subscriptions stay **structured** rather than pre-joined strings:
 * the "{child} · {club}" line is translated copy, and a fixture module has no
 * translator. The scene composes them, which is also what the live card does.
 */
export interface FixtureBillingAccount {
  stripeCustomerId: string;
  covers: { participantFirstName: string; productName: string }[];
}

export interface ParentDashboardFixture {
  gamers: ParentDashboardParticipant[];
  /**
   * The reader's own section, or `null` when they hold no seat of their own —
   * which is every scenario but the two that exist to show it.
   */
  self: ParentDashboardParticipant | null;
  accounts: FixtureBillingAccount[];
}

/**
 * The children, by readable name → real UUID.
 *
 * A named map so a scenario can say `GAMER_IDS.aino` and the UUID stays where it
 * belongs: as an opaque value nobody has to read.
 */
const GAMER_IDS = {
  aino: "4c66fc68-a0e9-42de-8245-563c7edf8314",
  aleksanteri: "5505290c-6d2a-493c-8cff-be09c9d891c2",
  ilona: "7fea0187-678f-4cb8-a57b-181282f3a60d",
  kasper: "41322c86-4c05-47d7-bd75-a22b55249aa3",
  linnea: "9c39bfb5-67de-4bed-832d-ecb629c5298f",
  otso: "13ab5d23-716f-4ecb-8958-67acbd3820e6",
  venla: "e7577673-7b51-4279-b1bd-beaa5be02295",
} as const;

/**
 * The reader — the parent whose dashboard this is.
 *
 * A real UUID for the same reason every child's is: their section is headed by
 * an identicon, and on this page it is the one face that is theirs.
 */
const PARENT = {
  id: "808a4fd9-06db-4744-8947-d10575f2c35a",
  firstName: "Marja",
} as const;

/**
 * The venue the in-person camp runs at.
 *
 * Authored rather than derived: an in-person card with no venue would leave the
 * footer zone this redesign exists to fill standing empty, which is the one
 * thing the card must never do.
 */
const CAMP_SITE_NAME = "Kirjasto Oodi, Helsinki";

export function buildParentDashboardFixture(
  now: Date,
  scenario: ParentDashboardScenario,
  locale: SupportedLocale,
  timeZone: string,
): ParentDashboardFixture {
  const clock: FixtureClock = { now, locale, timeZone };

  switch (scenario) {
    case "typical":
      return {
        gamers: [
          gamer(clock, GAMER_IDS.aino, "Aino", [
            {
              participationId: "mock-enrollment-minecraft-club",
              productName: "Minecraft Explorers Club",
              productType: "consumer_club",
              isRemote: true,
              slots: [futureSlot(now, 3, "17:00", 90, FIXTURE_TIMEZONE)],
              startedDaysAgo: 35,
              endsInDays: null,
            },
          ]),
        ],
        self: null,
        accounts: [
          {
            stripeCustomerId: "cus_mock_single",
            covers: [
              {
                participantFirstName: "Aino",
                productName: "Minecraft Explorers Club",
              },
            ],
          },
        ],
      };

    case "busy-family":
      return {
        gamers: [
          gamer(clock, GAMER_IDS.aino, "Aino", [
            {
              participationId: "mock-enrollment-minecraft-club",
              productName: "Minecraft Explorers Club",
              productType: "consumer_club",
              isRemote: true,
              // Anchored to `now`: the lit Join is true for a couple of hours a
              // week, so the card that owns the room is always mid-session when
              // the scene is opened.
              slots: [liveNowSlot(now, 90, FIXTURE_TIMEZONE)],
              startedDaysAgo: 84,
              endsInDays: null,
              // A live session *and* a failing card at once — the pairing that
              // proves the corner badge stays findable over the lit gradient.
              paymentProblem: true,
            },
            {
              participationId: "mock-enrollment-fortnite-waitlist",
              productName: "Fortnite Creative Club",
              productType: "consumer_club",
              isRemote: true,
              slots: [futureSlot(now, 4, "17:00", 90, FIXTURE_TIMEZONE)],
              startedDaysAgo: 21,
              endsInDays: null,
              waitlistPosition: 3,
            },
            {
              // Bought yesterday, nobody placed yet. It sits on the same child
              // as the waitlist place on purpose: the two are the only inert
              // cards on the page and the one thing that must be legible at a
              // glance is that they are *not* the same news. One says the seat
              // is yours and we are arranging it; the other says there is no
              // seat. If the blue tone and the two footer sentences do not
              // carry that difference here, they carry it nowhere.
              participationId: "mock-enrollment-terraria-awaiting",
              productName: "Terraria Builders Club",
              productType: "consumer_club",
              isRemote: true,
              slots: [futureSlot(now, 5, "16:00", 90, FIXTURE_TIMEZONE)],
              startedDaysAgo: 1,
              endsInDays: null,
              awaiting: true,
            },
          ]),
          // A long name on purpose: the heading and the nav chip are the two
          // places user content decides the layout.
          gamer(clock, GAMER_IDS.aleksanteri, "Aleksanteri-Johannes", [
            {
              participationId: "mock-enrollment-roblox-camp",
              productName: "Roblox Builders Camp",
              productType: "camp",
              // In person: no room to join at all, so this card renders no Join
              // beside Aino's lit one and names its venue instead.
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
            {
              participationId: "mock-enrollment-rocket-league-club",
              productName: "Rocket League Club",
              productType: "municipality_club",
              isRemote: true,
              slots: [futureSlot(now, 2, "16:30", 60, FIXTURE_TIMEZONE)],
              startedDaysAgo: 63,
              endsInDays: null,
              cancelledAccessInDays: 18,
            },
            {
              participationId: "mock-enrollment-summer-camp",
              productName: "Summer Roblox Camp",
              productType: "camp",
              isRemote: false,
              slots: [0, 1, 2, 3, 4].map((weekday) => ({
                weekday,
                startTime: "10:00",
                durationMinutes: 180,
              })),
              // Ends in the past, so the walk finds nothing left and the card
              // becomes the finished one, sorting below the two still running.
              // The dates stay relative to `now` because "ended" is a fact
              // about the present — a hardcoded last day would quietly stop
              // being past.
              startedDaysAgo: 19,
              endsInDays: -12,
              siteName: CAMP_SITE_NAME,
            },
          ]),
        ],
        // The reader's own section — two children and one of these is exactly
        // the pill's named limit, which is why this scenario stops at two.
        self: parentsOwnSection(clock),
        // Two Stripe customers — the shape a family migrated from the old
        // platform ends up with, and the only one where the billing card grows
        // a button per account with an explanation above them.
        accounts: [
          {
            stripeCustomerId: "cus_mock_primary",
            covers: [
              {
                participantFirstName: "Aino",
                productName: "Minecraft Explorers Club",
              },
              // The parent's own seat is billed to the same Stripe customer as
              // their children's, so it is a line on the same account rather
              // than a third one.
              {
                participantFirstName: PARENT.firstName,
                productName: "Parents’ Minecraft Evening",
              },
            ],
          },
          {
            stripeCustomerId: "cus_mock_migrated",
            covers: [
              {
                participantFirstName: "Aleksanteri-Johannes",
                productName: "Rocket League Club",
              },
            ],
          },
        ],
      };

    case "new-family":
      return { gamers: [], self: null, accounts: [] };

    case "parent-only":
      // No children and a seat of the parent's own. The add-a-child card is
      // still the first thing on the page and is still a section — it just no
      // longer *is* the page, which is the whole point of demoting it.
      return {
        gamers: [],
        self: parentsOwnSection(clock),
        accounts: [
          {
            stripeCustomerId: "cus_mock_single",
            covers: [
              {
                participantFirstName: PARENT.firstName,
                productName: "Parents’ Minecraft Evening",
              },
            ],
          },
        ],
      };

    case "no-enrollments":
      // Two children so the repetition is visible — one empty section could
      // read as a one-off, two show the page's whole posture in this state.
      return {
        gamers: [
          gamer(clock, GAMER_IDS.aino, "Aino", []),
          gamer(clock, GAMER_IDS.otso, "Otso", []),
        ],
        self: null,
        accounts: [],
      };

    case "seven-gamers":
      return {
        gamers: [
          gamer(clock, GAMER_IDS.aino, "Aino", [
            club(now, "mock-seven-aino", "Minecraft Explorers Club", 1, "17:00"),
          ]),
          gamer(clock, GAMER_IDS.aleksanteri, "Aleksanteri-Johannes", [
            club(now, "mock-seven-aleksanteri", "Rocket League Club", 2, "16:30"),
          ]),
          gamer(clock, GAMER_IDS.ilona, "Ilona", [
            club(now, "mock-seven-ilona", "Roblox Studio Club", 3, "15:00"),
          ]),
          gamer(clock, GAMER_IDS.kasper, "Kasper", [
            {
              participationId: "mock-seven-kasper",
              productName: "Winter LAN Afternoon",
              productType: "event",
              isRemote: false,
              slots: [futureSlot(now, 5, "13:00", 240, FIXTURE_TIMEZONE)],
              startedDaysAgo: -5,
              endsInDays: 5,
              siteName: "Kaapelitehdas, Helsinki",
            },
          ]),
          gamer(clock, GAMER_IDS.linnea, "Linnea", [
            club(now, "mock-seven-linnea", "Stardew Valley Co-op Club", 4, "16:00"),
          ]),
          // Signed up for nothing, like Otso in `busy-family` — kept empty here
          // too because seven full sections would bury the thing this scenario
          // exists to show, which is the nav above them.
          gamer(clock, GAMER_IDS.otso, "Otso", []),
          gamer(clock, GAMER_IDS.venla, "Venla", [
            club(now, "mock-seven-venla", "Terraria Builders Club", 6, "18:00"),
          ]),
        ],
        // The half of the collapse worth looking at: seven children fold into
        // one "Gamers" chip and the parent's own chip keeps its name beside it,
        // because collapsing that one would have to fold a person into a label
        // that says they are a gamer.
        self: parentsOwnSection(clock),
        accounts: [
          {
            stripeCustomerId: "cus_mock_single",
            covers: [
              {
                participantFirstName: "Aino",
                productName: "Minecraft Explorers Club",
              },
              {
                participantFirstName: "Aleksanteri-Johannes",
                productName: "Rocket League Club",
              },
              {
                participantFirstName: "Ilona",
                productName: "Roblox Studio Club",
              },
            ],
          },
        ],
      };

  }
}

/**
 * The parent's own section: a club they attend and a queue they are in.
 *
 * Two cards, chosen for the two things the self variant changes. The club is
 * live, so its Join is lit — and on a self seat that Join is a plain link
 * straight to the room rather than the switch-profile dialog a child's card
 * opens. The waitlist place is what makes the leave dialog reachable, and that
 * dialog is the one place on the page where the copy has to name *nobody*:
 * "you'll lose your place", not "Marja will lose their place".
 *
 * No failing card and no cancellation here — Aino's card carries the first and
 * Aleksanteri's the second, and putting a third alarm on the page would make
 * the busy scenario a page of alarms rather than a page with alarms on it.
 */
function parentsOwnSection(clock: FixtureClock): ParentDashboardParticipant {
  return gamer(clock, PARENT.id, PARENT.firstName, [
    {
      participationId: "mock-enrollment-parents-evening",
      productName: "Parents’ Minecraft Evening",
      productType: "consumer_club",
      isRemote: true,
      // Anchored to `now`, like Aino's: the one Join on this page that goes
      // straight to a room should be the one that is lit while somebody is
      // looking at it.
      slots: [liveNowSlot(clock.now, 90, FIXTURE_TIMEZONE)],
      startedDaysAgo: 42,
      endsInDays: null,
    },
    {
      participationId: "mock-enrollment-parents-pokemon-walk",
      productName: "Family Pokémon GO Walk",
      productType: "event",
      isRemote: false,
      slots: [futureSlot(clock.now, 6, "11:00", 120, FIXTURE_TIMEZONE)],
      startedDaysAgo: 3,
      endsInDays: 30,
      siteName: CAMP_SITE_NAME,
      waitlistPosition: 2,
    },
  ]);
}

/**
 * One person's section, with their enrollments run through the real ordering.
 *
 * Named for the common case and used for the parent's own section too — the
 * roll-up emits one shape for both, and a second builder here would only be a
 * copy of this one with a different name on it.
 */
function gamer(
  clock: FixtureClock,
  id: string,
  firstName: string,
  specs: EnrollmentFixtureSpec[],
): ParentDashboardParticipant {
  return {
    id,
    firstName,
    enrollments: sortFamilyEnrollments(
      specs.map((spec) => buildEnrollmentFixture(clock, spec)),
      clock.now,
      clock.locale,
    ),
  };
}

/** The ordinary remote club — the shape most of these children are in. */
function club(
  now: Date,
  participationId: string,
  productName: string,
  daysAhead: number,
  startTime: string,
): EnrollmentFixtureSpec {
  return {
    participationId,
    productName,
    productType: "consumer_club",
    isRemote: true,
    slots: [futureSlot(now, daysAhead, startTime, 90, FIXTURE_TIMEZONE)],
    startedDaysAgo: 28,
    endsInDays: null,
  };
}
