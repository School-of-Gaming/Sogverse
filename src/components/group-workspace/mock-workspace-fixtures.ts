import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  CLUB_FUTURE_SPECS,
  SESSION_FEED_ADULT_ID,
  SESSION_FEED_EDITORS,
  SESSION_FEED_GAMER_IDS,
  SESSION_FEED_PHOTO_ART,
  SESSION_FEED_ROSTER,
  SESSION_FEED_TIMEZONE,
  buildSessionFeedFixture,
  type EntrySpec,
  type SessionFeedCadence,
  type SessionSendOutcome,
} from "@/components/gedu/session-feed/mock-fixtures";
import type { SessionFeedEntry, SessionFeedGamer } from "@/components/gedu/session-feed";
import { platformForTopic } from "@/lib/products/topics";
import { sessionEntryId } from "@/lib/session-occurrence";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type {
  GamerCreation,
  GeduAssignedProduct,
  GeduAssignedProductGroup,
  GeduAssignedProductRosterEntry,
  ProductTopic,
} from "@/types";

/**
 * Fixtures for the group workspace's preview scenes — the product shell, the
 * groups, the group-level notes, and the session feed that is the page's spine,
 * all computed from a `now` the caller supplies. No absolute dates: whenever the
 * scene is opened it shows a plausible term around today.
 *
 * The roster is the same nine people the feed's attendance checklist uses,
 * so the names in a write-up and the names in the roster panel agree. Note
 * copy, names and emails are mock *data*, not UI copy, so they are not
 * translated — the same convention the other fixture files follow.
 *
 * Every id that reaches an identicon (children, gedus) is a real generated
 * UUIDv4 hardcoded as a literal: the identicon pattern is hashed out of the id's
 * hex bytes, so a readable id renders an empty square, and generating one per
 * render would give the same person a different face on every reload.
 */

/**
 * **Five scenarios, and each one is a shape the others structurally cannot
 * make.**
 *
 * There were more once, and several of them differed from the kitchen sink by
 * one state each — a heavier backlog, a shorter history, no peer groups. States
 * that can coexist belong in the same scenario, because a reviewer who has to
 * open five pages to see five things will see three of them.
 *
 * The two that survived that cull are the product shapes: `club` is remote and
 * weekly, `camp` is in-person and daily. Everything else the *page* can do — a
 * year of history, a session written up but never marked off, a skipped week,
 * an unstaffed sister group, a site's shared notes — is packed into whichever
 * of the two it belongs to.
 *
 * The two beside them are the *roster's* shapes, and they exist for the same
 * reason: a product's topic decides which game identity its roster shows, and
 * the three answers cannot coexist on one page. `roblox` is a Roblox-topic
 * product, `no-platform` a topic about no single game account at all — where
 * every child row is the short row, the same absence the adult row already
 * makes. They are deliberately thin on everything else (a short run, one peer
 * group) because the only question they are open to answer is what the rail's
 * roster looks like.
 *
 * `owed` is the fifth and it earns its own page on the same test: it needs a
 * product **flagged** as requiring creations whose run has already **ended**,
 * and no other scenario can be that without losing the thing it exists to show
 * — the camp's session in progress and long future, the club's year of backlog,
 * the two identity scenarios' live rosters. Every part of the owed signal is on
 * that one page at once (the final card's needs-attention line, its timeline
 * marker, the block on the card naming who it is waiting on, and those members'
 * rows), so there is one page to open rather than four.
 *
 * The *other* half of that signal — a flagged run whose last session has not
 * happened yet, where the same block states what will be wanted and nothing is
 * owed — is the **camp's**, and it costs no sixth page: the camp is already the
 * only end-dated run still going, so flagging it adds a state that genuinely
 * coexists with everything else on that page instead of asking for one of its
 * own.
 */
export const GROUP_WORKSPACE_SCENARIOS = [
  "club",
  "camp",
  "roblox",
  "no-platform",
  "owed",
] as const;

export type GroupWorkspaceScenario = (typeof GROUP_WORKSPACE_SCENARIOS)[number];

export function isGroupWorkspaceScenario(s: string): s is GroupWorkspaceScenario {
  return (GROUP_WORKSPACE_SCENARIOS as readonly string[]).includes(s);
}

/** The persistent, non-session notes attached to the group itself. */
export interface GroupNotesFixture {
  publicNote: string | null;
  staffNote: string | null;
}

/**
 * The site an in-person product runs at, with the notes that hang off it.
 *
 * Site notes belong to the *location*, not the product: the schema keeps the
 * family-facing pair (address + note) and the Gedu-only note on the site row,
 * so every product running there reads and writes the same two paragraphs.
 * `null` on a remote product, which has no building at all.
 */
export interface SiteFixture {
  name: string;
  address: string | null;
  publicNote: string | null;
  staffNote: string | null;
}

/**
 * The roster's per-member overlay: who is new to the group, who has been written
 * about and by whom, and what each of them has made. Every record is keyed by
 * participant id, and absence is the ordinary answer — most of a roster is none
 * of the three.
 */
export interface MemberFlairFixture {
  /** ISO join stamps, one per member still inside the newcomer window. */
  newcomers: Record<string, string>;
  /** Note text, one per member a Gedu has written about. */
  notes: Record<string, string>;
  /** Who last wrote each note, keyed the same way as `notes`. */
  noteEditors: Record<string, string>;
  /**
   * Creations, one entry per member who has any — an empty list is spelled by
   * having no key at all, exactly as the live derivation spells it.
   */
  creations: Record<string, readonly GamerCreation[]>;
}

export interface GroupWorkspaceFixture {
  data: GeduAssignedProduct;
  entries: SessionFeedEntry[];
  /** The attendance roster, keyed to the same ids as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /**
   * What a send does per entry id, for the scene whose send is inert — carried
   * straight off the feed fixture so the scene looks an outcome up by the id it
   * is handed rather than working out which week the card was.
   */
  sendOutcomes: ReadonlyMap<string, SessionSendOutcome>;
  /** The zone the schedule was authored in. */
  sourceTimeZone: string;
  /** Standing notes about the group, distinct from any one session's. */
  groupNotes: GroupNotesFixture;
  /** The site and its shared notes, or `null` for a remote product. */
  site: SiteFixture | null;
  /**
   * Staff-facing lesson/material URL, read from the product's staff-details
   * row. Must never be rendered to a parent or gamer.
   */
  materialUrl: string | null;
  /**
   * The roster's newcomer stamps and Gedu notes.
   *
   * **Every scenario carries it, because every live shell does.** The workspace
   * takes this overlay as a required prop — it is a staff-only page and both
   * shells build it from the same read as the roster — so a scenario without one
   * would be a page the product cannot produce, with a roster offering no way in
   * to a note.
   *
   * What scenarios differ in is which marks are *lit*: the club has both, the
   * camp has notes and an **empty** newcomers map (the clubs-only badge rule made
   * visible, and the exact shape the live shell hands a non-club product), and
   * the two identity scenarios carry {@link quietMemberFlair} — nothing lit at
   * all, which is what most real groups look like.
   */
  memberFlair: MemberFlairFixture;
}

/** Gedu ids. Real UUIDs because each one renders as an identicon chip. */
const GEDU_IDS = {
  sanna: "4a84d001-b789-41f5-ace3-cfcffa139869",
  petra: "96e29545-ad63-4948-b783-14e91189ad75",
  joonas: "d2826073-1d3f-4023-b45e-f42fea4332ca",
  markus: "a79fc7fd-8527-4826-8062-94d25ed30873",
} as const;

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
  /**
   * What the product is about — and therefore which game identity, if any, its
   * roster rows show. The roster is built from it rather than beside it, so a
   * scenario cannot claim a Minecraft topic and hand out Roblox handles.
   */
  topic: ProductTopic;
  cadence: SessionFeedCadence;
  specs: readonly EntrySpec[];
  startTime: string;
  durationMinutes: number;
  slots: GeduAssignedProduct["product"]["schedule_slots"];
  /** How far back the product started, in days before `now`. */
  startedDaysAgo: number;
  /**
   * Days after `now` the product ends, `null` for an ongoing club, or
   * `"last-session"` for a run whose end date is the day of its own last
   * scheduled session.
   *
   * The third form exists because such an end date is not an offset from
   * anything — it has to be **exactly** that day or the derivation of "the
   * final session" finds a different one, or none. So it is read off the feed
   * the fixture just built rather than guessed at with an offset that would
   * have to be kept in step with the spec list's length, the cadence and the
   * weekday by hand. Every scenario carrying a final session anybody looks at
   * uses it, finished or not.
   */
  endsInDays: number | null | "last-session";
  /**
   * Whether this product's contract requires a creation from every member —
   * the admin flag, and the only thing that puts the creations block on a
   * session card at all.
   *
   * **Two scenarios carry it, and they are the block's two tones.** The camp is
   * flagged with a run still going, so its last session states the obligation
   * in the informational tone while there is a month left to meet it; `owed` is
   * flagged with a run that has ended, so its last session states the same
   * thing in warning. Neither can be the other without losing what it is for.
   * Creations themselves are on show without the flag at all — the club's rail
   * has rows lit by one — because the flag adds the obligation, not the data.
   */
  requiresGamerCreations: boolean;
  /**
   * Remote products have a voice room; in-person ones have a building. The two
   * are exclusive, and the flag drives both — an in-person page renders **no
   * Join affordance at all** (not a locked one: there is no room, so there is
   * nothing to lock), and only an in-person page carries site notes.
   */
  isRemote: boolean;
  /** The site, on in-person products only. */
  site: SiteFixture | null;
  materialUrl: string | null;
  groupName: string;
  groupNotes: GroupNotesFixture;
  /**
   * Builds the roster's staff-only overlay from the scene's `now`. Every
   * scenario builds one, because the workspace requires one: the club with both
   * marks, the camp with notes and no badges (the clubs-only rule made visible),
   * and the identity scenarios with {@link quietMemberFlair}, which lights
   * nothing.
   *
   * `now` is a parameter because the club's stamps are durations back from it; a
   * fixture with no stamps to place ignores it.
   */
  memberFlair: (now: Date) => MemberFlairFixture;
  /**
   * The other groups running on the same product — the reference rail's
   * peer-cover rows. Both scenarios carry some: the rail's empty state is one
   * short line, and losing it costs less than losing a scenario to it.
   */
  peers: readonly {
    id: string;
    name: string;
    participantCount: number;
    /** The gedus teaching the peer group — each id renders an identicon. */
    gedus: readonly { id: string; firstName: string }[];
  }[];
}

/** The gedus who show up as peer-group teachers, as identicon chips. */
const PETRA = { id: GEDU_IDS.petra, firstName: "Petra" } as const;
const JOONAS = { id: GEDU_IDS.joonas, firstName: "Joonas" } as const;
const MARKUS = { id: GEDU_IDS.markus, firstName: "Markus" } as const;

/**
 * **The camp's future block, and the volume case for the whole feed.**
 *
 * Seventeen entries, so the now-divider reads "16 more upcoming sessions" — the next
 * one renders below the line, the rest sit behind it — and the upward reveal is
 * exercised at the scale it will actually meet rather than against four rows
 * where any implementation looks fine. That number is not arbitrary: an
 * end-dated product bypasses the open-ended eight-occurrence cap entirely and
 * emits every occurrence up to its end date, so a daily product with weeks left
 * on it is the one shape in the catalogue that genuinely produces a long future,
 * and it is the one worth proving the reveal against.
 *
 * It is written newest-first like every spec list, so this reads backwards: the
 * last entry is the next session and the first is the final day of the run. Only
 * a handful carry notes — a camp gedu plans two or three days ahead, not
 * seventeen — which is also what keeps the collapsed block honest: most of what
 * the reveal uncovers is bare dates, and the layout has to survive that.
 */
const CAMP_FUTURE_SPECS: readonly EntrySpec[] = [
  {
    kind: "future",
    report:
      "# Last day: showcase afternoon\n\nEvery team demos their finished course, and we vote on the one nobody could beat.\n\n**Parents are welcome from 15:00** if you would like to come and be beaten by an obstacle course built by ten-year-olds.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "future",
    staffNote:
      "The last day is the short one — the hall is booked from 14:00, so wrap up by half past one and leave the machines on for the showcase.",
  },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
  { kind: "future" },
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
      "# Leaderboards\n\nWe wire the finish line up to a scoreboard so the course remembers who got round it fastest.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  { kind: "future" },
  {
    kind: "future",
    staffNote:
      "**Before the group arrives:**\n\n- Start the machines ten minutes early, they are slow to load Studio\n- The projector adapter is in the drawer, not the cable on the table",
  },
  {
    kind: "future",
    report:
      "# Tomorrow: playtesting, round two\n\nEvery team hands their course to another team and watches them fail at it — the most useful hour of the week, and the one everybody asks to repeat.",
    lastEditedBy: SESSION_FEED_EDITORS.petra,
  },
];

/**
 * The camp's run so far — every day written up bar the most recent one.
 *
 * The club scenario beside it is where the *backlog* lives: outstanding weeks of
 * both kinds — registers unfinished and write-ups never written — and a year of
 * history. The camp carries exactly one gap, and it is deliberately the
 * freshest day — a gedu who ran a session
 * yesterday afternoon and has not sat down with the register yet is the single
 * most common way a session ends up owed, and it is the only way an in-person
 * product ever shows an attention badge on the dashboard. Everything older is
 * finished, which is also true to life: you write the day up at the end of the
 * day, in the room, and it is only the newest one that is ever open.
 */
const CAMP_SPECS: readonly EntrySpec[] = [
  ...CAMP_FUTURE_SPECS,
  // Yesterday afternoon, register not yet done. The one outstanding session on
  // this product, and the dashboard's in-person attention badge. It is also the
  // newest past entry, which makes it the report the feed renders **unclamped**
  // — the one a gedu opens this page to re-read.
  {
    kind: "past",
    report:
      "# Day five: playtesting\n\nEvery team handed their obby to another team and watched them fail at it, which is reliably the most useful hour of the week.\n\nThree levels got quietly made easier straight afterwards, and nobody admitted to it.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day four: sound and lighting\n\nNeon needs neon, so the afternoon went on emissive parts and a soundtrack that loops without anyone noticing the seam.\n\n## What changed\n\n- Every obstacle now lights its own approach, so you can see where you are going\n- A four-bar loop under the whole course, built by three of the group together\n- A very loud sound on the finish line, which was not my idea and is staying",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day three: our first scripts\n\nWe wrote our first Lua today — a checkpoint that saves where you got to — and then broke it on purpose to find out what the error messages actually mean.\n\n## How it went\n\nEveryone got a working checkpoint. The useful part was the breaking: a script that says `attempt to index nil` is not being rude, it is telling you that the thing you asked for is not there, and once that landed the group started reading the errors instead of calling me over.\n\nHilda finished early and ended up debugging two other tables' scripts, which she was very pleased about.\n\n**At home:** the place to look is the Output window at the bottom of Studio. Almost every problem is named there in plain words.",
    staffNote:
      "The room's laptops are slow to load Studio; start the machines ten minutes before the group arrives tomorrow.",
    lastEditedBy: SESSION_FEED_EDITORS.petra,
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.oskar, SESSION_FEED_GAMER_IDS.emil],
    report:
      "# Day two: building the course\n\nTeams of two, one obstacle each, all snapped together into a single course by the end of the afternoon.\n\nIt is unfair and much too long, which everyone considers to be the point.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.hilda],
    report:
      "# Day one and a half: picking a theme\n\nThe group voted on a theme for the shared course. Neon city won by a distance, and half the afternoon went on arguing about whether lava counts as neon.\n\nIt does not, and the ruling was extremely unpopular.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day one: getting started\n\nEveryone got a Roblox Studio account working, made a baseplate and pushed a block off it.\n\n- Names and ground rules\n- Who is sitting next to whom for the week\n- One baseplate each, and one block pushed off each\n\nA quiet start on purpose. Tomorrow we pick a theme and start building for real.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
];

/* ------------------------------------------------------------------ */
/*  A year of history                                                  */
/* ------------------------------------------------------------------ */

/**
 * Reports for the club's long run, as **markdown**.
 *
 * Deliberately varied in length and shape. Half of them are two or three lines,
 * because plenty of weeks genuinely are; the rest run to a title, a section and
 * a list, at the 500–1500 characters a real report is specified at. That mix is
 * the point: the feed clamps a report to a few lines and offers to expand it, so
 * a history of uniformly short entries would render the clamp nowhere and a
 * history of uniformly long ones would make it look like the normal state. Both
 * lengths have to sit next to each other for the feed to be judged honestly.
 *
 * All of it stays inside the subset the editor's toolbar can produce — headings,
 * paragraphs, bold, lists — so any of these can be opened in the editor and
 * saved back unchanged.
 */
/**
 * **The shape a real report actually takes**, and the longest fixture here on
 * purpose.
 *
 * Everything else in this file was written to exercise the *renderer* — a
 * heading, a section, a list, a bolded line — which is useful and is not what a
 * gedu produces on a Monday evening. A real one opens with the date and a name
 * for the session, and then runs as half a dozen short paragraphs of plain
 * prose: no sections, no bullets, a warm recap addressed to the parent who will
 * read it on a phone, and a line at the end to close it off.
 *
 * It sits at the head of the club's history so it is the first report a reviewer
 * meets, and at ~1600 characters it is comfortably the longest — which makes it,
 * rather than a tidy demonstration list, the report the clamp and its "Read
 * more" are judged against.
 *
 * The date is a placeholder the fixture builder fills in from the session this
 * lands on, so the title always agrees with the card above it.
 */
const CASTLE_RECAP = `# {date} – Lohikäärmeen linna

We spent the whole of this one on the castle, and it is finally the shape everyone has been arguing about since before the break.

The towers went up first. Aino and Väinö took one each and agreed a height beforehand, which is the first time that has happened without me suggesting it — the two towers actually match, and you can see the difference from the road.

Elias worked on the gate all evening. It opens on a lever hidden behind the left pillar, and he tested it about forty times before he let anybody else near it. It works every time now, which is more than can be said for most of the redstone in this world.

Linnéa and Siiri built the great hall in the middle. They spent most of the session on the floor pattern rather than the walls, which sounded like a mistake and turned out not to be: the room reads as a proper hall the moment you walk into it, and nobody has said a word about the walls.

Oskar and Emil took the outer wall, and had a long and serious disagreement about whether a castle needs a moat. It does not have one. The argument is not over.

Hilda spent the session lighting the whole thing. It is the job nobody volunteers for and it is the reason the castle looks finished rather than half-built, so it is worth saying out loud that she picked it herself.

We ended with everyone standing on top of the north tower looking down at it, which felt like the right way to finish.

Thank you all — the castle stays in the world, so do go and walk around it during the week.`;

const YEARLONG_RECAPS: readonly string[] = [
  CASTLE_RECAP,
  `# Redstone doors

Everyone built a door that actually closes behind them, which took considerably longer than anyone expected.

## The three that worked

- A piston door two blocks wide, which is the classic and the fiddliest
- A trapdoor bridge that folds away, built by Linnéa and copied by three others within the hour
- One that opens on a pressure plate outside and *only* from outside, which its builder insists is a security feature

The rest of the session went on the ones that did not work, which is where the learning is. The usual culprit is a repeater pointing the wrong way, and by the end most of the group was finding that themselves.`,
  "# A fresh survival world\n\nWe started a survival world from scratch and got as far as a shared shelter and one very ambitious wheat field.\n\nThe shelter is not pretty. It is, however, lit, walled and large enough for everyone, which was the whole brief.",
  `# Nether trip

The first trip through the portal, and it went about as well as these ever do.

## The tally

- Two casualties, both recovered, both entirely their own fault
- One full inventory of quartz
- A great deal of shouting about ghasts

We talked beforehand about leaving a marker at the portal and half the group did it. The half that did not spent twenty minutes finding their way back, which taught the point better than I could have.

**Next week** we are staying on the surface. Several people have asked for a quieter session and I think they have earned one.`,
  "# Build battle: a shop that sells one thing\n\nForty minutes, two teams, one very silly brief.\n\nWe ended up with a shop that sells only ladders — four floors of them, all reachable by ladder — and a florist that is genuinely lovely. The florist won and the ladder shop is still standing as a monument.",
  `# Elytra course night

Väinö set the first time round the course and then spent the rest of the session helping other people beat it, which is not what I expected and was much better than what I had planned.

## What the group worked out

- You go faster if you stop flapping and start diving
- Firework rockets are a crutch and everyone used them anyway
- The last gate is easier from above than from level with it

Six of eight got round it in the end. The two who did not are, I am told, practising.`,
  "# Villager trading\n\nNobody expected an hour on emeralds to be popular, and yet.\n\nBy the end the group had a working trading hall, an argument about whether restocking is cheating, and a shared spreadsheet of who sells what. The spreadsheet was not my idea.",
  "# Spawn, rebuilt\n\nWe rebuilt the spawn area properly this week, with signs, so somebody joining for the first time can find their way around without having to ask.\n\n- A signposted junction where the four main paths meet\n- A noticeboard with the group's rules on it\n- A chest of starter tools that anyone may take from",
  "# Minecart rails to the new mine\n\nEmil worked out the powered-rail spacing on his own, drew it on the whiteboard, and the rest of the group built to his diagram. The line runs the whole way now and only derails at one corner, which we will fix next time.",
  `# Free build, one rule: underwater

Two glass domes, one very long tunnel, and a great deal of drowning.

## What came out of it

- A dome with a working airlock, which took three attempts and a lot of patience
- A tunnel joining the two domes, dug by four people from both ends at once
- One conduit, built collectively, which makes the whole area breathable

The drowning was mostly in the first twenty minutes, before anybody thought to bring doors. It stopped being funny at about the fifth time and the group started planning properly, which was the point.`,
  "# Aino taught the session\n\nAino ran twenty minutes of this one herself, teaching hopper clocks to the rest of the group. She was better at it than I am — she had worked out that you explain what it is *for* before you explain what it does.",
  "# Farming week\n\nAn automatic melon farm, currently half-working. The harvesting side is fine and the collection side eats about a third of the crop.\n\n**Notes for whoever picks it up:** the problem is almost certainly the hopper timing, not the pistons.",
  `# Build the other team's base from memory

Ninety seconds looking at it, then back to your own plot to rebuild it.

## How it went

Both teams got the shape right and the details spectacularly wrong. The blue team's version of the red team's tower had four windows instead of nine and a roof from an entirely different building.

The interesting part was the second round, when both teams knew what was coming and started *deciding what to look at* rather than trying to see everything. That was the whole lesson and I did not have to say it out loud.`,
  "# A quiet week\n\nA few away, so we tidied rather than built: storage sorted, chests labelled, and a rule agreed about borrowing tools from the shared chest.\n\nThe rule is that you may borrow anything, and you put it back. We will see.",
  "# Enchanting and bookshelves\n\nEveryone left with at least one enchanted pickaxe and strong opinions about luck.\n\n- Fifteen bookshelves each, which is a lot of sugar cane\n- One shared enchanting room rather than eight separate ones\n- A long conversation about why the same level gives different results",
  `# The long walk to a mesa

We spent most of the session walking, which sounds like a wasted evening and was not.

## What happened

The group decided to find a mesa, worked out roughly which way to go, and set off together. Nobody wandered off, nobody got lost, and the two who ran ahead came back when they were asked to.

We found one about ten minutes before the end, and everyone immediately started digging into it.

**Next week:** we are going back with proper equipment, and we are building something there.`,
  "# Mob-proofing night\n\nWe lit the paths, walled the gaps, and lost nobody to a creeper for an entire session, which is a first.\n\nThe method was simple and worth repeating at home: walk the route you actually use, and place a torch wherever it is dark enough to be a problem.",
  "# Redstone doorbell competition\n\nSix entries, all of them working, one of them musical.\n\nHilda's plays a full tune when you stand on the plate outside. It is either brilliant or a menace and the group is split roughly down the middle.",
  `# Landscaping the harbour

A big push on the harbour this week — the biggest single piece of work the group has done together.

## What got done

- The sea wall finished along the whole eastern edge
- Three jetties, one per team, all at the same height for once
- The road from the village square finally joined up to it

Oskar organised the group into teams without being asked to, assigned the jetties, and kept an eye on the heights so they would line up. He then did almost none of the digging, which he says was the plan.

It is the first thing in the world that looks designed rather than accumulated.`,
  "# Command block basics\n\nTeleport pads only for now, and a great many accidental teleports into the ceiling.\n\nWe stopped short of anything more complicated on purpose — one working idea understood properly beats three half-built ones.",
  `# End of term

Everyone gave a tour of one thing they made this term, and it took the whole session.

## The tour

- Aino's clock tower, which still chimes
- Väinö's elytra course, now with a scoreboard
- Elias's item sorters, running the storage room
- Linnéa's folding bridge, copied by half the group since
- Oskar's harbour, which is really everybody's harbour
- Siiri's underwater dome, the one with the working airlock
- Emil's rail line, still derailing at that one corner
- Hilda's library, now containing forty-one books

Nobody wanted to log off. Thank you for a very good term — we start again after the break.`,
];

const YEARLONG_STAFF_NOTES: readonly string[] = [
  "Two laptops still can't hear shared audio. Worth checking the room setup before the next one.",
  "Siiri was quiet again. Keep pairing her rather than letting her pick a partner.",
  "Emil and Oskar work better on separate teams — it gets competitive fast.",
  "Someone has been breaking blocks on other people's plots. Watch for it next week.",
  "New member settled in fine but needs the ground rules repeating once more.",
];

/**
 * The club's past: 53 dated sessions plus two pre-epoch lines.
 *
 * Built from an index rule rather than hand-written, and deliberately with no
 * randomness — a fixture that reshuffles itself between renders would make the
 * inline editor's local state jump around and would make any screenshot
 * unreproducible. The rule stays parameterless on purpose: the sets below are
 * what make it *this* club, and a caller wanting a different history composes
 * its own spec list rather than passing knobs into this one.
 *
 * The mix is what a real year looks like, and it covers every shape a past
 * session can take — including **every way a session can be flagged**, which is
 * the thing the club scenario has to prove:
 *
 * - *Needs attention, register missing* — two bare gaps with nothing on them,
 *   one week whose report was written but whose roster was never touched, and
 *   one whose roster was started and abandoned (the partial save).
 * - *Needs attention, report missing* — weeks marked off to the last child and
 *   never written up. These used to be the silent middle of a three-rung ladder;
 *   they are amber now, because the report is what a family opens the page for
 *   and a week without one is a week they were told nothing about.
 * - *Needs attention, never sent* — three weeks marked off and written up whose
 *   reports have not been emailed to the families. They are the only cards here
 *   showing the Send to parents button, and the only way to see on this page
 *   that a write-up nobody was told about is a write-up nobody reads. There are
 *   three because the send has three outcomes — everything delivered, one
 *   address refused, nothing delivered — and one card each puts all of them on
 *   the first screen: a reviewer clicks down the column and compares the sent
 *   line, the partial tally and the error against each other, rather than
 *   reloading the page twice and comparing from memory.
 * - *Complete* — the majority: marked off, reported and sent, wearing the green
 *   check and a sent line under each report.
 *
 * Plus a pre-epoch tail: one session somebody went back and wrote up (an
 * ordinary past entry that never turns amber, and the only place on this page
 * the neutral marker still appears) and two nobody ever touched (quiet
 * placeholder lines that still open the record editor). There are no holiday
 * skips: a session that did not run has no entry kind, because declaring one off
 * is part of the cancellation flows nobody has designed.
 */
function yearlongSpecs(): readonly EntrySpec[] {
  const OWED_AT = new Set([2, 12]);
  const REPORT_BUT_NO_ATTENDANCE_AT = new Set([8]);
  const PART_MARKED_AT = new Set([4]);
  // Marked off, never reported on — the other way to be flagged. Spread through
  // the year rather than bunched, so the case is visible in the first screen of
  // the feed and again deep into the scrollback, sitting beside the
  // unmarked-register cases it must not be mistaken for.
  const MARKED_BUT_NO_REPORT_AT = new Set([1, 9, 22, 37]);
  /**
   * Marked off, written up, and **not yet emailed to the families** — the third
   * way to be flagged, and the only sessions on this page carrying the Send to
   * parents button. Every other week here was sent the evening it was written,
   * which is what the sent line under each report says.
   *
   * Three of them, one per outcome the send can have, and deliberately near the
   * top: this is the state a gedu meets on the session they have just finished
   * writing up, so it belongs on the first screen of the feed rather than
   * buried in the scrollback — and three cards within one screen of each other
   * is what lets the outcomes be compared side by side instead of one reload at
   * a time.
   *
   * Week 9 would have read better beside 5 and 7, but it is already a
   * marked-off-never-reported week, so the third one is week 10 — the nearest
   * index no other set had claimed.
   */
  const WRITTEN_BUT_NOT_EMAILED_AT = new Map<number, SessionSendOutcome>([
    [5, "sent"],
    [7, "fails"],
    [10, "partial"],
  ]);
  /**
   * The weeks Petra covered. Sanna has the group and writes most of it up; a
   * scattered handful are Petra's, which is what a regular-plus-stand-in group
   * looks like — and it puts a second face down the scrollback without the
   * chips reading as an alternating pattern. Named indices rather than a
   * modulo, because who ran a given week is a fact about that week.
   */
  const COVERED_BY_PETRA_AT = new Set([3, 11, 19, 26, 41]);
  const editorAt = (index: number) =>
    COVERED_BY_PETRA_AT.has(index)
      ? SESSION_FEED_EDITORS.petra
      : SESSION_FEED_EDITORS.sanna;
  /**
   * The weeks somebody photographed. Index 0 — the week a gedu has just run,
   * first past card on the page — carries the full five: the cap state (add
   * affordance absent, gallery as a signed card's last block) has to be on the
   * first screen, because it is the one the photo strip's review always needs.
   * Index 1 is already the marked-off-never-reported week, so its pair shows
   * photographed-but-unwritten still owing its report; index 15 is an ordinary
   * mid-scrollback pair (one landscape, one portrait) so mixed ratios appear
   * again deep in the feed. Applied as a post-pass so every branch of the loop
   * above stays about the state it exists to seed.
   */
  const PHOTOS_AT = new Map([
    [
      0,
      [
        SESSION_FEED_PHOTO_ART.build,
        SESSION_FEED_PHOTO_ART.tower,
        SESSION_FEED_PHOTO_ART.arena,
        SESSION_FEED_PHOTO_ART.badge,
        SESSION_FEED_PHOTO_ART.parkour,
      ],
    ],
    [1, [SESSION_FEED_PHOTO_ART.badge, SESSION_FEED_PHOTO_ART.arena]],
    [15, [SESSION_FEED_PHOTO_ART.build, SESSION_FEED_PHOTO_ART.tower]],
  ]);
  const past: EntrySpec[] = [];

  for (let index = 0; index < 53; index++) {
    if (OWED_AT.has(index)) {
      past.push({ kind: "past" });
      continue;
    }
    if (PART_MARKED_AT.has(index)) {
      // Four of nine answered and then something else happened. It saved, it
      // is still flagged, and it reads "4 of 9 marked" until someone finishes.
      past.push({
        kind: "past",
        report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
        partial: {
          present: [
            SESSION_FEED_GAMER_IDS.aino,
            SESSION_FEED_GAMER_IDS.vaino,
            SESSION_FEED_GAMER_IDS.elias,
          ],
          absent: [SESSION_FEED_GAMER_IDS.linnea],
        },
        lastEditedBy: editorAt(index),
      });
      continue;
    }
    if (REPORT_BUT_NO_ATTENDANCE_AT.has(index)) {
      past.push({
        kind: "past",
        report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
        lastEditedBy: editorAt(index),
      });
      continue;
    }
    const sendOutcome = WRITTEN_BUT_NOT_EMAILED_AT.get(index);
    if (sendOutcome !== undefined) {
      past.push({
        kind: "past",
        allPresent: true,
        report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
        emailed: false,
        sendOutcome,
        lastEditedBy: editorAt(index),
      });
      continue;
    }
    if (MARKED_BUT_NO_REPORT_AT.has(index)) {
      past.push({
        kind: "past",
        allPresent: true,
        staffNote: YEARLONG_STAFF_NOTES[index % YEARLONG_STAFF_NOTES.length],
        lastEditedBy: editorAt(index),
      });
      continue;
    }
    // Rotate the absentee through the roster so the attendance summary is not
    // "9 of 9" on every single row of a year.
    const away =
      index % 3 === 0
        ? [SESSION_FEED_ROSTER[index % SESSION_FEED_ROSTER.length].id]
        : undefined;
    past.push({
      kind: "past",
      report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
      lastEditedBy: editorAt(index),
      ...(index % 7 === 3
        ? { staffNote: YEARLONG_STAFF_NOTES[index % YEARLONG_STAFF_NOTES.length] }
        : {}),
      ...(away ? { absent: away } : { allPresent: true }),
    });
  }

  return [
    ...CLUB_FUTURE_SPECS,
    ...past.map((spec, index) => {
      const photos = PHOTOS_AT.get(index);
      return photos ? { ...spec, photos } : spec;
    }),
    // Before the epoch and written up anyway — a gedu going back over an old
    // term. It renders as an ordinary past entry with a half-finished register
    // and wears no alert at all, which is the only way to see on this page that
    // the epoch gates what is *owed* rather than what can be edited.
    {
      kind: "past",
      owed: false,
      partial: { present: [SESSION_FEED_GAMER_IDS.aino] },
      report: `# Before we kept records

Written up from memory and the world save, long after the fact. Half the register is guesswork, so it stays half-marked — and nothing is asking for the rest.`,
      lastEditedBy: SESSION_FEED_EDITORS.sanna,
    },
    { kind: "no_record" },
    { kind: "no_record" },
  ];
}

const CLUB_SPECS = yearlongSpecs();

/**
 * A short, unremarkable run — the timeline for the two scenarios whose subject
 * is the **roster**, not the feed.
 *
 * Deliberately boring: the club scenario already carries every state a session
 * can be in, and repeating a slice of it here would only give a reviewer more
 * to scroll past on the way to the rail they came to look at. Four finished
 * weeks and the standard future block is enough that the page reads as a real
 * workspace rather than an empty one.
 */
const ROSTER_SCENARIO_SPECS: readonly EntrySpec[] = [
  ...CLUB_FUTURE_SPECS,
  {
    kind: "past",
    allPresent: true,
    report:
      "# Obby week three\n\nEvery team's course is joined end to end now, and the whole thing is playable start to finish for the first time.",
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.siiri],
    report:
      "# Checkpoints and spawns\n\nWe added checkpoints so nobody has to start from the beginning again, which was by some distance the most requested feature.",
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Building the first obstacles\n\nTeams of two, one obstacle each. Unfair and much too long, which everyone considers to be the point.",
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Getting started\n\nNames, ground rules, and one baseplate each. A quiet start on purpose.",
  },
];

/**
 * The club's staff-only roster overlay: four newcomers and two notes.
 *
 * **Four newcomers, evenly spread across the window — one per pip of the
 * badge's meter.** The badge drains a four-pip block across a member's first
 * month, so four members spread across the window show every state it has at
 * once. Emil at one day is the full block, Siiri at ten and Marja at nineteen
 * are the middle readings, and Hilda at twenty-eight is the last one before the
 * badge stops altogether. Stacked in one rail they can be read against each
 * other in a glance.
 *
 * **Marja is deliberately one of them.** She is the parent holding a seat of
 * her own, and an adult is as new to a group as a child is — so the badge has
 * to sit beside the Parent badge on the same wrapping line without either
 * displacing the other.
 *
 * **Two notes, and one of them is on a newcomer on purpose.** A lit note button
 * at the end of a row and a badge beside the name are two marks on one row, and
 * the question a reviewer actually has is whether that row still reads as one
 * person rather than as a decorated one — which cannot be answered from two
 * rows each wearing one mark. Siiri carries both. Emil's note is the second, so a note is also
 * seen on a row that has nothing else on it.
 *
 * The two notes are the ones a Gedu really writes: how to pair somebody, and
 * where a new arrival came from and what they already know. Both are staff
 * register, never a parent's — the note is private to Gedus and admins, and a
 * fixture written as if a family might read it would quietly teach the wrong
 * voice. Mock data, so untranslated English like every other fixture here.
 *
 * Stamps are a duration back from `now` — arithmetic between instants, which is
 * exactly what the badge measures, so no calendar stepping is involved.
 */
function clubMemberFlair(now: Date): MemberFlairFixture {
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();

  return {
    newcomers: {
      [SESSION_FEED_GAMER_IDS.emil]: daysAgo(1),
      [SESSION_FEED_GAMER_IDS.siiri]: daysAgo(10),
      [SESSION_FEED_ADULT_ID]: daysAgo(19),
      [SESSION_FEED_GAMER_IDS.hilda]: daysAgo(28),
    },
    notes: {
      [SESSION_FEED_GAMER_IDS.siiri]:
        "Quiet in big groups — pair her rather than letting her pick a partner. Has warmed up a lot since autumn.",
      [SESSION_FEED_GAMER_IDS.emil]:
        "Joined from the Monday B waitlist. Knows redstone already — needs stretching, not settling in.",
    },
    noteEditors: {
      [SESSION_FEED_GAMER_IDS.siiri]: "Sanna",
      [SESSION_FEED_GAMER_IDS.emil]: "Petra",
    },
    /**
     * **Two members with a creation, and deliberately not the two with notes.**
     *
     * The button at the end of a row is lit by either, so a roster where the
     * same people carry both would never show that — the club's rail now has a
     * row lit by a note alone (Emil), a row lit by a creation alone (Aino), a
     * row lit by both (Siiri), and rows lit by nothing, which is most of them.
     *
     * **One each, because one is what the dialog can author.** The list shape
     * survives on the wire, so a fixture *could* hold two — and would then be
     * showing a state no Gedu can produce, which is the one thing a fixture must
     * never do.
     *
     * Aino's is the entry the family product page's `active-club` scenario
     * carries, written the same way on purpose: this scene shows what a Gedu
     * typed, that one shows what the family gets for it. The value that is not a
     * URL lives on that page's `camp` scenario now, because the degrade is only
     * visible where it renders — here it is two words in a text field either
     * way, which is itself the accepted gap.
     */
    creations: {
      [SESSION_FEED_GAMER_IDS.aino]: [
        {
          title: "Lohikäärmeen linna — the castle world",
          url: "https://www.planetminecraft.com/project/lohikaarmeen-linna/",
        },
      ],
      [SESSION_FEED_GAMER_IDS.siiri]: [
        {
          title: "Underwater dome with the working airlock",
          url: "https://www.planetminecraft.com/project/siiri-dome/",
        },
      ],
    },
  };
}

/**
 * The camp's flair: **notes and no newcomers** — the exact shape the live shell
 * hands a non-club product.
 *
 * The two marks are gated differently and this is the only fixture anywhere that
 * shows them coming apart. The newcomer badge is clubs-only, because everybody on
 * a camp started on the same Monday and "new to this group" distinguishes nobody;
 * a note has no such gate, because what a Gedu needs to remember about a child is
 * just as worth writing down on the fourth day of a camp as in the sixth week of a
 * club. So the newcomers map is **empty** and the notes go through.
 *
 * That empty map is precisely what the live wiring produces: the shell asks
 * `showsNewcomerBadge` once and, on a camp, folds no stamps in while folding every
 * note in — an empty map is how "no badges here" is spelled everywhere, because a
 * page with no overlay at all is not a thing either shell can build.
 *
 * The notes are camp-shaped rather than term-shaped — a week-long thing, written
 * about the days either side of the one being run.
 *
 * **One of them is signed by a Gedu who teaches a different group of this camp**,
 * which is the cross-group mobility the note's authorization actually grants: any
 * Gedu on the *product* may read and write any of its notes, because the
 * substitute covering a session is precisely the person who needs one. The rail
 * beside this roster names him on Builders green, so the two halves agree.
 */
function campMemberFlair(): MemberFlairFixture {
  return {
    // Empty on purpose: the clubs-only badge rule, made visible.
    newcomers: {},
    notes: {
      [SESSION_FEED_GAMER_IDS.oskar]:
        "Youngest in the room and knows it — give him something to show the group on Wednesday and he settles for the rest of the week.",
      [SESSION_FEED_GAMER_IDS.linnea]:
        "Picked up early yesterday, back for the full day from now on. Missed the obstacle-course briefing, so she needs catching up before her team starts building.",
    },
    noteEditors: {
      [SESSION_FEED_GAMER_IDS.oskar]: "Sanna",
      [SESSION_FEED_GAMER_IDS.linnea]: "Joonas",
    },
    // Nothing yet, and that is the point of having it here: a camp writes its
    // creations up on the last day, and this one is nine days into a run with
    // four weeks to go. Every row's button is therefore lit by a note or by
    // nothing, which is the other half of the comparison the club's rail makes
    // — and, since this scenario is flagged, it is also what the last day's
    // creations block looks like at nought of nine with nothing owed yet.
    creations: {},
  };
}

/**
 * The overlay a group with nothing marked hands over: nobody inside the newcomer
 * window, nobody written about yet.
 *
 * **This is the live shape, not an opt-out.** The workspace requires the overlay,
 * so "no marks" is three empty records rather than a missing prop — every row
 * still carries its note button, dimmed, which is exactly what the real page
 * shows on the majority of rosters. A scenario using this is showing the quiet
 * roster, not a page without the capability.
 */
function quietMemberFlair(): MemberFlairFixture {
  return { newcomers: {}, notes: {}, noteEditors: {}, creations: {} };
}

/**
 * **A finished run's roster, two members short of done** — the overlay the owed
 * signal is read against.
 *
 * Seven of the nine have a creation and two do not, which is deliberately the
 * ratio a Gedu actually meets on the last day: the work is nearly in, and what
 * the marker has to do is pick the stragglers out of a roster where almost
 * every other row is already lit. A fixture where half the group owed would
 * make the warning tone the roster's *default* and prove nothing about whether
 * it stands out.
 *
 * **One of the two who owe is Marja, the adult holding a seat of her own.** The
 * rule is one rule — every current member of the group owes, and an adult seat
 * is a member — so the only way to see that there is no special case is to put
 * an adult on the owing side of it. Emil is the other, and he is the newest
 * arrival: somebody who joined near the end still owes, because the tally runs
 * over the roster as it stands rather than over who was here in week one.
 *
 * Emil carries a newcomer stamp to match, which is the one extra thing on this
 * page and earns its place: it is the only fixture anywhere where the warning
 * tone and a badge land on the *same* row, and the question that arrangement
 * raises — whether the row still reads as one person — cannot be answered from
 * two rows each wearing one mark.
 */
function owedMemberFlair(now: Date): MemberFlairFixture {
  const creation = (title: string, url: string) => [{ title, url }];

  return {
    newcomers: {
      // A fortnight, which is both inside the badge's month-long window and
      // what his note says.
      [SESSION_FEED_GAMER_IDS.emil]: new Date(
        now.getTime() - 14 * 86_400_000,
      ).toISOString(),
    },
    notes: {
      [SESSION_FEED_GAMER_IDS.emil]:
        "Joined for the last fortnight only. His course is built but nothing is published yet — sit with him before the parents' showcase and get it up.",
    },
    noteEditors: {
      [SESSION_FEED_GAMER_IDS.emil]: "Sanna",
    },
    creations: {
      [SESSION_FEED_GAMER_IDS.aino]: creation(
        "Kellotorni — the clock tower obby",
        "https://www.roblox.com/games/9481120344/kellotorni",
      ),
      [SESSION_FEED_GAMER_IDS.vaino]: creation(
        "Lava run, four checkpoints",
        "https://www.roblox.com/games/9481207713/lava-run",
      ),
      [SESSION_FEED_GAMER_IDS.elias]: creation(
        "The trapdoor maze",
        "https://www.roblox.com/games/9481318802/trapdoor-maze",
      ),
      [SESSION_FEED_GAMER_IDS.linnea]: creation(
        "Spinning bridges",
        "https://www.roblox.com/games/9481422956/spinning-bridges",
      ),
      [SESSION_FEED_GAMER_IDS.oskar]: creation(
        "Ice slide with the shortcut nobody found",
        "https://www.roblox.com/games/9481533107/ice-slide",
      ),
      [SESSION_FEED_GAMER_IDS.siiri]: creation(
        "Underwater section with the working airlock",
        "https://www.roblox.com/games/9481644218/airlock",
      ),
      [SESSION_FEED_GAMER_IDS.hilda]: creation(
        "The finish line and the scoreboard",
        "https://www.roblox.com/games/9481755329/finish-line",
      ),
    },
  };
}

/**
 * **A finished five-week run, every session complete except for what the
 * contract asks of the last one.**
 *
 * Written this way so the final card's needs-attention line has exactly one
 * cause. Every entry here is marked off, written up and emailed — the three
 * ordinary obligations, all discharged — so the amber on the newest card can
 * only be the fourth condition, and a reviewer is not left guessing which of
 * four things it is complaining about. The four cards beneath it carry green
 * checks for the same reason: the contrast is the point.
 *
 * No future entries at all, which is what dates the whole list behind `now` and
 * makes the run genuinely over.
 */
const OWED_SPECS: readonly EntrySpec[] = [
  {
    kind: "past",
    allPresent: true,
    report:
      "# Showcase week\n\nEvery team demoed their finished course and we played the whole thing end to end, twice. The clock tower is still the one nobody can beat.\n\nThank you all — it has been a good five weeks.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.oskar],
    report:
      "# Publishing week\n\nEverybody put their course up so the group could play each other's. Two are still private and will go up next week.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Playtesting\n\nEvery team handed their course to another team and watched them fail at it, which remains the most useful hour of the whole thing.",
    lastEditedBy: SESSION_FEED_EDITORS.petra,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Checkpoints and traps\n\nCheckpoints so nobody starts from the beginning again, and one trap each. The traps took the whole session and were worth it.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Getting started\n\nNames, ground rules, and one baseplate each. A quiet start on purpose.",
    lastEditedBy: SESSION_FEED_EDITORS.sanna,
  },
];

/* ------------------------------------------------------------------ */

const SCENARIOS: Record<GroupWorkspaceScenario, ScenarioConfig> = {
  /**
   * **The kitchen sink.** A remote weekly club a year and a bit into its run,
   * carrying every state the feed can be in at once: sessions finished on both
   * halves (marked off *and* reported), sessions flagged for a missing report,
   * sessions flagged for a missing register, bare gaps, a week reported but
   * never marked off, a week whose roster was started and abandoned, a pre-epoch
   * tail nothing is owed for, a future horizon with reports already on it, and
   * three sister groups in the rail — one of them not staffed yet. Fifty-five
   * weeks is also what makes the month dividers and the scroll-fed history do
   * any work at all, and the reports themselves run from two lines to
   * twelve so the feed's clamp is exercised beside reports short enough not to
   * need it.
   */
  club: {
    productName: "Minecraft Monday Club",
    productType: "consumer_club",
    topic: "minecraft_java",
    cadence: "weekly",
    specs: CLUB_SPECS,
    startTime: "16:30",
    durationMinutes: 90,
    slots: CLUB_SLOTS,
    // Fifty-five weeks of history — the club has run through a full year and
    // over a New Year, which is what makes the month dividers earn their place.
    startedDaysAgo: 55 * 7,
    endsInDays: null,
    requiresGamerCreations: false,
    isRemote: true,
    // Remote: no building, so no site-notes panel on the page.
    site: null,
    materialUrl: "https://drive.sog.gg/minecraft-monday-club/lesson-plans",
    groupName: "Monday A",
    groupNotes: {
      publicNote:
        "Monday A is our redstone-heavy group, and we have been going for over a year now. The shared world carries across every session, so anything you build stays there for next week — scroll back through the feed to see what the group has made since it started.",
      staffNote:
        "Two siblings in this group (Aino and Väinö) — same parent email, so one message reaches both. Siiri needs pairing rather than free choice of partner. Room laptops 3 and 5 have flaky audio. Everything before last autumn predates write-ups, so the oldest entries are blank by design, not by neglect.",
    },
    // A club is the one product long-lived enough for "new to this group" to
    // mean anything, so it is the only scenario with newcomer badges lit.
    memberFlair: clubMemberFlair,
    peers: [
      { id: "mock-group-b", name: "Monday B", participantCount: 7, gedus: [PETRA] },
      {
        id: "mock-group-c",
        name: "Monday C",
        participantCount: 6,
        gedus: [PETRA, JOONAS],
      },
      // Newly split off and not staffed yet — the peer row's "no Gedus
      // assigned" line, which is a real state on a growing product.
      { id: "mock-group-d", name: "Monday D", participantCount: 4, gedus: [] },
    ],
  },

  /**
   * **The other shape a product can be**: in person, daily rather than weekly,
   * and end-dated.
   *
   * All three are things the club scenario structurally cannot show. Daily
   * cadence packs the dates far tighter than a club ever does — consecutive
   * weekdays with a weekend gap through the middle — which is the layout stress
   * a weekly fixture never applies. In person means the product has a *site*,
   * so this is the only scenario carrying site notes, and it means there is no
   * voice room anywhere on the page: no Join button is rendered at all.
   *
   * End-dated is the third, and it is why the **long future** lives here rather
   * than on the club. An open-ended club's horizon is capped at eight
   * occurrences by the same rule the parent dashboards use, so its divider can
   * never say more than seven; an end-dated product ignores that cap and emits
   * every occurrence to its end date. A camp with four weeks left is therefore
   * the honest home for the feed's volume case — seventeen future entries, a
   * divider reading "16 more upcoming sessions", and an upward reveal proved against
   * a screenful rather than against four rows.
   *
   * **It is also where the feed's live state is shown.** A camp day runs the
   * whole working day here, so at any ordinary reviewing hour one entry is a
   * session in progress: still `future` (the kind flips at the session's end),
   * rendered as the current session at the head of the feed, live-tagged, and
   * carrying the record editor rather than the notes-only one — because the
   * register opens when the session starts. That is the roll-call case, and a
   * scenario is the only place it can be looked at in a real page.
   *
   * It owes exactly one session — yesterday's, register not yet done — which is
   * what puts an attention badge on an in-person dashboard card. Every other day
   * of the run carries both halves, register and report, which is what keeps the
   * count at one now that a missing write-up is owed work too. The club beside
   * it carries the real backlog; one gap here is the difference between "a camp
   * gedu who is on top of it" and "a card state nobody can see".
   *
   * **It is also the only scenario whose creations are wanted but not yet
   * owed**, which is the state the whole pre-end half of that block exists for.
   * The camp is flagged and its run has a month left, so the last day of it —
   * top of the future block, behind the divider's reveal — carries the block in
   * its informational tone with nobody published yet. That is a state no
   * finished run can show and no unflagged product can have, and it is the
   * answer to "a gedu should be able to see this coming"; `owed` is the same
   * block after the last session has been and gone.
   */
  camp: {
    productName: "Roblox Builders Camp",
    productType: "camp",
    // Named for Roblox and topiced for Minecraft, which looks like a mistake
    // and is not: this scenario's job is the in-person, daily, end-dated
    // *product* shape, and its roster was authored with Minecraft handles.
    // The `roblox` scenario below is where the other identity is judged, with
    // both halves changed together — a fixture whose topic disagreed with its
    // roster would render eight "none" rows and prove nothing.
    topic: "minecraft_java",
    cadence: "daily",
    specs: CAMP_SPECS,
    // **A full camp day, and the length is the point.** A three-hour morning
    // made the feed's *live* state almost unreachable in review: a session in
    // progress is the one entry that renders as current, live-tagged and
    // carrying the record editor, and a reviewer opening the scene outside
    // those three hours never saw it. A full-day camp puts a session in
    // progress across the whole working day, which is also the shape that
    // exposed the kind rule in the first place — a long session is where
    // classifying a running club as history stops being a technicality and
    // becomes most of the day.
    startTime: "08:00",
    durationMinutes: 10 * 60,
    slots: CAMP_SLOTS,
    startedDaysAgo: 9,
    // **The day of its own last scheduled session**, read off the feed rather
    // than guessed at as an offset. It used to be a round four weeks out, which
    // comfortably covered the seventeen future entries and was wrong by a few
    // days in a way nothing noticed — until the creations block, which is drawn
    // on the run's *final* session and so has to be able to find it. Being
    // end-dated at all is what takes the eight-occurrence cap off the horizon
    // and lets the future block be seventeen entries long; being end-dated on
    // the right day is what lets the last of them know it is the last.
    endsInDays: "last-session",
    // Flagged, and the run has **not** finished — which is the other half of
    // the creations signal and the only scenario that can be it. The final
    // session sits at the top of the future block carrying the block in its
    // informational tone: nine members, none of them published yet, nothing
    // owed and four weeks to go. `owed` below is the same block after the run
    // has ended, and the two are the whole of what the block can look like.
    requiresGamerCreations: true,
    isRemote: false,
    // The site pair is deliberately half-written: the family note is there and
    // the staff note is not, so the partial-fill ghost is reviewable on a real
    // page. It costs nothing here because the group notes one panel over are
    // filled on both sides, so the finished pair is still on show beside it.
    site: {
      name: "Sello Library, Espoo",
      address: "Leppävaarankatu 9, 02600 Espoo",
      publicNote:
        "Drop-off is from 08:00 and pick-up is by 18:00, both at the main entrance on Leppävaarankatu. Come up to the second floor and the group room is on the right, past the study desks. There is a water fountain outside the room, and the café downstairs closes at 16:00.",
      staffNote: null,
    },
    materialUrl: "https://drive.sog.gg/roblox-builders-camp/day-by-day",
    groupName: "Builders red",
    groupNotes: {
      publicNote:
        "Builders red are working towards one shared obstacle course by Friday. Everything each team builds gets snapped into it at the end of the week.",
      staffNote:
        "The site's laptops are slow to load Studio — start them ten minutes early. Lunch is 12:30, there is a proper break at 15:00, and the room has to be clear by 18:00.",
    },
    // Notes, and an empty newcomers map — the one place the two gates are shown
    // coming apart, and the exact shape the live shell hands a non-club product.
    // See `campMemberFlair`.
    memberFlair: campMemberFlair,
    peers: [
      {
        id: "mock-group-blue",
        name: "Builders blue",
        participantCount: 8,
        gedus: [PETRA],
      },
      {
        id: "mock-group-green",
        name: "Builders green",
        participantCount: 7,
        gedus: [JOONAS, MARKUS],
      },
    ],
  },

  /**
   * **The other game identity.** A Roblox Studio product, so every child row
   * carries a Roblox handle instead of a Minecraft one — a bust-proportioned
   * figure where the club draws a whole body, the same pencil, the same inline
   * editor, and the same fixed geometry through a save.
   *
   * The roster spreads the two states a fixture can reach: verified handles
   * (a stored account id) and typed-but-unchecked ones (a name with no id),
   * plus two children who have given nothing. The in-flight and refused states
   * come from a real lookup and are rehearsed by the scene's faked latency, the
   * same way the Minecraft scenarios rehearse theirs.
   *
   * **Every figure here is the drawn stand-in, including on the verified rows**,
   * and that is a property of previews rather than of Roblox: a scene must not
   * reach a third-party host on load, so no render is resolved. On the live page
   * a verified row's picture arrives from the roster's one batched by-id call.
   */
  roblox: {
    productName: "Roblox Studio Thursday",
    productType: "consumer_club",
    topic: "roblox_studio",
    cadence: "weekly",
    specs: ROSTER_SCENARIO_SPECS,
    startTime: "17:00",
    durationMinutes: 90,
    slots: [{ weekday: 3, start_time: "17:00", duration_minutes: 90 }],
    startedDaysAgo: 4 * 7,
    endsInDays: null,
    requiresGamerCreations: false,
    isRemote: true,
    site: null,
    materialUrl: "https://drive.sog.gg/roblox-studio-thursday/lesson-plans",
    groupName: "Thursday A",
    // The partially-filled notes state: a written family note with the staff
    // ghost below it, inside the padlocked block, so the one-note group is on
    // show somewhere. The empty half is deliberate, not an unfinished fixture.
    groupNotes: {
      publicNote:
        "Thursday A are building one shared obstacle course, a few obstacles at a time. Everything each team makes gets snapped into it at the end of the term.",
      staffNote: null,
    },
    // The only question this scenario is open to answer is what a Roblox
    // identity cell looks like, so the roster carries the standard quiet
    // overlay — every note button dimmed, no badges — rather than none at all,
    // which is not a state the live page has.
    memberFlair: quietMemberFlair,
    peers: [
      {
        id: "mock-group-thursday-b",
        name: "Thursday B",
        participantCount: 6,
        gedus: [PETRA],
      },
    ],
  },

  /**
   * **A product about no game account at all**, which is the commonest kind:
   * most topics name subject matter rather than one piece of software, so most
   * rosters show no identity cell anywhere.
   *
   * The whole point of the scenario is what is *missing* — every child row is
   * the short row, with nothing reserved where a figure would be, so the rail
   * reads as a deliberately compact column rather than as a roster that failed
   * to load. The adult row at the bottom is the reference: it has always been
   * this shape, and here it is no shorter than the eight above it.
   */
  "no-platform": {
    productName: "Programming Club",
    productType: "consumer_club",
    topic: "programming",
    cadence: "weekly",
    specs: ROSTER_SCENARIO_SPECS,
    startTime: "16:00",
    durationMinutes: 90,
    slots: [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }],
    startedDaysAgo: 4 * 7,
    endsInDays: null,
    requiresGamerCreations: false,
    isRemote: true,
    site: null,
    materialUrl: null,
    groupName: "Tuesday A",
    // The fully-empty notes state: both ghosts showing, which is what a brand-new
    // group's gedu meets — the state the ghost hints exist to teach.
    groupNotes: {
      publicNote: null,
      staffNote: null,
    },
    // The same quiet overlay as the Roblox scenario, and for the same reason:
    // the subject here is the short row, so nothing on it is lit — but the note
    // button is still on every row, because a roster without one is not a
    // roster this page can draw.
    memberFlair: quietMemberFlair,
    peers: [
      {
        id: "mock-group-tuesday-b",
        name: "Tuesday B",
        participantCount: 5,
        gedus: [JOONAS],
      },
    ],
  },

  /**
   * **The owed signal, which needs a product shape none of the four above can
   * be**: flagged as requiring a creation from every member, with a run that
   * has already finished.
   *
   * Both halves are load-bearing and neither is optional. The flag is what
   * creates the obligation at all; the *finished* run is what makes it due,
   * because the condition attaches to the final session and flips at that
   * session's end instant like every other thing a session owes. Flagging the
   * club would produce nothing — an open-ended run has no final session — and
   * ending the camp's run would cost it the live session and the long future
   * block it exists for.
   *
   * **Everything the signal does is on this one page.** The newest card carries
   * the amber needs-attention line, its marker on the timeline takes the warning
   * tone, the card itself names the two members it is waiting on, and those two
   * carry the warning tone on their roster buttons — every one of which opens
   * the same dialog every other row's button opens, because there is one
   * authoring surface and each signal is a route to it rather than a second way
   * in. The four cards below the last one are green, so the amber has something
   * to be amber against.
   *
   * It is deliberately thin on everything else — a five-week run, one peer
   * group, no site, no backlog of any other kind — for the same reason the two
   * identity scenarios are: the only question it is open to answer is what owed
   * creations look like, and every unrelated state on the page is one more thing
   * a reviewer has to look past.
   *
   * A Roblox product, because the contract that produced this requirement is the
   * Roblox one — and a scenario whose creations are Roblox game links reads as
   * the thing it stands in for rather than as a flag switched on at random.
   */
  owed: {
    productName: "Roblox Programme, autumn",
    // A club rather than a camp, because that is what a weekly five-week term
    // is — and it is the type that lets the newcomer badge render at all, since
    // that badge is clubs-only. A camp meeting once a week would be a fixture
    // shaped like nothing the catalogue sells.
    productType: "consumer_club",
    topic: "roblox_studio",
    cadence: "weekly",
    specs: OWED_SPECS,
    startTime: "16:00",
    durationMinutes: 90,
    slots: [{ weekday: 0, start_time: "16:00", duration_minutes: 90 }],
    // Five weekly sessions, so the run opened four weeks before its last one.
    // A day or two of slack either side of that would be fine — the start date
    // only has to sit at or below the final session for the derivation to find
    // it — but the honest number is the one the feed actually produces.
    startedDaysAgo: 4 * 7,
    // Read off the feed rather than offset from `now`: the end date of a
    // finished run *is* its last session's day, and it has to be exactly that
    // or the final-session derivation lands on a different day, or on none.
    endsInDays: "last-session",
    requiresGamerCreations: true,
    isRemote: true,
    site: null,
    materialUrl: "https://drive.sog.gg/roblox-programme/autumn",
    groupName: "Autumn A",
    groupNotes: {
      publicNote:
        "Autumn A built one obstacle course each over five weeks, and everybody published theirs at the end so the group could play them all.",
      staffNote:
        "Contract group — every gamer needs a published game link before this closes. Emil joined for the last fortnight and Marja is taking part alongside her son.",
    },
    memberFlair: owedMemberFlair,
    peers: [
      {
        id: "mock-group-autumn-b",
        name: "Autumn B",
        participantCount: 7,
        gedus: [PETRA],
      },
    ],
  },
};

export function buildGroupWorkspaceFixture(
  now: Date,
  scenario: GroupWorkspaceScenario,
): GroupWorkspaceFixture {
  const config = SCENARIOS[scenario];

  const feed = buildSessionFeedFixture(now, {
    cadence: config.cadence,
    specs: config.specs,
    clubName: config.productName,
    startTime: config.startTime,
    durationMinutes: config.durationMinutes,
  });

  const groupId = "mock-group-a";

  /**
   * The feed fixture's index-keyed ids, rewritten to the ids the live page has.
   *
   * A session's identity on this page is a `(group, product-local date)` pair —
   * the row's unique key in Postgres — and the workspace *derives* ids from it:
   * the final-session obligation looks its entry up by building one, and the
   * card's writes turn one back into the pair they have to address. Against
   * `mock-session-3` both of those silently find nothing, so a scenario whose
   * whole subject is the final session could not have one at all.
   *
   * It is done here rather than in the feed fixture because the group is this
   * fixture's to know: the feed builds a run of sessions and has no group.
   */
  const dateOf = (startsAt: Date) =>
    formatInTimeZone(startsAt, feed.timeZone, "yyyy-MM-dd");
  const entries = feed.entries.map((entry) => ({
    ...entry,
    id: sessionEntryId(groupId, dateOf(entry.startsAt)),
  }));
  const sendOutcomes = new Map(
    feed.entries.flatMap((entry, index) => {
      const outcome = feed.sendOutcomes.get(entry.id);
      return outcome === undefined
        ? []
        : [[entries[index].id, outcome] as const];
    }),
  );

  /**
   * The run's end date: an offset from `now`, nothing at all, or **the day of
   * its own last session**, read off the feed above.
   *
   * `entries[0]` is that session whichever side of `now` it falls on, because
   * the feed is strictly descending: on a finished run it is the newest past
   * entry, and on a run still going it is the furthest-away future one. Both
   * need the third form for the same reason — the final-session derivation
   * looks up an entry id built from this date, so an end date that is a day or
   * two past the schedule's last occurrence finds a day the feed does not
   * carry, and everything hanging off "the final session" goes quiet.
   */
  const endDate =
    config.endsInDays === null
      ? null
      : config.endsInDays === "last-session"
        ? dateOf(entries[0].startsAt)
        : calendarDate(now, config.endsInDays);

  const assignedGroup: GeduAssignedProductGroup = {
    id: groupId,
    name: config.groupName,
    created_at: calendarDate(now, -config.startedDaysAgo),
    is_my_group: true,
    participant_count: SESSION_FEED_ROSTER.length,
    gedus: [
      { id: GEDU_IDS.sanna, first_name: "Sanna" },
      { id: GEDU_IDS.petra, first_name: "Petra" },
    ],
    // Read off the topic rather than passed beside it, so the shell and the rows
    // cannot disagree about which identity this product is about — the same
    // function the page itself resolves the question with.
    roster: buildRoster(now, platformForTopic(config.topic)),
  };

  const peerGroups: GeduAssignedProductGroup[] = config.peers.map((peer) => ({
    id: peer.id,
    name: peer.name,
    created_at: calendarDate(now, -config.startedDaysAgo),
    is_my_group: false,
    participant_count: peer.participantCount,
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
        topic: config.topic,
        timezone: SESSION_FEED_TIMEZONE,
        start_date: calendarDate(now, -config.startedDaysAgo),
        end_date: endDate,
        is_remote: config.isRemote,
        // Flagged on two scenarios, one per tone of the session card's
        // creations block: the camp, whose run is still going, states the
        // obligation quietly; `owed`, whose run has ended, states it in amber.
        // Creations themselves are on show without the flag — the club's rail
        // has rows lit by one — because what the flag adds is the obligation,
        // not the data.
        requires_gamer_creations: config.requiresGamerCreations,
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
    entries,
    feedRoster: feed.roster,
    sendOutcomes,
    sourceTimeZone: feed.timeZone,
    groupNotes: config.groupNotes,
    site: config.site,
    materialUrl: config.materialUrl,
    memberFlair: config.memberFlair(now),
  };
}

/**
 * A bare `YYYY-MM-DD` offset from today, **as today falls in the product's own
 * zone**.
 *
 * Product start/end dates and dates of birth are zoneless calendar dates, but
 * the offset has to be taken from a day that means something, and the day these
 * are read against is the one the schedule is authored in. Stepping in UTC
 * instead moved every date a day early for the evening hours between UTC and
 * Helsinki midnight — enough to put an end-dated camp's boundary behind its own
 * last session.
 */
function calendarDate(now: Date, dayOffset: number): string {
  const zoned = toZonedTime(now, SESSION_FEED_TIMEZONE);
  zoned.setDate(zoned.getDate() + dayOffset);
  return formatInTimeZone(
    fromZonedTime(zoned, SESSION_FEED_TIMEZONE),
    SESSION_FEED_TIMEZONE,
    "yyyy-MM-dd",
  );
}

/**
 * The nine feed regulars as roster rows — eight children and one adult. Ages,
 * genders and game-account states are spread across the group so every shape
 * this surface can produce is on screen at once.
 *
 * **The platform is a parameter, and it decides which columns carry anything.**
 * A roster row holds both platforms' pairs at once and the page shows the one
 * its topic is about, so a Minecraft product's rows leave the Roblox pair null
 * and a Roblox product's rows leave the Minecraft pair null — never both filled,
 * which would let a fixture look right on a page reading the wrong column. A
 * product about no platform fills neither, and every child row is then the short
 * row.
 *
 * That is **two** rendered states for the game account, not three. The row draws
 * a check for an account with a confirmed key and nothing at all otherwise, so a
 * name typed in but never checked and no name at all land on the same treatment
 * — the only difference between them is the text, one showing the username and
 * the other the "none" placeholder. Both are here anyway, because that text is
 * the thing a gedu reads. The row's other two states (a check in flight, a name
 * the platform does not know) can only come from a live lookup, which a preview
 * never makes.
 *
 * Two children share a parent email — that's the sibling case the
 * copy-all-emails helper de-duplicates.
 *
 * **Every child has a parent email**, because every child really does: a gamer
 * account is created by a parent who signed up with one. There is no
 * missing-email state in the UI any more, so a fixture withholding one would be
 * rehearsing a case the product does not have.
 *
 * **Marja is the adult**, and she is the case the empty half of the row exists
 * for: `null` age, gender and game account, because those live on tables an
 * adult has no row in, and her own address in `participant_email` where a child
 * carries their parent's. She is deliberately *the same Marja* whose address
 * two of the children already share — a parent who enrolled herself on the club
 * her children attend is the likeliest real shape of this, and it makes the
 * copy-all list's de-duplication meet the case where the duplicate is a
 * participant rather than a sibling's parent.
 *
 * One address is deliberately very long. Roster rows have to survive an email
 * that is wider than the rail they sit in, and a fixture full of tidy
 * eleven-character addresses is exactly how a wrapping bug ships.
 */
function buildRoster(
  now: Date,
  platform: GamePlatform | null,
): GeduAssignedProductRosterEntry[] {
  /**
   * Keyed by participant id rather than positioned against the roster array:
   * the adult sits in that array too, so an index-aligned list of eight child
   * details only lines up while she happens to be last. Reordering the roster —
   * or giving a second adult a seat — would then hand a child somebody else's
   * age, gender and parent address with nothing failing.
   *
   * Each child carries a handle on **both** platforms; which pair is emitted is
   * decided below by the product's own platform. The keys are shaped like the
   * real ones on each side, because a fixture that does not look like the thing
   * it stands in for stops being a fair test of the row that renders it: the
   * Minecraft ones are real generated UUIDv4s, and the Roblox ones are positive
   * integers in the range Roblox has been issuing for years. A null key beside a
   * username is the typed-but-never-checked state, and it is deliberately not
   * the same children on the two platforms — so switching scenarios shuffles
   * which rows wear a tick rather than repeating one arrangement twice.
   */
  const details: Record<string, {
    age: number;
    gender: GeduAssignedProductRosterEntry["gender"];
    minecraftUsername: string | null;
    minecraftUuid: string | null;
    robloxUsername: string | null;
    robloxUserId: number | null;
    parentEmail: string;
  } | undefined> = {
    [SESSION_FEED_GAMER_IDS.aino]: { age: 11, gender: "girl", minecraftUsername: "AinoBuilds", minecraftUuid: "617bc50c-7dfe-4b39-8c74-8f01b9110f92", robloxUsername: "AinoBuilds", robloxUserId: 1583920471, parentEmail: "marja.korhonen@example.com" },
    [SESSION_FEED_GAMER_IDS.vaino]: { age: 12, gender: "boy", minecraftUsername: "VainoTheBold", minecraftUuid: "04c2b904-a933-44b1-b295-38d499d58b2b", robloxUsername: "VainoTheBold", robloxUserId: 2094817330, parentEmail: "marja.korhonen@example.com" },
    [SESSION_FEED_GAMER_IDS.elias]: { age: 10, gender: "boy", minecraftUsername: "EliasRedstone", minecraftUuid: null, robloxUsername: "Elias_Builds", robloxUserId: 3312048765, parentEmail: "tuomas.laine@example.com" },
    [SESSION_FEED_GAMER_IDS.linnea]: { age: 13, gender: "girl", minecraftUsername: null, minecraftUuid: null, robloxUsername: "LinneaLoops", robloxUserId: null, parentEmail: "sofia.margareta.lindqvist-holmberg@kotiposti.example.com" },
    [SESSION_FEED_GAMER_IDS.oskar]: { age: 9, gender: "boy", minecraftUsername: "OskarOre", minecraftUuid: "c0be0c66-a9ab-40ee-9768-c4f8307f8cdb", robloxUsername: null, robloxUserId: null, parentEmail: "henrik.lindqvist@example.com" },
    [SESSION_FEED_GAMER_IDS.siiri]: { age: 11, gender: "girl", minecraftUsername: "SiiriSky", minecraftUuid: null, robloxUsername: "SiiriSky", robloxUserId: 4460918227, parentEmail: "petri.makinen@example.com" },
    [SESSION_FEED_GAMER_IDS.emil]: { age: 12, gender: "boy", minecraftUsername: null, minecraftUuid: null, robloxUsername: null, robloxUserId: null, parentEmail: "anna.virtanen@example.com" },
    [SESSION_FEED_GAMER_IDS.hilda]: { age: 10, gender: "non_binary", minecraftUsername: "HildaHollow", minecraftUuid: "550f9847-3598-44a8-8232-7280d4881f5b", robloxUsername: "HildaHollow", robloxUserId: 1907754382, parentEmail: "kaisa.nieminen@example.com" },
  };

  return SESSION_FEED_ROSTER.map((person) => {
    if (person.id === SESSION_FEED_ADULT_ID) {
      return {
        participant_id: person.id,
        first_name: person.firstName,
        date_of_birth: null,
        // An adult seat carries no linked game account on either platform.
        minecraft_username: null,
        minecraft_uuid: null,
        roblox_username: null,
        roblox_user_id: null,
        gender: null,
        // No linked parent — she is the adult. The RPC's two contact fields are
        // mutually exclusive and this is the other side of that.
        parent_email: null,
        participant_email: "marja.korhonen@example.com",
        // The staff-only flair (00203) is null-shaped on every roster entry
        // here, on purpose: the scene feeds both marks through the page body's
        // own `RosterMemberFlair` prop, and rows do not read flair off a roster
        // entry. Filling these in would be a second source for one fact.
        group_joined_at: null,
        note: null,
        note_updated_by_first_name: null,
        creations: [],
      };
    }
    const detail = details[person.id];
    if (!detail) {
      throw new Error(
        `session-feed roster member ${person.firstName} (${person.id}) has no roster detail fixture`,
      );
    }
    // Exactly one pair is emitted, and on a product about no platform neither
    // is. A row carrying both would render correctly here and hide the bug the
    // moment a surface read the column its topic did not name.
    const minecraft = platform === "minecraft";
    const roblox = platform === "roblox";
    return {
      participant_id: person.id,
      first_name: person.firstName,
      // Offset a few days past the birthday so the computed age is exact.
      date_of_birth: calendarDate(now, -(detail.age * 365 + 12)),
      minecraft_username: minecraft ? detail.minecraftUsername : null,
      minecraft_uuid:
        minecraft && detail.minecraftUsername ? detail.minecraftUuid : null,
      roblox_username: roblox ? detail.robloxUsername : null,
      roblox_user_id:
        roblox && detail.robloxUsername ? detail.robloxUserId : null,
      gender: detail.gender,
      parent_email: detail.parentEmail,
      // A child's contact is their linked parent's address; their own profile
      // email is the synthetic handle and is never emitted.
      participant_email: null,
      // Null-shaped for the same reason as the adult row above: the scene's
      // flair travels through the page body's `RosterMemberFlair` prop.
      group_joined_at: null,
      note: null,
      note_updated_by_first_name: null,
      creations: [],
    };
  });
}
