import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { getNextSessionStart } from "@/lib/enrollment";
import type { AttendanceMark } from "@/components/session-feed";
import type {
  FamilyProductCancellation,
  FamilyProductSchedule,
} from "./FamilyProductPageBody";
import type {
  FamilyProductGedu,
  FamilyProductSite,
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
 * **Five scenarios, chosen for what they cannot show each other.**
 *
 * `active-club` is the kitchen sink and the only one with a live room.
 * `in-person-club` is the site shape, which is the one arrangement where the
 * page has an address and no Join at all. `camp` is a finished, end-dated
 * product: no future block, no divider, and a remote room that will never open
 * again. `locked-join` is the page in its resting state — the locked button
 * naming its open time, which is what a family sees all week outside the voice
 * window, and the one Join state no other scenario can show (active-club's room
 * is deliberately live). It is dressed as a brand-new club, so the empty past
 * comes along incidentally — not because "no history yet" is a state that
 * needs designing for, but because a locked Join needed a page to live on.
 *
 * `my-own-club` is the **parent's own seat** — the one scenario where the
 * reader is the participant. It is not a variation on `active-club`: three
 * things on the page are worded in the second person there and in the third
 * person everywhere else, and none of them can be looked at on a page about
 * somebody's child. It carries the failing card for the same reason
 * `in-person-club` does — that notice is the longest of the three self-worded
 * strings and the one most likely to read wrong — which is why the two never
 * share a page.
 */
export const FAMILY_PRODUCT_SCENARIOS = [
  "active-club",
  "in-person-club",
  "camp",
  "locked-join",
  "my-own-club",
] as const;

export type FamilyProductScenario = (typeof FAMILY_PRODUCT_SCENARIOS)[number];

export function isFamilyProductScenario(s: string): s is FamilyProductScenario {
  return (FAMILY_PRODUCT_SCENARIOS as readonly string[]).includes(s);
}

export interface FamilyProductPageFixture {
  productName: string;
  schedule: FamilyProductSchedule;
  isRemote: boolean;
  /** Whoever holds the seat — a child on every scenario but `my-own-club`. */
  participant: { id: string; firstName: string };
  /**
   * The participant **is** the reader.
   *
   * A fixture field rather than a scene prop, because it is a fact about the
   * enrollment the fixture describes and not about which URL is open — the live
   * page derives exactly this by comparing the signed-in user with the feed's
   * participant, and a scene that decided it from its own surface would be
   * proving the scene's conditional instead of the page's.
   */
  isSelfSeat: boolean;
  groupName: string;
  /** The parent-only payment-problem notice. Never true beside a cancellation. */
  paymentProblem: boolean;
  /** The parent-only "won't renew" notice, or `null` on a healthy enrollment. */
  cancellation: FamilyProductCancellation | null;
  gedus: readonly FamilyProductGedu[];
  groupPublicNote: string | null;
  site: FamilyProductSite | null;
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

/**
 * Aino's mother — the reader, on the one scenario where the seat is her own.
 *
 * Her name is in the fixture and deliberately never rendered: the whole point
 * of the self variant is that the page addresses her in the second person, so
 * a scene showing "Marja" anywhere is the bug this scenario exists to catch.
 * The id still has to be a real UUID, because her identicon sits beside the
 * "for you" line exactly where Aino's sits beside "for Aino".
 */
const MARJA = {
  id: "7a212fe5-26bc-4511-98a6-b879e031a15d",
  firstName: "Marja",
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
 *
 * **`lastEditedBy` is written per spec rather than derived.** The chip on a card
 * names the gedu who last touched that session, so it is a fact about the
 * individual week and not a rotation anything could compute. A spec carrying a
 * report names one of its scenario's own gedus; a spec with no report needs
 * none, because the chip renders only where there is a write-up to sign.
 *
 * The mix is deliberate on the two-gedu scenarios: one gedu writes most weeks
 * and the other appears on a handful, which is what a group with a regular and a
 * stand-in actually looks like — and it means a scroll through the term shows
 * two faces rather than one repeated or two alternating like a pattern. The
 * single-gedu scenarios name their one gedu throughout, which is the commoner
 * shape and the one that proves a signed feed does not need variety to read.
 */
type FamilyEntrySpec =
  | { kind: "future"; report?: string; lastEditedBy?: FamilyProductGedu }
  | {
      kind: "past";
      report?: string;
      attendance?: AttendanceMark;
      lastEditedBy?: FamilyProductGedu;
    };

/**
 * The active club's run: seven sessions ahead (so the divider reads "6 upcoming
 * sessions" and the reveal is judged against a screenful) and sixteen behind,
 * which is four months and therefore three or four month dividers plus a
 * history the scroll sentinel has to feed in more than one chunk.
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
  { kind: "future", report: SORTERS_PLAN, lastEditedBy: SANNA },
  { kind: "future" },
  { kind: "future" },
  { kind: "future", report: LIGHTHOUSE_PLAN, lastEditedBy: SANNA },

  { kind: "past", report: CASTLE_RECAP, attendance: "present", lastEditedBy: SANNA },
  {
    kind: "past",
    report: SHORT_REPORTS[0],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[1],
    attendance: "absent",
    lastEditedBy: PETRA,
  },
  { kind: "past", report: NETHER_TRIP, attendance: "present", lastEditedBy: SANNA },
  { kind: "past", report: SHORT_REPORTS[2], lastEditedBy: SANNA },
  { kind: "past" },
  {
    kind: "past",
    report: SHORT_REPORTS[3],
    attendance: "present",
    lastEditedBy: PETRA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[4],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  { kind: "past", attendance: "present" },
  {
    kind: "past",
    report: SHORT_REPORTS[5],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[6],
    attendance: "absent",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[7],
    attendance: "present",
    lastEditedBy: PETRA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[0],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[1],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[2],
    attendance: "present",
    lastEditedBy: SANNA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[3],
    attendance: "present",
    lastEditedBy: SANNA,
  },
];

/** The in-person club: shorter run, same grammar, no live room anywhere. */
const IN_PERSON_CLUB_SPECS: readonly FamilyEntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  {
    kind: "past",
    report: SHORT_REPORTS[4],
    attendance: "present",
    lastEditedBy: PETRA,
  },
  {
    kind: "past",
    report: SHORT_REPORTS[5],
    attendance: "present",
    lastEditedBy: PETRA,
  },
  { kind: "past", report: NETHER_TRIP, attendance: "absent", lastEditedBy: JOONAS },
  { kind: "past", report: SHORT_REPORTS[6], lastEditedBy: PETRA },
  {
    kind: "past",
    report: SHORT_REPORTS[7],
    attendance: "present",
    lastEditedBy: PETRA,
  },
  { kind: "past" },
  {
    kind: "past",
    report: SHORT_REPORTS[0],
    attendance: "present",
    lastEditedBy: JOONAS,
  },
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
    lastEditedBy: SANNA,
    report: `# Day five: the showcase

Every team demoed their finished course, and then we all took turns failing at each other's.

Aino's team built the one with the disappearing floor, which nobody got round on the first attempt and two people refused to attempt at all.

The courses stay up over the weekend, so there is time to have another go at home before they come down.

Thank you for a very good week — they were tired by Wednesday and still turned up early every morning after it.`,
  },
  {
    kind: "past",
    attendance: "present",
    lastEditedBy: SANNA,
    report:
      "# Day four: sound and lighting\n\nNeon needs neon, so the afternoon went on emissive parts and a soundtrack that loops without anyone noticing the seam.\n\nThere is now a very loud sound on the finish line, which was not my idea and is staying.",
  },
  {
    kind: "past",
    attendance: "present",
    lastEditedBy: JOONAS,
    report:
      "# Day three: our first scripts\n\nWe wrote our first Lua today — a checkpoint that saves where you got to — and then broke it on purpose to find out what the error messages actually mean.\n\nThe useful part was the breaking. A script that says it cannot find something is not being rude, it is telling you the thing is not there.",
  },
  {
    kind: "past",
    attendance: "absent",
    lastEditedBy: SANNA,
    report:
      "# Day two: building the course\n\nTeams of two, one obstacle each, all snapped together into a single course by the end of the afternoon.\n\nIt is unfair and much too long, which everyone considers to be the point.",
  },
  {
    kind: "past",
    attendance: "present",
    lastEditedBy: SANNA,
    report:
      "# Day one: getting started\n\nEveryone got a Roblox Studio account working, made a baseplate and pushed a block off it.\n\nA quiet start on purpose. Tomorrow we pick a theme and start building for real.",
  },
];

/**
 * The parent's own club: three sessions ahead, six behind.
 *
 * Short on purpose — the history is not what this scenario is for, and a
 * fourth long feed would only make the page slower to read. What it does need
 * is enough past to prove the ordinary machinery is untouched on a self seat:
 * reports render, an attendance mark renders (a gedu marks a parent present
 * exactly as they mark a child), an unmarked week renders nothing, and a bare
 * week renders the quiet line.
 *
 * The write-ups are addressed to a room of adults rather than to a parent
 * *about* a child, which is what a gedu running a parents' evening would
 * actually type.
 */
const PARENTS_CLUB_SPECS: readonly FamilyEntrySpec[] = [
  { kind: "future" },
  { kind: "future" },
  {
    kind: "future",
    lastEditedBy: JOONAS,
    report:
      "# Next week: the parental controls tour\n\nWe are going through the console and launcher settings together — screen time, purchases, and who can message whom.\n\n**Bring** the device your family actually argues about. Nothing needs installing beforehand.",
  },

  {
    kind: "past",
    attendance: "present",
    lastEditedBy: JOONAS,
    report: `# What our kids are actually building

A slower session than usual, and a better one for it.

We went round the room and everyone described what their child is building at the moment. Two of you had not seen it, which turned into the most useful ten minutes of the evening — the shared world is open to parents, and several people logged in for the first time.

The redstone conversation ran long. The short version: the contraptions are genuinely engineering, the frustration is genuinely part of it, and the thing that helps most is asking what they were trying to make rather than what went wrong.

We finished on screen time. No consensus, which was expected, but the agreement that a stopping point works better than a countdown was unanimous.`,
  },
  {
    kind: "past",
    attendance: "present",
    lastEditedBy: JOONAS,
    report:
      "# Servers, whitelists and who can join\n\nWe walked through how a private world differs from a public one, and why the club's own world is neither.\n\nThe practical takeaway: a whitelist is a list of names, somebody has to keep it, and that somebody is us.",
  },
  { kind: "past", attendance: "absent" },
  {
    kind: "past",
    lastEditedBy: JOONAS,
    report:
      "# The first evening\n\nIntroductions, what each of us was hoping to get out of this, and a very quick tour of the game most of our children spend their week in.\n\nNobody was expected to have played before, and most had not.",
    attendance: "present",
  },
  { kind: "past", report: SHORT_REPORTS[5], lastEditedBy: JOONAS },
  { kind: "past", attendance: "present" },
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
    lastEditedBy: SANNA,
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
  /**
   * Who holds the seat. Omitted means Aino, which is every scenario but the
   * parent's own — the child is the default because the child is the case.
   */
  participant?: { id: string; firstName: string };
  /**
   * The participant is the reader. Set on exactly one scenario, and it is what
   * flips the page's whole attribution into the second person.
   */
  selfSeat?: boolean;
  cadence: Cadence;
  anchor: Anchor;
  specs: readonly FamilyEntrySpec[];
  durationMinutes: number;
  isRemote: boolean;
  groupName: string;
  gedus: readonly FamilyProductGedu[];
  groupPublicNote: string | null;
  site: FamilyProductSite | null;
  /**
   * The parent-only billing states, both of which the gamer's copy of this page
   * must render nothing for. Only one scenario carries each: they are mutually
   * exclusive on one enrollment (Stripe cannot be `past_due` and `canceling` at
   * once), and a page carrying neither is the ordinary case every other scenario
   * is showing.
   */
  paymentProblem?: boolean;
  /** Days from `now` that paid access runs out, when the parent has cancelled. */
  cancelledAccessInDays?: number | null;
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
    site: null,
    // The membership winding down, on the club rather than the camp: a camp is
    // bought outright and has no subscription to not-renew, so a "won't renew"
    // line there would be describing something that cannot happen. The parent's
    // copy of this page shows the neutral notice; the gamer's copy renders the
    // same scenario and must show nothing, which is what makes this the right
    // scenario to hang it on.
    cancelledAccessInDays: 24,
  },

  /**
   * **The site shape.** In person, so there is no room and therefore no Join
   * at all — not a locked one — and the masthead carries an address instead.
   * It is also the only scenario with a second standing note, because the site
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
    site: {
      name: "Sello Library, Espoo",
      address: "Leppävaarankatu 9, 02600 Espoo",
      publicNote:
        "Drop-off and pick-up are at the main entrance on Leppävaarankatu. Come up to the second floor and the group room is on the right, past the study desks. There is a water fountain outside the room, and the café downstairs closes at 16:00.",
    },
    // The failing card, on the one scenario with no Join anywhere: the
    // destructive notice then has the top of the page to itself, which is where
    // it has to be legible, and the two states never appear on one page.
    paymentProblem: true,
  },

  /**
   * **A product whose run is over.** Five consecutive weekdays, all of them
   * behind us, so the feed is history end to end: no future block, no divider,
   * and nothing for the scroll sentinel to reveal either, since five entries fit
   * inside the opening slice. It is remote, which makes it the one scenario proving that a
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
    site: null,
  },

  /**
   * **The resting-state Join** — locked and naming its open time, which is
   * what a family sees all week outside the voice window and what no other
   * scenario can show. Dressed as a club bought last week with its first
   * session still to come, so the feed also happens to demonstrate that an
   * empty history simply ends at the divider — absence, not a placeholder.
   */
  "locked-join": {
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
    site: null,
    startsWithFeed: true,
  },

  /**
   * **The parent's own seat**, and the only page here the reader is *in*.
   *
   * A parents' evening club, remote and running right now, so the two things
   * the self variant changes are both on screen at once: the masthead reads
   * "for you" over the reader's own identicon, and the Join is lit with no
   * account switch behind it — the live page hands this seat no join handler at
   * all, because the room is already gated on the person clicking.
   *
   * It carries the failing card rather than the cancellation because the
   * payment notice is the longest of the three self-worded strings and the one
   * whose third-person original ("to keep Aino's place") most obviously breaks
   * when the reader is the participant.
   */
  "my-own-club": {
    productName: "Parents’ Minecraft Evening",
    productType: "consumer_club",
    participant: MARJA,
    selfSeat: true,
    cadence: "weekly",
    anchor: { kind: "live" },
    specs: PARENTS_CLUB_SPECS,
    durationMinutes: 90,
    isRemote: true,
    groupName: "Parents’ evening",
    gedus: [JOONAS],
    groupPublicNote:
      "An hour a week for the grown-ups: what your children are building, how the games work, and what the settings actually do. No experience assumed, and nothing to install.",
    site: null,
    paymentProblem: true,
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
    participant: config.participant ?? AINO,
    isSelfSeat: config.selfSeat === true,
    groupName: config.groupName,
    paymentProblem: config.paymentProblem === true,
    cancellation:
      config.cancelledAccessInDays === undefined ||
      config.cancelledAccessInDays === null
        ? null
        : {
            accessUntil: new Date(
              now.getTime() + config.cancelledAccessInDays * 86_400_000,
            ),
            // The last covered session is the last one the paid window reaches.
            // Derived from the run rather than authored, so the notice cannot
            // name a date the feed above it disagrees with.
            lastSessionStart: lastStartWithin(
              starts,
              new Date(now.getTime() + config.cancelledAccessInDays * 86_400_000),
            ),
          },
    gedus: config.gedus,
    groupPublicNote: config.groupPublicNote,
    site: config.site,
    voiceHref: `/voice/group/${GROUP_ID}`,
    entries,
    sourceTimeZone: TIMEZONE,
  };
}

/**
 * The last session start at or before an instant — the final session a paid
 * window still covers.
 *
 * The starts run newest first, so the *first* one inside the window is the
 * latest of them. A window that closes before every remaining session (or a run
 * with none ahead) answers `null`, which is the case the notice has its own
 * sentence for.
 */
function lastStartWithin(starts: readonly Date[], until: Date): Date | null {
  return (
    starts.find((start) => start.getTime() <= until.getTime()) ?? null
  );
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
  // A spec naming nobody is a session nothing has stamped — which is what an
  // occurrence with no stored row behind it looks like, and the state the chip
  // renders nothing for.
  const lastEditedBy = spec.lastEditedBy ?? null;

  if (spec.kind === "future") {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      report: spec.report ?? null,
      lastEditedBy,
    };
  }
  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    report: spec.report ?? null,
    attendance: spec.attendance ?? null,
    lastEditedBy,
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
