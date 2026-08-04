import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type { AttendanceMark } from "@/components/gedu/session-feed";
import type { FamilyProductSchedule } from "./FamilyProductPageBody";
import type {
  FamilyProductGedu,
  FamilyProductVenue,
  FamilySessionEntry,
} from "./types";

/**
 * Fixtures for the family product-page preview scenes — the product shell, the
 * child, the group's people and notes, and the read-only session feed that is
 * the page's spine, all computed from a `now` the caller supplies. There are no
 * absolute dates anywhere: whenever a scene is opened it shows a plausible term
 * around today.
 *
 * Report copy, names and notes are mock **data** standing in for what a gedu
 * would have typed, so none of it is translated — the same convention every
 * other fixture file here follows.
 *
 * Every id that reaches an identicon (the child, the gedus) is a real generated
 * UUIDv4 hardcoded as a literal. Both halves matter: an identicon is a pattern
 * hashed out of the id's hex bytes, so a readable stand-in renders a degenerate
 * square, and generating one at module load or render time would give the same
 * person a different face on every reload.
 */

const TIMEZONE = "Europe/Helsinki";

/**
 * **Four scenarios, chosen for what they cannot show each other.**
 *
 * `active-club` is the kitchen sink and the only one with a live room.
 * `in-person-club` is the venue shape, which is the one arrangement where the
 * page has an address and no Join at all. `camp` is a finished, end-dated
 * product: no future block, no divider, and a remote room that will never open
 * again. `new-club` is the page before anything has happened in it, which is
 * the only way to judge the feed with an empty past.
 */
export const FAMILY_PRODUCT_SCENARIOS = [
  "active-club",
  "in-person-club",
  "camp",
  "new-club",
] as const;

export type FamilyProductScenario = (typeof FAMILY_PRODUCT_SCENARIOS)[number];

export function isFamilyProductScenario(s: string): s is FamilyProductScenario {
  return (FAMILY_PRODUCT_SCENARIOS as readonly string[]).includes(s);
}

export interface FamilyProductPageFixture {
  productName: string;
  schedule: FamilyProductSchedule;
  isRemote: boolean;
  gamer: { id: string; firstName: string };
  groupName: string;
  gedus: readonly FamilyProductGedu[];
  groupPublicNote: string | null;
  venue: FamilyProductVenue | null;
  voiceHref: string;
  entries: FamilySessionEntry[];
  sourceTimeZone: string;
}

/* ------------------------------------------------------------------ */
/*  People                                                             */
/* ------------------------------------------------------------------ */

/**
 * The child every scenario is about, and the gedus who teach her group.
 *
 * Real UUIDs, hardcoded, because each one renders as an identicon: the child's
 * beside "for Aino" in the masthead and the gedus' in their chips. A readable
 * key would render an empty pattern and make every avatar-bearing scene a false
 * picture of the real page.
 */
const AINO = {
  id: "b7d3a6a1-4c58-4f21-9e08-2d6a1f77c4b3",
  firstName: "Aino",
} as const;

const SANNA: FamilyProductGedu = {
  id: "4a84d001-b789-41f5-ace3-cfcffa139869",
  firstName: "Sanna",
};
const PETRA: FamilyProductGedu = {
  id: "96e29545-ad63-4948-b783-14e91189ad75",
  firstName: "Petra",
};
const JOONAS: FamilyProductGedu = {
  id: "d2826073-1d3f-4023-b45e-f42fea4332ca",
  firstName: "Joonas",
};

/**
 * A stand-in group id, used only to build the Join's href. It is deliberately
 * *not* a UUID: nothing hashes it into a picture, and a readable id makes the
 * inert link legible in the preview's status bar.
 */
const GROUP_ID = "mock-family-group";

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

/**
 * The longest report here, at the head of the past — the entry a family opens
 * this page to read.
 *
 * It is written the way a real one is rather than the way a renderer test is: a
 * dated title, then half a dozen short paragraphs of plain prose addressed to
 * the parent who will read it on a phone, and a line at the end to close it off.
 * At ~1500 characters it is the honest test of the no-clamp rule: the family
 * feed renders every report in full (the gedu clamps because their feed is a
 * work queue; here the reports are the page), so this is the fixture that shows
 * what a long week actually costs the page.
 */
const CASTLE_RECAP = `# The castle is finished

We spent the whole of this one on the castle, and it is finally the shape everyone has been arguing about since before the break.

The towers went up first. Aino and Väinö took one each and agreed a height beforehand, which is the first time that has happened without me suggesting it — the two towers actually match, and you can see the difference from the road.

Aino spent most of the evening on the gate. It opens on a lever hidden behind the left pillar, and she tested it about forty times before she let anybody else near it. It works every time now, which is more than can be said for most of the redstone in this world.

The great hall in the middle went up in about twenty minutes once the walls were in, and then took an hour because the floor pattern had to be right. That sounded like a mistake and turned out not to be: the room reads as a proper hall the moment you walk into it.

We ended with everyone standing on top of the north tower looking down at it, which felt like the right way to finish.

Thank you all — the castle stays in the world, so do go and walk around it during the week.`;

/**
 * A second long report deeper in the feed, so scrolling the history shows what
 * back-to-back full write-ups read like. Headings and a list rather than plain prose, so
 * the two long reports on the page are not the same shape.
 */
const NETHER_TRIP = `# The first trip through the portal

It went about as well as these ever do, which is to say loudly.

## What happened

- Two casualties, both recovered, both entirely their own fault
- One full inventory of quartz between the group
- A great deal of shouting about ghasts

We talked beforehand about leaving a marker at the portal, and about half the group did it. The half that did not spent twenty minutes finding their way back, which taught the point rather better than I could have.

Aino was one of the ones who marked hers, and then spent the rest of the session walking other people home. She did not mention it afterwards, so I am mentioning it here.

**Next week** we are staying on the surface. Several people have asked for a quieter session and I think they have earned one.`;

/** Short reports — the majority, because most weeks genuinely are. */
const SHORT_REPORTS: readonly string[] = [
  "# Redstone doors\n\nEveryone built a door that actually closes behind them, which took considerably longer than anyone expected.\n\nThe usual culprit is a repeater pointing the wrong way, and by the end most of the group was finding that themselves.",
  "# A fresh survival world\n\nWe started a survival world from scratch and got as far as a shared shelter and one very ambitious wheat field.\n\nThe shelter is not pretty. It is lit, walled and large enough for everyone, which was the whole brief.",
  "# Build battle: a shop that sells one thing\n\nForty minutes, two teams, one very silly brief.\n\nWe ended up with a shop that sells only ladders — four floors of them, all reachable by ladder — and a florist that is genuinely lovely.",
  "# Villager trading\n\nNobody expected an hour on emeralds to be popular, and yet.\n\nBy the end the group had a working trading hall and a shared argument about whether restocking counts as cheating.",
  "# Spawn, rebuilt\n\nSo that somebody joining for the first time can find their way around without asking.\n\n- A signposted junction where the four paths meet\n- A chest of starter tools anyone may take from",
  "# A quiet week\n\nA few were away, so we tidied rather than built: storage sorted, chests labelled, and a rule agreed about borrowing from the shared chest.\n\nThe rule is that you may borrow anything, and you put it back. We will see.",
  "# Enchanting and bookshelves\n\nEveryone left with at least one enchanted pickaxe and strong opinions about luck.\n\nFifteen bookshelves each is a lot of sugar cane, and the group worked out halfway through that it was faster to farm it together.",
  "# Mob-proofing night\n\nWe lit the paths, walled the gaps, and lost nobody to a creeper for an entire session, which is a first.\n\nWorth repeating at home: walk the route you actually use, and put a torch wherever it is dark enough to be a problem.",
];

/**
 * Reports written *before* a session, which is the same field at an earlier
 * moment. Rare on purpose: a gedu plans two or three ahead, not eight, and most
 * of what the upward reveal uncovers has to be bare dated rows or the collapsed
 * future block is not being judged honestly.
 */
const LIGHTHOUSE_PLAN = `# The lighthouse

We are finishing the harbour road and starting on the lighthouse at the end of it.

**Bring:** ideas for what should be inside it. A library, a beacon room and a slide have all been suggested, and only one of those is structurally sensible.`;

const SORTERS_PLAN =
  "# Redstone follow-up\n\nWe are wiring the item sorters into the storage room and finding out whether the overflow fix survives eight people using it at once.";

/* ------------------------------------------------------------------ */
/*  Specs                                                              */
/* ------------------------------------------------------------------ */

/**
 * What each session is, newest first. Index 0 is the furthest-away future
 * session; the leading run of `future` specs is the horizon, the last of them is
 * the next session, and everything after that is the past.
 *
 * A past spec with **no report and no attendance** is the quiet placeholder row
 * — a session that ran with nothing written down about it. There is no separate
 * "no record" spec, because a family has no way to tell that state apart from
 * the epoch-exempt one the gedu's feed distinguishes, and inventing the
 * difference here would be inventing it on the page.
 */
type FamilyEntrySpec =
  | { kind: "future"; report?: string }
  | { kind: "past"; report?: string; attendance?: AttendanceMark };

/**
 * The active club's run: seven sessions ahead (so the divider reads "6 upcoming
 * sessions" and the reveal is judged against a screenful) and sixteen behind,
 * which is four months and therefore three or four month dividers plus the
 * chunked "show earlier" control.
 *
 * The first six past entries are the states worth seeing side by side:
 *
 * 1. the long recap, at the head of the past, rendered in full;
 * 2. an ordinary week, present, short report;
 * 3. **a session this child was not at** — the muted neutral mark;
 * 4. the second long report, deeper in the history, rendered in full like
 *    everything else;
 * 5. a week with a report and **no mark at all**, which renders the write-up
 *    and says nothing about attendance, because nobody said anything;
 * 6. a week with **nothing on it**, the quiet dashed line.
 */
const ACTIVE_CLUB_SPECS: readonly FamilyEntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future", report: SORTERS_PLAN },
  { kind: "future" },
  { kind: "future" },
  { kind: "future", report: LIGHTHOUSE_PLAN },

  { kind: "past", report: CASTLE_RECAP, attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[0], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[1], attendance: "absent" },
  { kind: "past", report: NETHER_TRIP, attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[2] },
  { kind: "past" },
  { kind: "past", report: SHORT_REPORTS[3], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[4], attendance: "present" },
  { kind: "past", attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[5], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[6], attendance: "absent" },
  { kind: "past", report: SHORT_REPORTS[7], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[0], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[1], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[2], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[3], attendance: "present" },
];

/** The in-person club: shorter run, same grammar, no live room anywhere. */
const IN_PERSON_CLUB_SPECS: readonly FamilyEntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "past", report: SHORT_REPORTS[4], attendance: "present" },
  { kind: "past", report: SHORT_REPORTS[5], attendance: "present" },
  { kind: "past", report: NETHER_TRIP, attendance: "absent" },
  { kind: "past", report: SHORT_REPORTS[6] },
  { kind: "past", report: SHORT_REPORTS[7], attendance: "present" },
  { kind: "past" },
  { kind: "past", report: SHORT_REPORTS[0], attendance: "present" },
];

/**
 * The camp: five days, all of them behind us, none of them ahead.
 *
 * No future spec at all, which is the state the divider cannot exist in — the
 * feed is a plain descending run of history with a month label if the week
 * straddled one. The most recent day is written up in full, as the head of the
 * past always is.
 */
const CAMP_SPECS: readonly FamilyEntrySpec[] = [
  {
    kind: "past",
    attendance: "present",
    report: `# Day five: the showcase

Every team demoed their finished course, and then we all took turns failing at each other's.

Aino's team built the one with the disappearing floor, which nobody got round on the first attempt and two people refused to attempt at all.

The courses stay up over the weekend, so there is time to have another go at home before they come down.

Thank you for a very good week — they were tired by Wednesday and still turned up early every morning after it.`,
  },
  {
    kind: "past",
    attendance: "present",
    report:
      "# Day four: sound and lighting\n\nNeon needs neon, so the afternoon went on emissive parts and a soundtrack that loops without anyone noticing the seam.\n\nThere is now a very loud sound on the finish line, which was not my idea and is staying.",
  },
  {
    kind: "past",
    attendance: "present",
    report:
      "# Day three: our first scripts\n\nWe wrote our first Lua today — a checkpoint that saves where you got to — and then broke it on purpose to find out what the error messages actually mean.\n\nThe useful part was the breaking. A script that says it cannot find something is not being rude, it is telling you the thing is not there.",
  },
  {
    kind: "past",
    attendance: "absent",
    report:
      "# Day two: building the course\n\nTeams of two, one obstacle each, all snapped together into a single course by the end of the afternoon.\n\nIt is unfair and much too long, which everyone considers to be the point.",
  },
  {
    kind: "past",
    attendance: "present",
    report:
      "# Day one: getting started\n\nEveryone got a Roblox Studio account working, made a baseplate and pushed a block off it.\n\nA quiet start on purpose. Tomorrow we pick a theme and start building for real.",
  },
];

/**
 * A club nobody has met for yet: eight sessions ahead, nothing behind.
 *
 * The whole point of the scenario is the empty past, so the horizon is left
 * almost bare — one plan on the first session and nothing else, which is what a
 * gedu has actually written by the time a family lands here after buying a
 * place.
 */
const NEW_CLUB_SPECS: readonly FamilyEntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    report:
      "# First session\n\nWe start with names, ground rules and one baseplate each. Nothing to bring and nothing to install — everything happens in the room we join from here.",
  },
];

/* ------------------------------------------------------------------ */
/*  Scenario configuration                                             */
/* ------------------------------------------------------------------ */

type Cadence = "weekly" | "daily";

/**
 * Where the run is pinned against `now`, and therefore what state it is in.
 *
 * Each variant carries the wall-clock slot it implies, because **the slot is
 * the authority and the dates are derived from it** — never the other way
 * round. The page's schedule line and its voice window are both read off the
 * slot, and the feed's session instants are resolved from the same slot through
 * the same helper the voice window uses, so the two cannot disagree. Deriving
 * the slot back out of an instant looks equivalent and is not: on the one night
 * a year when a wall clock happens twice, the round trip picks the other
 * instance and the page ends up claiming a locked room over a session that is
 * running.
 */
type Anchor =
  /**
   * The next session is **in progress right now**, so the room is open, the
   * Join is lit and the top entry says so. Its slot is `now` floored to a
   * half-hour boundary in the product's zone — a boundary rather than `now`
   * itself, so the schedule line reads like a schedule ("17:00–18:30") instead
   * of like the moment the page happened to be opened.
   */
  | { kind: "live" }
  /** The next session is the next occurrence of `weekday` at `startTime`. */
  | { kind: "next-occurrence"; weekday: number; startTime: string }
  /**
   * Everything is behind us: the newest session ran `weeksAgo` whole weeks
   * before the next occurrence of `weekday`, so the weekday and the wall clock
   * both survive the shift.
   */
  | {
      kind: "finished";
      weekday: number;
      startTime: string;
      weeksAgo: number;
    };

interface ScenarioConfig {
  productName: string;
  productType: FamilyProductSchedule["product_type"];
  cadence: Cadence;
  anchor: Anchor;
  specs: readonly FamilyEntrySpec[];
  durationMinutes: number;
  isRemote: boolean;
  groupName: string;
  gedus: readonly FamilyProductGedu[];
  groupPublicNote: string | null;
  venue: FamilyProductVenue | null;
  /**
   * Whether the product's `start_date` is the day of its first *listed*
   * session rather than the day of its oldest one. A club a family has just
   * bought into has not started yet, and the boundary is what makes its voice
   * window locked rather than open.
   */
  startsWithFeed?: boolean;
}

const SCENARIOS: Record<FamilyProductScenario, ScenarioConfig> = {
  /**
   * **The kitchen sink**, and the only scenario with a live room: a remote
   * weekly club four months into its run, with a session in progress, seven
   * more ahead of it and sixteen behind.
   *
   * The club is named for what it builds rather than for a weekday, and that is
   * load-bearing: the run is anchored to *today* so the room can be open while
   * somebody is looking at the page, which means the sessions land on whatever
   * weekday the scene is opened on. A "Monday club" would then be a club whose
   * own name disagreed with every date under it.
   */
  "active-club": {
    productName: "Minecraft Builders Club",
    productType: "consumer_club",
    cadence: "weekly",
    anchor: { kind: "live" },
    specs: ACTIVE_CLUB_SPECS,
    durationMinutes: 90,
    isRemote: true,
    groupName: "Builders A",
    gedus: [SANNA, PETRA],
    groupPublicNote:
      "Builders A is our redstone-heavy group. The shared world carries across every session, so anything Aino builds stays there for next week — scroll back through the sessions below to see what the group has made since it started.",
    venue: null,
  },

  /**
   * **The venue shape.** In person, so there is no room and therefore no Join
   * at all — not a locked one — and the masthead carries an address instead.
   * It is also the only scenario with a second standing note, because the venue
   * has things to say that the group does not: where to drop off, which floor,
   * when the café shuts.
   */
  "in-person-club": {
    productName: "Roblox Afternoon Club",
    productType: "consumer_club",
    cadence: "weekly",
    anchor: { kind: "next-occurrence", weekday: 2, startTime: "15:30" },
    specs: IN_PERSON_CLUB_SPECS,
    durationMinutes: 90,
    isRemote: false,
    groupName: "Wednesday green",
    gedus: [PETRA, JOONAS],
    groupPublicNote:
      "Wednesday green are working through Roblox Studio from the beginning. Nothing needs installing at home — everything happens on the library's machines.",
    venue: {
      name: "Sello Library, Espoo",
      address: "Leppävaarankatu 9, 02600 Espoo",
      publicNote:
        "Drop-off and pick-up are at the main entrance on Leppävaarankatu. Come up to the second floor and the group room is on the right, past the study desks. There is a water fountain outside the room, and the café downstairs closes at 16:00.",
    },
  },

  /**
   * **A product whose run is over.** Five consecutive weekdays, all of them
   * behind us, so the feed is history end to end: no future block, no divider,
   * and no "show earlier" either, since five entries fit inside the opening
   * slice. It is remote, which makes it the one scenario proving that a
   * *finished* remote product renders no Join — a locked button promises an
   * unlock, and this room will never open again.
   */
  camp: {
    productName: "Roblox Builders Camp",
    productType: "camp",
    cadence: "daily",
    anchor: {
      kind: "finished",
      weekday: 4,
      startTime: "10:00",
      weeksAgo: 4,
    },
    specs: CAMP_SPECS,
    durationMinutes: 180,
    isRemote: true,
    groupName: "Builders red",
    gedus: [SANNA, JOONAS],
    groupPublicNote:
      "Builders red worked towards one shared obstacle course by Friday. Everything each team built got snapped into it at the end of the week.",
    venue: null,
  },

  /**
   * **The page before anything has happened in it** — bought last week, first
   * session still to come. The only way to judge the feed with an empty past,
   * and the reason the column says so rather than simply stopping under the
   * divider. The Join is locked, which is what a family sees for all but the
   * five minutes before each session.
   */
  "new-club": {
    productName: "Minecraft Starters Club",
    productType: "consumer_club",
    cadence: "weekly",
    anchor: { kind: "next-occurrence", weekday: 0, startTime: "17:00" },
    specs: NEW_CLUB_SPECS,
    durationMinutes: 90,
    isRemote: true,
    groupName: "Starters B",
    gedus: [SANNA],
    groupPublicNote:
      "Starters B is a brand-new group and everybody in it is starting from the same place. The first couple of sessions are mostly getting set up and getting to know each other.",
    venue: null,
    startsWithFeed: true,
  },
};

/* ------------------------------------------------------------------ */
/*  Building                                                           */
/* ------------------------------------------------------------------ */

export function buildFamilyProductPageFixture(
  now: Date,
  scenario: FamilyProductScenario,
): FamilyProductPageFixture {
  const config = SCENARIOS[scenario];
  const futureCount = countLeadingFutureSpecs(config.specs);

  // The slot first, the dates from it. See the anchor type's own note for why
  // that order is load-bearing rather than incidental.
  const slot = resolveSlot(now, config);
  const durationMs = config.durationMinutes * 60 * 1000;

  const starts = buildStarts({
    anchor: resolveAnchor(now, config.anchor, slot, durationMs),
    // With a future block the anchor is the *next* session, which sits at the
    // end of that block; with none it is the newest past entry, at index 0.
    anchorIndex: Math.max(futureCount - 1, 0),
    count: config.specs.length,
    cadence: config.cadence,
  });

  const entries = config.specs.map((spec, index) => {
    const startsAt = starts[index];
    const endsAt = new Date(startsAt.getTime() + durationMs);
    // Index-keyed rather than date-keyed, so an entry keeps its identity across
    // the `useNow()` tick and React never re-creates a row mid-scroll.
    return toEntry(spec, `mock-family-session-${index}`, startsAt, endsAt);
  });

  const oldest = starts[starts.length - 1];
  const newest = starts[0];
  const firstListed = starts[Math.max(futureCount - 1, 0)];

  return {
    productName: config.productName,
    schedule: {
      product_type: config.productType,
      timezone: TIMEZONE,
      start_date: dateIn(config.startsWithFeed === true ? firstListed : oldest),
      // Only an end-dated product has one. A club runs until somebody stops it,
      // and giving it an end date here would take the occurrence cap off its
      // horizon and change the shape of the page for a reason nothing on it
      // explains.
      end_date: config.productType === "camp" ? dateIn(newest) : null,
      schedule_slots: slotsFor(config, slot),
    },
    isRemote: config.isRemote,
    gamer: AINO,
    groupName: config.groupName,
    gedus: config.gedus,
    groupPublicNote: config.groupPublicNote,
    venue: config.venue,
    voiceHref: `/voice/group/${GROUP_ID}`,
    entries,
    sourceTimeZone: TIMEZONE,
  };
}

/** How many of a spec list's leading entries are future sessions. */
function countLeadingFutureSpecs(specs: readonly FamilyEntrySpec[]): number {
  let count = 0;
  while (count < specs.length && specs[count].kind === "future") count += 1;
  return count;
}

function toEntry(
  spec: FamilyEntrySpec,
  id: string,
  startsAt: Date,
  endsAt: Date,
): FamilySessionEntry {
  if (spec.kind === "future") {
    return { kind: "future", id, startsAt, endsAt, report: spec.report ?? null };
  }
  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    report: spec.report ?? null,
    attendance: spec.attendance ?? null,
  };
}

/** The wall-clock slot the whole run hangs off. */
interface SlotTime {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** `HH:mm` in the product's zone. */
  startTime: string;
}

/**
 * Which wall-clock slot this scenario's product is scheduled on.
 *
 * Declared by every anchor but the live one, which has to derive it from `now`
 * — a room can only be open while somebody is looking at the page if the club
 * meets on the day they opened it.
 */
function resolveSlot(now: Date, config: ScenarioConfig): SlotTime {
  if (config.anchor.kind !== "live") {
    return {
      weekday: config.anchor.weekday,
      startTime: config.anchor.startTime,
    };
  }
  return resolveLiveSlot(now, config.durationMinutes * 60 * 1000);
}

/**
 * A wall-clock slot whose current occurrence is genuinely under way.
 *
 * The obvious answer — `now` floored to the previous half hour — is right for
 * all but one hour of the year. On the autumn night the clocks go back, the
 * floored wall clock is one that happens *twice*, and the schedule resolver
 * picks the later of the two: a slot derived at 03:20 EEST resolves to 03:00
 * EET, forty minutes into the future, and the scenario that exists to show a
 * lit Join shows a locked one instead.
 *
 * So the slot is *checked* rather than assumed, by resolving it exactly the way
 * the page will and asking whether the answer is under way. A candidate that is
 * not steps back another half hour and is checked again, which walks out of the
 * repeated hour on the second try. **The step is half an hour of wall clock,
 * not of elapsed time** — stepping back in real time inside the repeated hour
 * only lands on another wall clock inside it, which is where the first attempt
 * at this fix went round in a circle.
 *
 * The walk stops at midnight and at three attempts: past either it would be
 * shopping for a different day's session, and a scenario that quietly rendered
 * the wrong weekday to keep a button lit would be worse than one that is
 * briefly locked.
 */
function resolveLiveSlot(now: Date, durationMs: number): SlotTime {
  const weekday = weekdayIn(now);
  const wall = zonedWallMinutes(now);
  // Floored to the boundary at or before now, so the schedule line reads like a
  // schedule ("17:00–18:30") rather than like the moment the page was opened.
  let minutes = wall - (wall % 30);
  const first: SlotTime = { weekday, startTime: clockFace(minutes) };

  for (let attempt = 0; attempt < 3 && minutes >= 0; attempt++) {
    const slot: SlotTime = { weekday, startTime: clockFace(minutes) };
    const start = resolveAnchor(
      now,
      { kind: "live" },
      slot,
      durationMs,
    ).getTime();
    if (start <= now.getTime() && now.getTime() < start + durationMs) {
      return slot;
    }
    minutes -= 30;
  }
  return first;
}

/** Minutes since local midnight, in the product's zone. */
function zonedWallMinutes(instant: Date): number {
  const [hours, minutes] = formatInTimeZone(instant, TIMEZONE, "HH:mm")
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

/** `HH:mm` from minutes since midnight. */
function clockFace(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * The instant the run is pinned to — resolved from the slot through the same
 * helper the voice window resolves its occurrences with.
 *
 * That sharing is the point. The masthead's Join asks "is an occurrence of this
 * slot open right now?" and the feed asks "when is the next occurrence of this
 * slot?", and a fixture that answered the second question with its own
 * arithmetic would eventually disagree with the first. It did: flooring `now` to
 * a half hour and calling that the session start put the two an hour apart on
 * the autumn night when 03:00 happens twice in Helsinki, so the page showed a
 * locked room over a session that was running.
 */
function resolveAnchor(
  now: Date,
  anchor: Anchor,
  slot: SlotTime,
  durationMs: number,
): Date {
  const schedule = {
    dayOfWeek: slot.weekday,
    startTime: slot.startTime,
    timezone: TIMEZONE,
  };
  switch (anchor.kind) {
    // The same answer for both, and deliberately: "the next session" means the
    // one running right now when there is one. A club meeting as somebody opens
    // the page should have that session at the head of the feed rather than
    // demoted to the newest past entry with an attendance mark on it, whether
    // or not the scenario was written to be live.
    case "live":
    case "next-occurrence":
      return currentOrNextOccurrence(now, schedule, durationMs);
    case "finished":
      return shiftZonedDays(
        getNextSessionStart(schedule, { now }),
        -7 * anchor.weeksAgo,
      );
  }
}

/**
 * The occurrence of a slot that is under way right now, or the next one if none
 * is.
 *
 * The running one is looked for from a search point a week back, which is
 * exactly how the voice window finds an in-progress session: the schedule
 * resolver only ever returns a *future* start, so asking it from `now` would
 * skip the session currently happening.
 *
 * **The answer is checked before it is trusted.** That resolver can hand back a
 * start earlier than the point it was asked from: on the day the clocks go back
 * the local day is twenty-five hours long, so its "one day later" candidate
 * lands on the same weekday again, matches, and returns *last week's* session.
 * Taken at face value that would date the head of this feed a week in the past
 * while labelling it upcoming. Anything not genuinely running is therefore
 * discarded in favour of the next future occurrence, which costs the live
 * scenario its lit Join for that one day — honest, and the same conclusion the
 * voice window reaches on its own.
 */
function currentOrNextOccurrence(
  now: Date,
  schedule: { dayOfWeek: number; startTime: string; timezone: string },
  durationMs: number,
): Date {
  const candidate = getNextSessionStart(schedule, {
    now: shiftZonedDays(now, -7),
  });
  const start = candidate.getTime();
  return start <= now.getTime() && now.getTime() < start + durationMs
    ? candidate
    : getNextSessionStart(schedule, { now });
}

/**
 * Every session start in the run, newest first, stepping out from the anchor in
 * both directions.
 *
 * **Every step walks the calendar in the product's own zone** rather than adding
 * a flat number of milliseconds: across a DST boundary a flat step drifts an
 * hour, which shows up in the feed as a club that mysteriously met half an hour
 * earlier for part of the term.
 */
function buildStarts(opts: {
  anchor: Date;
  anchorIndex: number;
  count: number;
  cadence: Cadence;
}): Date[] {
  const { anchor, anchorIndex, count, cadence } = opts;
  const forward = (from: Date) =>
    cadence === "weekly" ? shiftZonedDays(from, 7) : nextWeekday(from, 1);
  const backward = (from: Date) =>
    cadence === "weekly" ? shiftZonedDays(from, -7) : nextWeekday(from, -1);

  const starts: Date[] = new Array<Date>(count);
  starts[anchorIndex] = anchor;
  for (let i = anchorIndex - 1; i >= 0; i--) starts[i] = forward(starts[i + 1]);
  for (let i = anchorIndex + 1; i < count; i++) {
    starts[i] = backward(starts[i - 1]);
  }
  return starts;
}

/**
 * The schedule slots the page's "when" line and its voice window are both read
 * off — the same wall clock the run's dates were resolved from, so a schedule
 * line saying Mondays can never sit above a feed full of Thursdays.
 *
 * A weekly product has the one slot; a daily one runs Mon–Fri at the same time,
 * which is what a camp is.
 */
function slotsFor(
  config: ScenarioConfig,
  slot: SlotTime,
): FamilyProductSchedule["schedule_slots"] {
  const weekdays = config.cadence === "weekly" ? [slot.weekday] : [0, 1, 2, 3, 4];
  return weekdays.map((weekday) => ({
    weekday,
    start_time: slot.startTime,
    duration_minutes: config.durationMinutes,
  }));
}

/* ------------------------------------------------------------------ */
/*  Zone arithmetic                                                    */
/* ------------------------------------------------------------------ */

/** Shift by whole calendar days in the product's zone, keeping the wall clock. */
function shiftZonedDays(instant: Date, days: number): Date {
  if (days === 0) return instant;
  const zoned = toZonedTime(instant, TIMEZONE);
  zoned.setDate(zoned.getDate() + days);
  return fromZonedTime(zoned, TIMEZONE);
}

/** One Mon–Fri day forward or back, keeping the wall clock. */
function nextWeekday(instant: Date, direction: 1 | -1): Date {
  let candidate = shiftZonedDays(instant, direction);
  while (weekdayIn(candidate) > 4) {
    candidate = shiftZonedDays(candidate, direction);
  }
  return candidate;
}

/** 0 = Monday … 6 = Sunday, as the instant falls in the product's zone. */
function weekdayIn(instant: Date): number {
  const jsDay = toZonedTime(instant, TIMEZONE).getDay();
  return (jsDay + 6) % 7;
}

/** `YYYY-MM-DD` as the instant falls in the product's zone. */
function dateIn(instant: Date): string {
  return formatInTimeZone(instant, TIMEZONE, "yyyy-MM-dd");
}
