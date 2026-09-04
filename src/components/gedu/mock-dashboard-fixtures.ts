import { previewSceneHref } from "@/components/preview/href";
import {
  calendarDate,
  futureSlot,
  liveNowSlot,
} from "@/components/preview/fixture-clock";
import { countEntriesNeedingAttention } from "@/components/gedu/session-feed";
import { SESSION_FEED_TIMEZONE } from "@/components/gedu/session-feed/mock-fixtures";
import {
  buildGroupWorkspaceFixture,
  type GroupWorkspaceScenario,
} from "@/components/group-workspace/mock-workspace-fixtures";
import type { GeduAssignmentCardData } from "@/components/gedu/GeduAssignmentsSectionView";
import {
  formatProductSchedule,
  scheduleCardLines,
} from "@/lib/products/format-product-schedule";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  rollUpGeduAssignments,
  type GeduAssignmentRow,
} from "@/lib/gedu-assignment-rollup";

/**
 * Fixtures for the gedu dashboard preview scene — a plausible week for a gedu
 * running two remote clubs, an in-person camp and a one-day event, computed from
 * a `now` the caller supplies.
 *
 * Nothing here is hand-written narrative. Assignment rows go through the same
 * roll-up adapter the live dashboard will use, and the recurring-schedule line
 * comes from the same product-schedule formatter the public browse cards use, so
 * the preview shows the real derivations (next occurrence including an
 * in-progress one, cadence in the viewer's zone) rather than a plausible
 * imitation of them. Only two fields are rewritten afterwards, and both because
 * a preview must not lead anywhere live: the Join button is made inert and the
 * two scene-backed cards point at the matching product-page *scene*, so clicking
 * through lands on the feed the badge is talking about.
 *
 * **The badge counts and the camp's site are derived, not authored.** Each
 * scene-backed assignment's needs-attention number is counted out of the very
 * feed its card links to, and its site name is read off the same fixture the
 * product page renders — so a card can never advertise a number or a building
 * the page behind it disagrees with. The cards with no scene behind them carry
 * authored values, because there is no page for them to disagree with.
 */

/**
 * **Three scenarios.**
 *
 * `default` is the working dashboard and carries everything that can coexist on
 * one: all three type nouns, and the five card shapes that between them cover
 * every state a card can be in —
 *
 * 1. a **remote club, live right now**, with its Join lit;
 * 2. a **remote club later this week**, with the same Join in its locked form;
 * 3. a **club whose run has ended**, muted, with no next-session line, an
 *    "Ended …" date where its Join used to be, and a backlog badge still at full
 *    strength — the one card that has to prove a finished run reads as history
 *    without reading as broken. It is deliberately a *club*, so it sorts beneath
 *    the two live ones under the same heading and the demotion is visible on the
 *    page rather than only in a test;
 * 4. an **in-person camp owing a write-up**, carrying the attention badge and no
 *    Join at all;
 * 5. an **in-person event running right now**, which is the pairing that matters
 *    — "session in progress" with no Join beside it, proving the reserved
 *    footer zone holds the card's height open whether or not a button lands in
 *    it.
 *
 * `clubs-only` is the single-noun composition: one heading, one pill entry — and
 * **seven clubs**, because the other thing it exists to show is the grid. Two
 * cards tell you nothing about how the tiles wrap; seven fill a three-column
 * row and start a second one, which is where an uneven last row, a ragged bottom
 * edge or a card that grows on one breakpoint and not another actually becomes
 * visible. Their next sessions are spread across the week and a couple carry a
 * backlog, so the grid is not a row of identical tiles either.
 *
 * `uncertified` is the account an admin has not approved yet, which swaps the
 * instant-room panel for a notice and cannot be true at the same time as the
 * panel being usable. It carries **no assignments at all**, because that is the
 * page the account it describes actually meets: certification is what gates group
 * assignment, so a gedu waiting on it has nothing to be assigned to yet. It
 * therefore doubles as the empty-state scenario — the unheaded section with the
 * "when you're assigned to a group" line, which no other scenario can show.
 */
export const GEDU_DASHBOARD_SCENARIOS = [
  "default",
  "clubs-only",
  "uncertified",
] as const;

export type GeduDashboardScenario = (typeof GEDU_DASHBOARD_SCENARIOS)[number];

export function isGeduDashboardScenario(s: string): s is GeduDashboardScenario {
  return (GEDU_DASHBOARD_SCENARIOS as readonly string[]).includes(s);
}

export interface GeduDashboardFixture {
  /** One roll-up card per assignment, soonest next session first. */
  assignments: GeduAssignmentCardData[];
  certified: boolean;
  /** Whether the contract band is on the page. */
  contractAccepted: boolean;
  /**
   * Whether an admin has recorded this gedu's criminal record extract. With
   * `contractAccepted` and `certified` it decides which of the two next-step
   * bands is on the page, or neither — the body shows at most one.
   */
  criminalRecordCheckPassed: boolean;
}

const MINECRAFT_PRODUCT_ID = "mock-dashboard-minecraft-club";
const CAMP_PRODUCT_ID = "mock-dashboard-roblox-camp";
const UPCOMING_CLUB_PRODUCT_ID = "mock-dashboard-fortnite-club";
const EVENT_PRODUCT_ID = "mock-dashboard-lan-event";
const ENDED_CLUB_PRODUCT_ID = "mock-dashboard-splatoon-club";

/**
 * The site the one-day event runs at.
 *
 * Authored rather than derived, because this card has no product-page scene
 * behind it to read one off — and an in-person card without a site would leave
 * the footer zone this redesign exists to fill standing empty, which is the one
 * thing the card must never do.
 */
const EVENT_SITE_NAME = "Kaapelitehdas, Helsinki";

/**
 * Which product-page scene each dashboard card opens. The feeds behind these
 * scenes are also where the badge counts come from — so these two assignments
 * are the two product-page scenarios, and clicking either lands on the very feed
 * its badge was counted out of.
 *
 * The other two cards are on the page to show card *states*, not to be clicked
 * through: they have no feed of their own, so their hrefs fall back to inert and
 * their badges to zero rather than inventing a third and fourth fixture feed
 * nobody would ever read.
 */
const SCENE_BY_PRODUCT: Record<string, GroupWorkspaceScenario> = {
  [MINECRAFT_PRODUCT_ID]: "club",
  [CAMP_PRODUCT_ID]: "camp",
};

export function buildGeduDashboardFixture(
  now: Date,
  scenario: GeduDashboardScenario,
  locale: SupportedLocale,
  /** Viewer's IANA zone — the cadence line renders in it, like every time. */
  timeZone: string,
): GeduDashboardFixture {
  const { attention: sceneAttention, siteNames: sceneSiteNames } =
    sceneBackedFacts(now);

  const clubRows: GeduAssignmentRow[] = [
    assignmentRow({
      now,
      id: MINECRAFT_PRODUCT_ID,
      name: "Minecraft Monday Club",
      productType: "consumer_club",
      isRemote: true,
      // Anchored to `now` rather than to a fixed Monday evening: the open Join
      // state is the one thing on this card that cannot be seen on demand — it
      // is true for a couple of hours a week — so the club that owns the room
      // is always mid-session when the scene is opened. Its cadence line then
      // reads as whatever weekday you happen to look on, which is the honest
      // consequence and costs less than a Join button nobody can ever see lit.
      slots: [liveNowSlot(now, 90, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 84,
      endsInDays: null,
      groupCount: 3,
      participantCount: 21,
      groupName: "Monday A",
      groupParticipantCount: 8,
    }),
    assignmentRow({
      now,
      id: UPCOMING_CLUB_PRODUCT_ID,
      name: "Fortnite Creative Club",
      productType: "consumer_club",
      // Remote and *not* running: the locked "Opens …" Join, which is what a
      // gedu sees on six days out of seven and which the live card above can
      // never show at the same time.
      isRemote: true,
      slots: [futureSlot(now, 3, "17:00", 90, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 35,
      endsInDays: null,
      groupCount: 2,
      participantCount: 14,
      groupName: "Thursday B",
      groupParticipantCount: 7,
    }),
  ];

  /**
   * Five more clubs, on the `clubs-only` scenario only.
   *
   * They exist to fill the grid — seven cards wrap onto a second row at three
   * columns and a fourth at two — so they are deliberately unalike: different
   * days, different clock faces, different group sizes, and a couple of them
   * carrying a backlog. Seven copies of one card would show that the grid lays
   * out, and nothing about how it copes with what a real gedu's week looks like.
   *
   * None is scene-backed, so none links anywhere and their backlog counts are
   * authored rather than counted out of a feed.
   */
  const extraClubRows: GeduAssignmentRow[] = [
    assignmentRow({
      now,
      id: "mock-dashboard-roblox-club",
      name: "Roblox Studio Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [futureSlot(now, 1, "15:00", 90, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 21,
      endsInDays: null,
      groupCount: 2,
      participantCount: 15,
      groupName: "Tuesday A",
      groupParticipantCount: 8,
    }),
    assignmentRow({
      now,
      id: "mock-dashboard-rocket-league-club",
      name: "Rocket League Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [futureSlot(now, 2, "17:30", 60, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 63,
      endsInDays: null,
      groupCount: 4,
      participantCount: 28,
      groupName: "Wednesday C",
      groupParticipantCount: 6,
    }),
    assignmentRow({
      now,
      id: "mock-dashboard-stardew-club",
      name: "Stardew Valley Co-op Club",
      productType: "municipality_club",
      isRemote: true,
      slots: [futureSlot(now, 4, "16:00", 90, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 14,
      endsInDays: null,
      groupCount: 1,
      participantCount: 6,
      groupName: "Friday A",
      groupParticipantCount: 6,
    }),
    assignmentRow({
      now,
      id: "mock-dashboard-terraria-club",
      name: "Terraria Builders Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [futureSlot(now, 5, "13:00", 120, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 112,
      endsInDays: null,
      groupCount: 2,
      participantCount: 13,
      groupName: "Saturday B",
      groupParticipantCount: 7,
    }),
    assignmentRow({
      now,
      id: "mock-dashboard-sims-club",
      name: "Sims Storytellers Club",
      productType: "municipality_club",
      isRemote: true,
      slots: [futureSlot(now, 6, "18:00", 90, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 42,
      endsInDays: null,
      groupCount: 3,
      participantCount: 19,
      groupName: "Sunday A",
      groupParticipantCount: 9,
    }),
  ];

  /**
   * Last term's club, finished six weeks ago and still owing three write-ups.
   *
   * **Remote on purpose.** An ended in-person product would have swapped one
   * footer line for another and proved little; a remote one is the card that
   * used to have *nothing* in its footer at all — a schedule run out, no room to
   * join, no building to name — and it is exactly the card the "No session
   * scheduled" line was libelling as a scheduling fault. It is also the pairing
   * that matters for the badge: three sessions still owed on a run nobody is
   * going back to, on the one card whose text is otherwise muted, so the badge
   * is visibly the thing that did *not* fade.
   *
   * The slot is authored rather than derived from `now` — a run that finished
   * has a weekday it *ran* on, and deriving one from today would make last
   * term's cadence line follow the day the scene happens to be opened. The
   * dates stay relative to `now` for the opposite reason: "ended" is a fact
   * about the present, and a hardcoded last day would quietly stop being past.
   */
  const endedRows: GeduAssignmentRow[] = [
    assignmentRow({
      now,
      id: ENDED_CLUB_PRODUCT_ID,
      name: "Splatoon Squid Club",
      productType: "consumer_club",
      isRemote: true,
      slots: [{ weekday: 3, startTime: "17:00", durationMinutes: 90 }],
      startedDaysAgo: 160,
      endsInDays: -46,
      groupCount: 2,
      participantCount: 16,
      groupName: "Thursday A",
      groupParticipantCount: 8,
    }),
  ];

  const otherRows: GeduAssignmentRow[] = [
    assignmentRow({
      now,
      id: CAMP_PRODUCT_ID,
      name: "Roblox Builders Camp",
      productType: "camp",
      // In person: no room to join at all, so this card renders **no** Join
      // beside the club's open one. That pairing is the point — the two
      // in-person and remote shapes side by side on one screen, so it is
      // obvious the camp card is missing a button by design rather than
      // showing a locked one that will never open.
      isRemote: false,
      slots: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 180,
      })),
      startedDaysAgo: 9,
      endsInDays: 6,
      groupCount: 3,
      participantCount: 23,
      groupName: "Builders red",
      groupParticipantCount: 8,
      // Read off the product-page scene this card opens, so the site on the
      // card and the site in that page's site-notes panel are one string.
      siteName: sceneSiteNames[CAMP_PRODUCT_ID] ?? null,
    }),
    assignmentRow({
      now,
      id: EVENT_PRODUCT_ID,
      name: "Winter LAN Afternoon",
      productType: "event",
      // In person **and** running right now — the pairing that matters. It
      // wears the Live badge and renders no Join, and its footer holds the
      // site instead, so it sits at the same height as the remote card that
      // does render one without either of them reserving empty space.
      isRemote: false,
      slots: [liveNowSlot(now, 240, SESSION_FEED_TIMEZONE)],
      startedDaysAgo: 0,
      endsInDays: 0,
      groupCount: 2,
      participantCount: 18,
      groupName: "Reds",
      groupParticipantCount: 9,
      siteName: EVENT_SITE_NAME,
    }),
  ];

  // An uncertified gedu has nothing assigned — certification is the gate on
  // group assignment — so the scenario that shows the awaiting-approval notice
  // is also the one that shows the empty state, and no card is built for it.
  const rows =
    scenario === "uncertified"
      ? []
      : scenario === "clubs-only"
        ? [...clubRows, ...extraClubRows]
        : [...clubRows, ...endedRows, ...otherRows];

  const assignments = rollUpGeduAssignments({
    rows,
    now,
    locale,
    attentionByProductId: { ...sceneAttention, ...AUTHORED_ATTENTION },
    hrefByProductId: Object.fromEntries(
      Object.entries(SCENE_BY_PRODUCT).map(([productId, sceneScenario]) => [
        productId,
        previewSceneHref("gedu-product", sceneScenario),
      ]),
    ),
    // Left empty on purpose: a preview has no room to join, so every Join
    // button collapses to its inert form while still rendering its real
    // open/locked state.
    voiceHrefByProductId: {},
  });

  const rowsById = new Map(rows.map((row) => [row.product.id, row]));

  return {
    assignments: assignments.map((assignment) => {
      const row = rowsById.get(assignment.productId);
      return {
        assignment,
        scheduleLines:
          row === undefined
            ? []
            : scheduleCardLines(
                formatProductSchedule({
                  product: {
                    product_type: row.product.productType,
                    start_date: row.product.startDate,
                    end_date: row.product.endDate,
                    timezone: row.product.timezone,
                    schedule_slots: row.slots.map((slot) => ({
                      weekday: slot.weekday,
                      start_time: slot.startTime,
                      duration_minutes: slot.durationMinutes,
                    })),
                  },
                  locale,
                  timeZone,
                  now,
                }),
              ),
      };
    }),
    certified: scenario !== "uncertified",
    /**
     * **One band per scenario, and the three scenarios cover all three
     * answers.**
     *
     * The body shows at most one next-step band, so the two of them and the
     * absence of both cannot share a render and each needs a scenario of its
     * own. `default` carries the *contract* band, because the interesting
     * composition is a band sitting above a full page — what is being judged is
     * whether it reads as unmissable without burying the work under it.
     * `uncertified` carries the *record check* band: an account that has signed
     * the terms and is waiting on an admin is exactly where presenting an
     * extract is the outstanding step, and it puts the band on the empty page
     * so both widths of it are visible somewhere. `clubs-only` is the page with
     * neither, which puts the no-band composition on the scenario whose own
     * subject is the grid.
     */
    contractAccepted: scenario !== "default",
    criminalRecordCheckPassed: scenario === "clubs-only",
  };
}

/**
 * Backlog counts for the cards with no feed behind them.
 *
 * Two of the grid-filling clubs get one, and no more: a scenario where every
 * card wears a badge says as little about the badge as one where none does, and
 * the point of the seven-card grid is that the row is *uneven*.
 *
 * The ended club gets one for the opposite reason — it is the whole argument
 * for keeping the badge on a finished run. Neither half expires when a term
 * does: the register is still the record of who was there, and a family reads
 * last term's write-up as readily as last week's. On the one card whose own text
 * is muted the badge has to still be the loudest thing on it.
 */
const AUTHORED_ATTENTION: Readonly<Record<string, number>> = {
  "mock-dashboard-rocket-league-club": 2,
  "mock-dashboard-terraria-club": 5,
  [ENDED_CLUB_PRODUCT_ID]: 3,
};

/**
 * The two facts a scene-backed card must not be able to disagree with its own
 * page about: how many sessions it owes, and which building it runs in.
 *
 * Both are read straight out of the fixture the linked product page renders.
 * The count is taken against that feed's own roster, because "outstanding"
 * means "this owed session is missing its register or its report" — a session
 * with three of eight marked counts, and so does one marked off to the last
 * child with nothing written for the families, exactly as the card behind it
 * says they do. The site name is whatever the site-notes panel on that page is
 * titled with, and is `null` for a remote product, which has no building at all.
 */
function sceneBackedFacts(now: Date): {
  attention: Record<string, number>;
  siteNames: Record<string, string | null>;
} {
  const attention: Record<string, number> = {};
  const siteNames: Record<string, string | null> = {};
  for (const [productId, scenario] of Object.entries(SCENE_BY_PRODUCT)) {
    const { entries, feedRoster, site } = buildGroupWorkspaceFixture(
      now,
      scenario,
    );
    attention[productId] = countEntriesNeedingAttention(entries, feedRoster);
    siteNames[productId] = site?.name ?? null;
  }
  return { attention, siteNames };
}

function assignmentRow(opts: {
  now: Date;
  id: string;
  name: string;
  productType: GeduAssignmentRow["product"]["productType"];
  isRemote: boolean;
  slots: GeduAssignmentRow["slots"];
  startedDaysAgo: number;
  /**
   * Days after `now` the product ends, or `null` for an ongoing club. Negative
   * puts the last day in the past, which is what makes a card an ended one.
   */
  endsInDays: number | null;
  groupCount: number;
  participantCount: number;
  groupName: string;
  groupParticipantCount: number;
  /** The site, on in-person products. Remote products have no building. */
  siteName?: string | null;
}): GeduAssignmentRow {
  return {
    product: {
      id: opts.id,
      timezone: SESSION_FEED_TIMEZONE,
      startDate: calendarDate(opts.now, -opts.startedDaysAgo, SESSION_FEED_TIMEZONE),
      endDate:
        opts.endsInDays === null
          ? null
          : calendarDate(opts.now, opts.endsInDays, SESSION_FEED_TIMEZONE),
      isRemote: opts.isRemote,
      productType: opts.productType,
      translations: [{ locale: "en", name: opts.name, description: "" }],
    },
    groupId: `${opts.id}-group-a`,
    groupCount: opts.groupCount,
    participantCount: opts.participantCount,
    groupName: opts.groupName,
    groupParticipantCount: opts.groupParticipantCount,
    siteName: opts.siteName ?? null,
    slots: opts.slots,
  };
}
