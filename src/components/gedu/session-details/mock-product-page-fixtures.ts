import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  CLUB_FUTURE_SPECS,
  SESSION_FEED_GAMER_IDS,
  SESSION_FEED_ROSTER,
  SESSION_FEED_TIMEZONE,
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

/**
 * **Two scenarios, and deliberately only two.**
 *
 * There were five, and four of them differed from the kitchen sink by one
 * state each — a heavier backlog, a shorter history, no peer groups. States
 * that can coexist belong in the same scenario, because a reviewer who has to
 * open five pages to see five things will see three of them; and every extra
 * scenario is another fixture to keep honest for a page that only has two
 * genuinely exclusive shapes to be in.
 *
 * Those two are the shapes that cannot coexist: `club` is remote and weekly,
 * `camp` is in-person and daily. Everything else the page can do — a year of
 * history, a session written up but never marked off, a skipped week, an
 * unstaffed sister group, a venue's shared notes — is packed into whichever of
 * the two it belongs to.
 */
export const GEDU_PRODUCT_SCENARIOS = ["club", "camp"] as const;

export type GeduProductScenario = (typeof GEDU_PRODUCT_SCENARIOS)[number];

export function isGeduProductScenario(s: string): s is GeduProductScenario {
  return (GEDU_PRODUCT_SCENARIOS as readonly string[]).includes(s);
}

/** The persistent, non-session notes attached to the group itself. */
export interface GroupNotesFixture {
  publicNote: string | null;
  staffNote: string | null;
}

/**
 * The venue an in-person product runs at, with the notes that hang off it.
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

export interface GeduProductPageFixture {
  data: GeduAssignedProduct;
  entries: SessionFeedEntry[];
  /** The attendance roster, keyed to the same ids as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** The zone the schedule was authored in. */
  sourceTimeZone: string;
  /** Standing notes about the group, distinct from any one session's. */
  groupNotes: GroupNotesFixture;
  /** The venue and its shared notes, or `null` for a remote product. */
  site: SiteFixture | null;
  /**
   * Staff-facing lesson/material URL, read from the product's staff-details
   * row. Must never be rendered to a parent or gamer.
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
  /**
   * Remote products have a voice room; in-person ones have a building. The two
   * are exclusive, and the flag drives both — an in-person page renders **no
   * Join affordance at all** (not a locked one: there is no room, so there is
   * nothing to lock), and only an in-person page carries site notes.
   */
  isRemote: boolean;
  /** The venue, on in-person products only. */
  site: SiteFixture | null;
  materialUrl: string | null;
  groupName: string;
  groupNotes: GroupNotesFixture;
  /**
   * The other groups running on the same product — the reference rail's
   * peer-cover rows. Both scenarios carry some: the rail's empty state is one
   * short line, and losing it costs less than losing a scenario to it.
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
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day four: sound and lighting\n\nNeon needs neon, so the afternoon went on emissive parts and a soundtrack that loops without anyone noticing the seam.\n\n## What changed\n\n- Every obstacle now lights its own approach, so you can see where you are going\n- A four-bar loop under the whole course, built by three of the group together\n- A very loud sound on the finish line, which was not my idea and is staying",
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day three: our first scripts\n\nWe wrote our first Lua today — a checkpoint that saves where you got to — and then broke it on purpose to find out what the error messages actually mean.\n\n## How it went\n\nEveryone got a working checkpoint. The useful part was the breaking: a script that says `attempt to index nil` is not being rude, it is telling you that the thing you asked for is not there, and once that landed the group started reading the errors instead of calling me over.\n\nHilda finished early and ended up debugging two other tables' scripts, which she was very pleased about.\n\n**At home:** the place to look is the Output window at the bottom of Studio. Almost every problem is named there in plain words.",
    staffNote:
      "The room's laptops are slow to load Studio; start the machines ten minutes before the group arrives tomorrow.",
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.oskar, SESSION_FEED_GAMER_IDS.emil],
    report:
      "# Day two: building the course\n\nTeams of two, one obstacle each, all snapped together into a single course by the end of the afternoon.\n\nIt is unfair and much too long, which everyone considers to be the point.",
  },
  {
    kind: "past",
    absent: [SESSION_FEED_GAMER_IDS.hilda],
    report:
      "# Day one and a half: picking a theme\n\nThe group voted on a theme for the shared course. Neon city won by a distance, and half the afternoon went on arguing about whether lava counts as neon.\n\nIt does not, and the ruling was extremely unpopular.",
  },
  {
    kind: "past",
    allPresent: true,
    report:
      "# Day one: getting started\n\nEveryone got a Roblox Studio account working, made a baseplate and pushed a block off it.\n\n- Names and ground rules\n- Who is sitting next to whom for the week\n- One baseplate each, and one block pushed off each\n\nA quiet start on purpose. Tomorrow we pick a theme and start building for real.",
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
 * - *Complete* — the majority: marked off and reported, wearing the green check.
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
  const past: EntrySpec[] = [];

  for (let index = 0; index < 53; index++) {
    if (OWED_AT.has(index)) {
      past.push({ kind: "past" });
      continue;
    }
    if (PART_MARKED_AT.has(index)) {
      // Four of eight answered and then something else happened. It saved, it
      // is still flagged, and it reads "4 of 8 marked" until someone finishes.
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
      });
      continue;
    }
    if (REPORT_BUT_NO_ATTENDANCE_AT.has(index)) {
      past.push({
        kind: "past",
        report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
      });
      continue;
    }
    if (MARKED_BUT_NO_REPORT_AT.has(index)) {
      past.push({
        kind: "past",
        allPresent: true,
        staffNote: YEARLONG_STAFF_NOTES[index % YEARLONG_STAFF_NOTES.length],
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
      kind: "past",
      report: YEARLONG_RECAPS[index % YEARLONG_RECAPS.length],
      ...(index % 7 === 3
        ? { staffNote: YEARLONG_STAFF_NOTES[index % YEARLONG_STAFF_NOTES.length] }
        : {}),
      ...(away ? { absent: away } : { allPresent: true }),
    });
  }

  return [
    ...CLUB_FUTURE_SPECS,
    ...past,
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
    },
    { kind: "no_record" },
    { kind: "no_record" },
  ];
}

const CLUB_SPECS = yearlongSpecs();

/* ------------------------------------------------------------------ */

const SCENARIOS: Record<GeduProductScenario, ScenarioConfig> = {
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
    cadence: "weekly",
    specs: CLUB_SPECS,
    startTime: "16:30",
    durationMinutes: 90,
    slots: CLUB_SLOTS,
    // Fifty-five weeks of history — the club has run through a full year and
    // over a New Year, which is what makes the month dividers earn their place.
    startedDaysAgo: 55 * 7,
    endsInDays: null,
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
    peers: [
      { id: "mock-group-b", name: "Monday B", gamerCount: 7, gedus: [PETRA] },
      {
        id: "mock-group-c",
        name: "Monday C",
        gamerCount: 6,
        gedus: [PETRA, JOONAS],
      },
      // Newly split off and not staffed yet — the peer row's "no Gedus
      // assigned" line, which is a real state on a growing product.
      { id: "mock-group-d", name: "Monday D", gamerCount: 4, gedus: [] },
    ],
  },

  /**
   * **The other shape a product can be**: in person, daily rather than weekly,
   * and end-dated.
   *
   * All three are things the club scenario structurally cannot show. Daily
   * cadence packs the dates far tighter than a club ever does — consecutive
   * weekdays with a weekend gap through the middle — which is the layout stress
   * a weekly fixture never applies. In person means the product has a *venue*,
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
   * It owes exactly one session — yesterday's, register not yet done — which is
   * what puts an attention badge on an in-person dashboard card. Every other day
   * of the run carries both halves, register and report, which is what keeps the
   * count at one now that a missing write-up is owed work too. The club beside
   * it carries the real backlog; one gap here is the difference between "a camp
   * gedu who is on top of it" and "a card state nobody can see".
   */
  camp: {
    productName: "Roblox Builders Camp",
    productType: "camp",
    cadence: "daily",
    specs: CAMP_SPECS,
    startTime: "10:00",
    durationMinutes: 180,
    slots: CAMP_SLOTS,
    startedDaysAgo: 9,
    // Four weeks out, which comfortably covers seventeen more weekday
    // sessions however the run lines up against the weekends it straddles.
    // What matters is only that the product *is* end-dated: that is what takes
    // the eight-occurrence cap off the horizon and lets the future block be
    // seventeen entries long.
    endsInDays: 28,
    isRemote: false,
    site: {
      name: "Sello Library, Espoo",
      address: "Leppävaarankatu 9, 02600 Espoo",
      publicNote:
        "Drop-off and pick-up are at the main entrance on Leppävaarankatu. Come up to the second floor and the group room is on the right, past the study desks. There is a water fountain outside the room, and the café downstairs closes at 16:00.",
      staffNote:
        "Room key is at the info desk on the ground floor, signed out under the SOG booking. The projector needs the HDMI adapter from the drawer, not the cable left on the table. Fire exit is the stairwell behind the room, not the lift lobby. The caretaker locks the second floor at 18:00 sharp.",
    },
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
        timezone: SESSION_FEED_TIMEZONE,
        start_date: calendarDate(now, -config.startedDaysAgo),
        end_date:
          config.endsInDays === null ? null : calendarDate(now, config.endsInDays),
        is_remote: config.isRemote,
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
    site: config.site,
    materialUrl: config.materialUrl,
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
 * The eight feed regulars as roster rows. Ages, genders and Minecraft states are
 * spread across the group so every shape this surface can produce is on screen
 * at once.
 *
 * That is **two** rendered states, not three. The row draws a check for an
 * account with a verified UUID and nothing at all otherwise, so a name typed in
 * but never checked and no name at all land on the same treatment — the only
 * difference between them is the text, one showing the username and the other
 * the "none" placeholder. Both are here anyway, because that text is the thing a
 * gedu reads. The row's other two states (a check in flight, a name Mojang does
 * not know) can only come from a live lookup, which a preview never makes.
 *
 * Two children share a parent email — that's the sibling case the
 * copy-all-emails helper de-duplicates.
 *
 * **Every child has a parent email**, because every child really does: a gamer
 * account is created by a parent who signed up with one. There is no
 * missing-email state in the UI any more, so a fixture withholding one would be
 * rehearsing a case the product does not have.
 *
 * One address is deliberately very long. Roster rows have to survive an email
 * that is wider than the rail they sit in, and a fixture full of tidy
 * eleven-character addresses is exactly how a wrapping bug ships.
 */
function buildRoster(now: Date): GeduAssignedProductRosterEntry[] {
  const details: readonly {
    age: number;
    gender: GeduAssignedProductRosterEntry["gender"];
    minecraftUsername: string | null;
    verified: boolean;
    parentEmail: string;
  }[] = [
    { age: 11, gender: "girl", minecraftUsername: "AinoBuilds", verified: true, parentEmail: "marja.korhonen@example.com" },
    { age: 12, gender: "boy", minecraftUsername: "VainoTheBold", verified: true, parentEmail: "marja.korhonen@example.com" },
    { age: 10, gender: "boy", minecraftUsername: "EliasRedstone", verified: false, parentEmail: "tuomas.laine@example.com" },
    { age: 13, gender: "girl", minecraftUsername: null, verified: false, parentEmail: "sofia.margareta.lindqvist-holmberg@kotiposti.example.com" },
    { age: 9, gender: "boy", minecraftUsername: "OskarOre", verified: true, parentEmail: "henrik.lindqvist@example.com" },
    { age: 11, gender: "girl", minecraftUsername: "SiiriSky", verified: false, parentEmail: "petri.makinen@example.com" },
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
