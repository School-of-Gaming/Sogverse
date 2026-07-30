import { formatInTimeZone } from "date-fns-tz";
import {
  CLUB_FUTURE_SPECS,
  SESSION_FEED_GAMER_IDS,
  SESSION_FEED_ROSTER,
  SESSION_FEED_TIMEZONE,
  SESSION_FEED_WEEK_SPECS,
  buildSessionFeedFixture,
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
 * groups, the group-level notes, and the session feed that is the page's spine,
 * all computed from a `now` the caller supplies. No absolute dates: whenever the
 * scene is opened it shows a plausible term around today.
 *
 * The roster is the same eight children the feed's attendance checklist uses,
 * so the names in a write-up and the names in the roster panel agree. Note
 * copy, names and emails are mock *data*, not UI copy, so they are not
 * translated — the same convention the other fixture files follow.
 *
 * Every id that reaches an identicon (children, gedus) is a real generated
 * UUIDv4 hardcoded as a literal: the identicon pattern is hashed out of the id's
 * hex bytes, so a readable id renders an empty square, and generating one per
 * render would give the same person a different face on every reload.
 */

export const GEDU_PRODUCT_SCENARIOS = [
  "club-midterm",
  "needs-attention",
  "club-yearlong",
  "camp-daily",
  "first-week",
] as const;

export type GeduProductScenario = (typeof GEDU_PRODUCT_SCENARIOS)[number];

export function isGeduProductScenario(s: string): s is GeduProductScenario {
  return (GEDU_PRODUCT_SCENARIOS as readonly string[]).includes(s);
}

/** The persistent, non-session notes attached to the group itself. */
export interface GroupNotesFixture {
  publicNote: string | null;
  staffNote: string | null;
}

export interface GeduProductPageFixture {
  data: GeduAssignedProduct;
  entries: SessionFeedEntry[];
  /** The attendance roster, keyed to the same ids as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** The zone the schedule was authored in. */
  sourceTimeZone: string;
  /** Standing notes about the group, distinct from any one session's. */
  groupNotes: GroupNotesFixture;
  /**
   * Staff-facing lesson/material URL. Separate from the product's Padlet, which
   * is the family-facing link — the promotion step reads this from a new
   * product column and must never render it to a parent or gamer.
   */
  materialUrl: string | null;
}

/** Gedu ids. Real UUIDs because each one renders as an identicon chip. */
const GEDU_IDS = {
  sanna: "4a84d001-b789-41f5-ace3-cfcffa139869",
  petra: "96e29545-ad63-4948-b783-14e91189ad75",
  joonas: "d2826073-1d3f-4023-b45e-f42fea4332ca",
  markus: "a79fc7fd-8527-4826-8062-94d25ed30873",
} as const;

/**
 * Minecraft account UUIDs for the verified children. Mojang hands out real
 * UUIDs, so a fixture standing in for one has to look like a UUID or the row
 * that renders it stops being a fair test of the real thing.
 */
const MINECRAFT_UUIDS: readonly string[] = [
  "617bc50c-7dfe-4b39-8c74-8f01b9110f92",
  "04c2b904-a933-44b1-b295-38d499d58b2b",
  "7c99b686-bb6c-4b4b-8ebb-efd5880aa2e7",
  "b31d117c-0e4e-4b15-862b-89147e7349ac",
  "c0be0c66-a9ab-40ee-9768-c4f8307f8cdb",
  "e38c400e-c160-44f4-b08e-19b7bfb10e35",
  "4493f692-a30f-4cea-af7e-95a186112d69",
  "550f9847-3598-44a8-8232-7280d4881f5b",
];

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
  materialUrl: string | null;
  groupName: string;
  groupNotes: GroupNotesFixture;
  /**
   * The other groups running on the same product — the reference rail's
   * peer-cover rows. Every scenario carries at least one so the rail is always
   * exercised, except `first-week`, which is deliberately the single-group
   * product that shows the rail's empty state.
   */
  peers: readonly {
    id: string;
    name: string;
    gamerCount: number;
    /** The gedus teaching the peer group — each id renders an identicon. */
    gedus: readonly { id: string; firstName: string }[];
  }[];
}

/** The gedus who show up as peer-group teachers, as identicon chips. */
const PETRA = { id: GEDU_IDS.petra, firstName: "Petra" } as const;
const JOONAS = { id: GEDU_IDS.joonas, firstName: "Joonas" } as const;
const MARKUS = { id: GEDU_IDS.markus, firstName: "Markus" } as const;

const NEEDS_ATTENTION_SPECS: readonly EntrySpec[] = [
  ...CLUB_FUTURE_SPECS,
  { kind: "needs_record" },
  { kind: "needs_record" },
  {
    kind: "recorded",
    absent: [SESSION_FEED_GAMER_IDS.emil],
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

/**
 * A camp's future block: one entry per remaining day of the run, not the
 * open-ended cap. An end-dated product shows every occurrence to its end, and a
 * camp ends this week — so the collapsed later-block here holds days, not months.
 */
const CAMP_FUTURE_SPECS: readonly EntrySpec[] = [
  { kind: "future" },
  {
    kind: "future",
    publicNote:
      "Day eight: showcase afternoon. Every team demos their finished course and we vote on the one nobody could beat.",
  },
  {
    kind: "future",
    needsSubstitute: true,
    staffNote:
      "I have a dentist appointment I couldn't move on this day. The morning block is fine, someone needs to cover 13:00 onwards.",
  },
  {
    kind: "future",
    publicNote:
      "Day six: leaderboards. We wire the finish line up to a scoreboard so the course remembers who got round it fastest.",
  },
];

const CAMP_SPECS: readonly EntrySpec[] = [
  ...CAMP_FUTURE_SPECS,
  {
    kind: "recorded",
    absent: [SESSION_FEED_GAMER_IDS.siiri],
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
    absent: [SESSION_FEED_GAMER_IDS.oskar, SESSION_FEED_GAMER_IDS.emil],
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
  ...CLUB_FUTURE_SPECS,
  {
    kind: "recorded",
    absent: [SESSION_FEED_GAMER_IDS.hilda],
    publicNote:
      "First session. We went round the table on what everyone has built before — answers ranged from \"a house\" to \"a working calculator\" — agreed how we talk to each other in voice, and spent the last half hour digging out a spot for the group's base.",
    staffNote:
      "Hilda's parents said she'd miss the first week. Worth a catch-up at the start of the next one so she isn't behind on the ground rules.",
  },
];

/* ------------------------------------------------------------------ */
/*  A year of history                                                  */
/* ------------------------------------------------------------------ */

/**
 * Short recaps for the year-long club. Deliberately varied in length and shape —
 * a year of identically-phrased notes would make the feed look uniform and hide
 * the thing the scenario exists to test, which is whether 50+ real entries stay
 * readable and navigable.
 */
const YEARLONG_RECAPS: readonly string[] = [
  "Redstone doors week. Everyone built one that actually closes behind them, which took longer than anyone expected.",
  "We started a survival world from scratch and got as far as a shared shelter and one very ambitious wheat field.",
  "Nether trip. Two casualties, one full inventory of quartz, and a lot of shouting about ghasts.",
  "Build battle: \"a shop that sells one thing\". We ended up with a shop that sells only ladders, and a florist.",
  "Elytra course night. Väinö set the first time, then spent the rest of the session helping people beat it.",
  "Villager trading. Nobody expected an hour on emeralds to be popular, and yet.",
  "We rebuilt the spawn area properly with signs, so new members can find their way around without asking.",
  "Minecart rails to the new mine. Emil worked out the powered-rail spacing and drew it on the whiteboard.",
  "Free build with one rule: it has to be underwater. Two glass domes and a lot of drowning.",
  "Aino ran the session herself for twenty minutes, teaching hopper clocks. She was better at it than I am.",
  "Farming week. Automatic melon farm, half-working. Notes are in the Padlet for whoever picks it up.",
  "Team challenge: build the other team's base from memory after ninety seconds looking at it.",
  "Quiet session with a few away. We tidied storage, labelled chests and agreed a rule about borrowing tools.",
  "Enchanting and bookshelves. Everyone left with at least one enchanted pickaxe and strong opinions about luck.",
  "We took the group on a long walk to find a mesa. Found one, everyone immediately started digging into it.",
  "Mob-proofing night. Lit the paths, walled the gaps, and lost nobody to a creeper for a whole session.",
  "Redstone doorbell competition. Hilda's plays a full tune, which is either brilliant or a menace.",
  "Big landscaping push on the harbour. Oskar organised the group into teams without being asked to.",
  "Command block basics — just teleport pads for now, and a lot of accidental teleports into the ceiling.",
  "End of term session: everyone gave a tour of one thing they made this term. Nobody wanted to log off.",
];

const YEARLONG_STAFF_NOTES: readonly string[] = [
  "Two laptops still can't hear shared audio. Worth checking the room setup before the next one.",
  "Siiri was quiet again. Keep pairing her rather than letting her pick a partner.",
  "Emil and Oskar work better on separate teams — it gets competitive fast.",
  "Someone has been breaking blocks on other people's plots. Watch for it next week.",
  "New member settled in fine but needs the ground rules repeating once more.",
];

const YEARLONG_SKIP_REASONS: readonly string[] = [
  "Autumn break — school closed, no session this week.",
  "Christmas break, no session.",
  "Public holiday, school closed.",
  "Winter break week two.",
  "Cancelled — heating failure at the venue.",
];

/**
 * The year-long club's past: 53 dated sessions plus two pre-epoch lines.
 *
 * Built from an index rule rather than hand-written, and deliberately with no
 * randomness — a fixture that reshuffles itself between renders would make the
 * inline editor's local state jump around and would make any screenshot
 * unreproducible. The mix is what a real year looks like: mostly written up,
 * five holiday skips, two write-ups still owed, and two sessions from before
 * write-ups were expected at all.
 */
function yearlongSpecs(): readonly EntrySpec[] {
  const SKIP_AT = new Set([6, 17, 18, 31, 44]);
  const OWED_AT = new Set([2, 12]);
  const past: EntrySpec[] = [];

  for (let index = 0; index < 53; index++) {
    if (OWED_AT.has(index)) {
      past.push({ kind: "needs_record" });
      continue;
    }
    if (SKIP_AT.has(index)) {
      past.push({
        kind: "skipped",
        reason: YEARLONG_SKIP_REASONS[index % YEARLONG_SKIP_REASONS.length],
      });
      continue;
    }
    // Rotate the absentee through the roster so the attendance summary is not
    // "8 of 8" on every single row of a year.
    const away =
      index % 3 === 0
        ? [SESSION_FEED_ROSTER[index % SESSION_FEED_ROSTER.length].id]
        : undefined;
    past.push({
      kind: "recorded",
      publicNote: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
      ...(index % 7 === 3
        ? { staffNote: YEARLONG_STAFF_NOTES[index % YEARLONG_STAFF_NOTES.length] }
        : {}),
      ...(away ? { absent: away } : {}),
    });
  }

  return [...CLUB_FUTURE_SPECS, ...past, { kind: "no_record" }, { kind: "no_record" }];
}

const YEARLONG_SPECS = yearlongSpecs();

/* ------------------------------------------------------------------ */

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
    materialUrl: "https://drive.sog.gg/minecraft-monday-club/lesson-plans",
    groupName: "Monday A",
    groupNotes: {
      publicNote:
        "Monday A is our redstone-heavy group. We keep a shared world between sessions, so anything you build stays there for next week. The Padlet has photos from every session and the build challenges we have run so far.",
      staffNote:
        "Two siblings in this group (Aino and Väinö) — same parent email, so one message reaches both. Siiri needs pairing rather than free choice of partner. Room laptops 3 and 5 have flaky audio.",
    },
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: [PETRA] },
      {
        id: "mock-group-c",
        name: "Monday C",
        gamerCount: 6,
        gedus: [PETRA, JOONAS],
      },
      { id: "mock-group-d", name: "Monday D", gamerCount: 5, gedus: [MARKUS] },
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
    materialUrl: "https://drive.sog.gg/minecraft-monday-club/lesson-plans",
    groupName: "Monday A",
    groupNotes: {
      publicNote: null,
      staffNote:
        "I have been behind on write-ups since half term. Catching up backwards from the most recent.",
    },
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: [PETRA] },
      { id: "mock-group-c", name: "Monday C", gamerCount: 6, gedus: [JOONAS] },
    ],
  },
  "club-yearlong": {
    productName: "Minecraft Monday Club",
    productType: "consumer_club",
    cadence: "weekly",
    specs: YEARLONG_SPECS,
    startTime: "16:30",
    durationMinutes: 90,
    slots: CLUB_SLOTS,
    // Fifty-five weeks of history — the club has run through a full year and
    // over a New Year, which is what makes the month dividers earn their place.
    startedDaysAgo: 55 * 7,
    endsInDays: null,
    padletUrl: "https://padlet.com/sog/minecraft-monday-club",
    materialUrl: "https://drive.sog.gg/minecraft-monday-club/lesson-plans",
    groupName: "Monday A",
    groupNotes: {
      publicNote:
        "We have been going for over a year now. The shared world carries across every session — scroll back through the feed to see what the group has built since it started.",
      staffNote:
        "Longest-running group I have. Everything before last autumn predates write-ups, so the old entries are blank by design, not by neglect.",
    },
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: [PETRA] },
      // Newly split off and not staffed yet — the peer row's "no Gedus
      // assigned" line, which is a real state on a growing product.
      { id: "mock-group-c", name: "Monday C", gamerCount: 4, gedus: [] },
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
    // Four weekday sessions left, which can straddle a weekend.
    endsInDays: 6,
    padletUrl: "https://padlet.com/sog/roblox-builders-camp",
    materialUrl: "https://drive.sog.gg/roblox-builders-camp/day-by-day",
    groupName: "Builders red",
    groupNotes: {
      publicNote:
        "Builders red are working towards one shared obstacle course by Friday. Everything each team builds gets snapped into it at the end of the week.",
      staffNote:
        "Venue laptops are slow to load Studio — start them ten minutes early. Lunch is 12:30 and the room has to be clear by 13:00.",
    },
    peers: [
      {
        id: "mock-group-blue",
        name: "Builders blue",
        gamerCount: 8,
        gedus: [PETRA],
      },
      {
        id: "mock-group-green",
        name: "Builders green",
        gamerCount: 7,
        gedus: [JOONAS, MARKUS],
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
    materialUrl: "https://drive.sog.gg/terraria-starter-club/week-one",
    groupName: "Tuesday A",
    groupNotes: {
      // A brand-new group has nothing standing to say yet — this is the empty
      // state the notes card's "add a note" affordance exists for.
      publicNote: null,
      staffNote: null,
    },
    // The one-group product: the reference rail still renders its other-groups
    // card, saying there are none, so the rail's shape is the same everywhere.
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
      { id: GEDU_IDS.sanna, first_name: "Sanna" },
      { id: GEDU_IDS.petra, first_name: "Petra" },
    ],
    roster: buildRoster(now),
  };

  const peerGroups: GeduAssignedProductGroup[] = config.peers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    created_at: calendarDate(now, -config.startedDaysAgo),
    is_my_group: false,
    gamer_count: peer.gamerCount,
    gedus: peer.gedus.map((gedu) => ({
      id: gedu.id,
      first_name: gedu.firstName,
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
    groupNotes: config.groupNotes,
    materialUrl: config.materialUrl,
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
          ? MINECRAFT_UUIDS[index]
          : null,
      gender: detail.gender,
      parent_email: detail.parentEmail,
    };
  });
}
