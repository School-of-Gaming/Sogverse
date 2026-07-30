import { formatInTimeZone } from "date-fns-tz";
import {
  buildSessionFeedFixture,
  SESSION_FEED_ROSTER,
  SESSION_FEED_TIMEZONE,
  SESSION_FEED_WEEK_SPECS,
  type EntrySpec,
  type SessionFeedCadence,
} from "@/components/gedu/session-feed/mock-fixtures";
import type { SessionFeedEntry, SessionFeedGamer } from "@/components/gedu/session-feed";
import type {
  GeduAssignedProduct,
  GeduAssignedProductGroup,
  GeduAssignedProductRosterEntry,
} from "@/types";

/**
 * Fixtures for the gedu product-page preview scenes — the product shell, the
 * groups, and the session feed that is the page's spine, all computed from a
 * `now` the caller supplies. No absolute dates: whenever the scene is opened
 * it shows a plausible term around today.
 *
 * The roster is the same eight children the feed's attendance checklist uses,
 * so the names in a write-up and the names in the roster panel agree. Note
 * copy, names and emails are mock *data*, not UI copy, so they are not
 * translated — the same convention the other fixture files follow.
 */

export const GEDU_PRODUCT_SCENARIOS = [
  "club-midterm",
  "needs-attention",
  "camp-daily",
  "first-week",
] as const;

export type GeduProductScenario = (typeof GEDU_PRODUCT_SCENARIOS)[number];

export function isGeduProductScenario(s: string): s is GeduProductScenario {
  return (GEDU_PRODUCT_SCENARIOS as readonly string[]).includes(s);
}

export interface GeduProductPageFixture {
  data: GeduAssignedProduct;
  entries: SessionFeedEntry[];
  /** The attendance roster, keyed to the same ids as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** The zone the schedule was authored in. */
  sourceTimeZone: string;
}

/** A camp's five weekday slots; a club's single weekly one. */
const CLUB_SLOTS = [{ weekday: 0, start_time: "16:30", duration_minutes: 90 }];
const CAMP_SLOTS = [0, 1, 2, 3, 4].map((weekday) => ({
  weekday,
  start_time: "10:00",
  duration_minutes: 180,
}));

interface ScenarioConfig {
  productName: string;
  productType: GeduAssignedProduct["product"]["product_type"];
  cadence: SessionFeedCadence;
  specs: readonly EntrySpec[];
  startTime: string;
  durationMinutes: number;
  slots: GeduAssignedProduct["product"]["schedule_slots"];
  /** How far back the product started, in days before `now`. */
  startedDaysAgo: number;
  /** Days after `now` the product ends, or `null` for an ongoing club. */
  endsInDays: number | null;
  padletUrl: string | null;
  groupName: string;
  peers: readonly { id: string; name: string; gamerCount: number; gedus: string[] }[];
}

const NEEDS_ATTENTION_SPECS: readonly EntrySpec[] = [
  { kind: "upcoming" },
  { kind: "needs_record" },
  { kind: "needs_record" },
  {
    kind: "recorded",
    absent: ["mock-gamer-emil"],
    publicNote:
      "Survival week. We agreed one shared base instead of eight scattered huts, and it turned into a proper little town by the end — Linnéa dug the well, Oskar ran the fence line, and three people argued about where the door should go for twenty minutes.",
  },
  { kind: "needs_record" },
  { kind: "needs_record" },
  {
    kind: "recorded",
    publicNote:
      "Nether trip. Lots of dying, lots of laughing about dying, and one successful return with enough quartz to finish the floor everyone had been complaining about.",
    staffNote:
      "Väinö gets genuinely stressed in the Nether. Give him the map-and-supplies job next time rather than the front of the party.",
  },
  { kind: "needs_record" },
  { kind: "no_record" },
  { kind: "no_record" },
];

const CAMP_SPECS: readonly EntrySpec[] = [
  { kind: "upcoming" },
  {
    kind: "recorded",
    absent: ["mock-gamer-siiri"],
    publicNote:
      "Day five: playtesting. Every team handed their obby to another team and watched them fail at it, which is the most useful hour of the week. Three levels got quietly made easier straight afterwards.",
  },
  { kind: "needs_record" },
  {
    kind: "recorded",
    publicNote:
      "Day three: scripting. We wrote our first Lua — a checkpoint that saves where you got to — and then broke it on purpose to see what the error messages actually mean. Hilda ended up debugging two other tables' scripts.",
    staffNote:
      "The room's laptops are slow to load Studio; start the machines ten minutes before the group arrives tomorrow.",
  },
  {
    kind: "recorded",
    absent: ["mock-gamer-oskar", "mock-gamer-emil"],
    publicNote:
      "Day two: building. Teams of two, one obstacle each, all snapped together into one course by the end of the afternoon. It is unfair and much too long, which everyone considers the point.",
  },
  { kind: "needs_record" },
  {
    kind: "recorded",
    publicNote:
      "Day one: everyone got a Roblox Studio account working, made a baseplate, and pushed a block off it. Names, ground rules, and who is sitting next to whom for the week.",
  },
];

const FIRST_WEEK_SPECS: readonly EntrySpec[] = [
  { kind: "upcoming" },
  {
    kind: "recorded",
    absent: ["mock-gamer-hilda"],
    publicNote:
      "First session. We went round the table on what everyone has built before — answers ranged from \"a house\" to \"a working calculator\" — agreed how we talk to each other in voice, and spent the last half hour digging out a spot for the group's base.",
    staffNote:
      "Hilda's parents said she'd miss the first week. Worth a catch-up at the start of the next one so she isn't behind on the ground rules.",
  },
];

const SCENARIOS: Record<GeduProductScenario, ScenarioConfig> = {
  "club-midterm": {
    productName: "Minecraft Monday Club",
    productType: "consumer_club",
    cadence: "weekly",
    specs: SESSION_FEED_WEEK_SPECS,
    startTime: "16:30",
    durationMinutes: 90,
    slots: CLUB_SLOTS,
    startedDaysAgo: 84,
    endsInDays: null,
    padletUrl: "https://padlet.com/sog/minecraft-monday-club",
    groupName: "Monday A",
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: ["Petra"] },
      {
        id: "mock-group-c",
        name: "Monday C",
        gamerCount: 6,
        gedus: ["Petra", "Joonas"],
      },
    ],
  },
  "needs-attention": {
    productName: "Minecraft Monday Club",
    productType: "consumer_club",
    cadence: "weekly",
    specs: NEEDS_ATTENTION_SPECS,
    startTime: "16:30",
    durationMinutes: 90,
    slots: CLUB_SLOTS,
    startedDaysAgo: 84,
    endsInDays: null,
    padletUrl: "https://padlet.com/sog/minecraft-monday-club",
    groupName: "Monday A",
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: ["Petra"] },
    ],
  },
  "camp-daily": {
    productName: "Roblox Builders Camp",
    productType: "camp",
    cadence: "daily",
    specs: CAMP_SPECS,
    startTime: "10:00",
    durationMinutes: 180,
    slots: CAMP_SLOTS,
    startedDaysAgo: 9,
    endsInDays: 4,
    padletUrl: "https://padlet.com/sog/roblox-builders-camp",
    groupName: "Builders red",
    peers: [
      {
        id: "mock-group-blue",
        name: "Builders blue",
        gamerCount: 8,
        gedus: ["Petra"],
      },
    ],
  },
  "first-week": {
    productName: "Terraria Starter Club",
    productType: "consumer_club",
    cadence: "weekly",
    specs: FIRST_WEEK_SPECS,
    // The gedu's second Monday club, straight after the first — the dashboard
    // fixture lists the two together, so the clock faces have to agree.
    startTime: "18:15",
    durationMinutes: 90,
    slots: [{ weekday: 0, start_time: "18:15", duration_minutes: 90 }],
    startedDaysAgo: 9,
    endsInDays: null,
    padletUrl: null,
    groupName: "Tuesday A",
    peers: [],
  },
};

export function buildGeduProductPageFixture(
  now: Date,
  scenario: GeduProductScenario,
): GeduProductPageFixture {
  const config = SCENARIOS[scenario];

  const feed = buildSessionFeedFixture(now, {
    cadence: config.cadence,
    specs: config.specs,
    clubName: config.productName,
    startTime: config.startTime,
    durationMinutes: config.durationMinutes,
  });

  const assignedGroup: GeduAssignedProductGroup = {
    id: "mock-group-a",
    name: config.groupName,
    created_at: calendarDate(now, -config.startedDaysAgo),
    is_my_group: true,
    gamer_count: SESSION_FEED_ROSTER.length,
    gedus: [
      { id: "mock-gedu-you", first_name: "Sanna" },
      { id: "mock-gedu-petra", first_name: "Petra" },
    ],
    roster: buildRoster(now),
  };

  const peerGroups: GeduAssignedProductGroup[] = config.peers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    created_at: calendarDate(now, -config.startedDaysAgo),
    is_my_group: false,
    gamer_count: peer.gamerCount,
    gedus: peer.gedus.map((firstName) => ({
      id: `mock-gedu-${firstName.toLowerCase()}`,
      first_name: firstName,
    })),
    roster: null,
  }));

  return {
    data: {
      product: {
        id: `mock-product-${scenario}`,
        product_type: config.productType,
        padlet_url: config.padletUrl,
        timezone: SESSION_FEED_TIMEZONE,
        start_date: calendarDate(now, -config.startedDaysAgo),
        end_date:
          config.endsInDays === null ? null : calendarDate(now, config.endsInDays),
        is_remote: true,
        translations: [
          {
            locale: "en",
            name: config.productName,
            description: "",
          },
        ],
        schedule_slots: config.slots,
      },
      my_group_id: assignedGroup.id,
      groups: [assignedGroup, ...peerGroups],
    },
    entries: feed.entries,
    feedRoster: feed.roster,
    sourceTimeZone: feed.timeZone,
  };
}

/**
 * A bare `YYYY-MM-DD` offset from today. Product start/end dates and dates of
 * birth are zoneless calendar dates, so they are pinned to UTC rather than
 * re-anchored to anyone's zone.
 */
function calendarDate(now: Date, dayOffset: number): string {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return formatInTimeZone(date, "UTC", "yyyy-MM-dd");
}

/**
 * The eight feed regulars as roster rows. Ages, genders and Minecraft states
 * are spread across the group so the row component's every variant (verified,
 * entered-but-unverified, not linked, missing parent email) is on screen at
 * once. Two children share a parent email — that's the sibling case the
 * copy-all-emails helper de-duplicates.
 */
function buildRoster(now: Date): GeduAssignedProductRosterEntry[] {
  const details: readonly {
    age: number;
    gender: GeduAssignedProductRosterEntry["gender"];
    minecraftUsername: string | null;
    verified: boolean;
    parentEmail: string | null;
  }[] = [
    { age: 11, gender: "girl", minecraftUsername: "AinoBuilds", verified: true, parentEmail: "marja.korhonen@example.com" },
    { age: 12, gender: "boy", minecraftUsername: "VainoTheBold", verified: true, parentEmail: "marja.korhonen@example.com" },
    { age: 10, gender: "boy", minecraftUsername: "EliasRedstone", verified: false, parentEmail: "tuomas.laine@example.com" },
    { age: 13, gender: "girl", minecraftUsername: null, verified: false, parentEmail: "sofia.lindqvist@example.com" },
    { age: 9, gender: "boy", minecraftUsername: "OskarOre", verified: true, parentEmail: "henrik.lindqvist@example.com" },
    { age: 11, gender: "girl", minecraftUsername: "SiiriSky", verified: false, parentEmail: null },
    { age: 12, gender: "boy", minecraftUsername: null, verified: false, parentEmail: "anna.virtanen@example.com" },
    { age: 10, gender: "non_binary", minecraftUsername: "HildaHollow", verified: true, parentEmail: "kaisa.nieminen@example.com" },
  ];

  return SESSION_FEED_ROSTER.map((gamer, index) => {
    const detail = details[index];
    return {
      gamer_id: gamer.id,
      first_name: gamer.firstName,
      // Offset a few days past the birthday so the computed age is exact.
      date_of_birth: calendarDate(now, -(detail.age * 365 + 12)),
      minecraft_username: detail.minecraftUsername,
      minecraft_uuid:
        detail.verified && detail.minecraftUsername
          ? `mock-uuid-${gamer.id}`
          : null,
      gender: detail.gender,
      parent_email: detail.parentEmail,
    };
  });
}
