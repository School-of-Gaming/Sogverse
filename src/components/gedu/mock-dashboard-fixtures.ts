import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { previewSceneHref } from "@/components/preview/href";
import { countEntriesNeedingAttention } from "@/components/gedu/session-feed";
import { SESSION_FEED_TIMEZONE } from "@/components/gedu/session-feed/mock-fixtures";
import {
  buildGeduProductPageFixture,
  type GeduProductScenario,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import type { GeduAssignmentCardData } from "@/components/gedu/GeduAssignmentsSectionView";
import {
  formatProductSchedule,
  scheduleCardLines,
} from "@/components/public/products/format-product-schedule";
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
 * **The badge counts are derived, not authored.** Each scene-backed assignment's
 * needs-attention number is counted out of the very feed its card links to, so a
 * card can never advertise a number the page behind it disagrees with. The two
 * demonstration cards have no feed behind them and carry none.
 */

/**
 * **Three scenarios.**
 *
 * `default` is the working dashboard and carries everything that can coexist on
 * one: all three type nouns, and the four card shapes that between them cover
 * every state a card can be in —
 *
 * 1. a **remote club, live right now**, with its Join lit;
 * 2. a **remote club later this week**, with the same Join in its locked form;
 * 3. an **in-person camp owing a write-up**, carrying the attention badge and no
 *    Join at all;
 * 4. an **in-person event running right now**, which is the pairing that matters
 *    — "session in progress" with no Join beside it, proving the reserved
 *    footer zone holds the card's height open whether or not a button lands in
 *    it.
 *
 * `clubs-only` is the single-noun composition: the same two clubs, one heading,
 * one pill entry. It exists because "only non-empty types render" is a rule
 * whose failure mode is invisible on a gedu who happens to run all three, and
 * most gedus run clubs and nothing else.
 *
 * `unverified` is the account an admin has not approved yet, which swaps the
 * instant-room panel for a notice and cannot be true at the same time as the
 * panel being usable.
 */
export const GEDU_DASHBOARD_SCENARIOS = [
  "default",
  "clubs-only",
  "unverified",
] as const;

export type GeduDashboardScenario = (typeof GEDU_DASHBOARD_SCENARIOS)[number];

export function isGeduDashboardScenario(s: string): s is GeduDashboardScenario {
  return (GEDU_DASHBOARD_SCENARIOS as readonly string[]).includes(s);
}

export interface GeduDashboardFixture {
  /** One roll-up card per assignment, soonest next session first. */
  assignments: GeduAssignmentCardData[];
  verified: boolean;
}

const MINECRAFT_PRODUCT_ID = "mock-dashboard-minecraft-club";
const CAMP_PRODUCT_ID = "mock-dashboard-roblox-camp";
const UPCOMING_CLUB_PRODUCT_ID = "mock-dashboard-fortnite-club";
const EVENT_PRODUCT_ID = "mock-dashboard-lan-event";

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
const SCENE_BY_PRODUCT: Record<string, GeduProductScenario> = {
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
      slots: [liveNowSlot(now, 90)],
      startedDaysAgo: 84,
      endsInDays: null,
      groupCount: 3,
      gamerCount: 21,
      groupName: "Monday A",
      groupGamerCount: 8,
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
      slots: [futureSlot(now, 3, "17:00", 90)],
      startedDaysAgo: 35,
      endsInDays: null,
      groupCount: 2,
      gamerCount: 14,
      groupName: "Thursday B",
      groupGamerCount: 7,
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
      gamerCount: 23,
      groupName: "Builders red",
      groupGamerCount: 8,
    }),
    assignmentRow({
      now,
      id: EVENT_PRODUCT_ID,
      name: "Winter LAN Afternoon",
      productType: "event",
      // In person **and** running right now — the card that proves the reserved
      // footer holds. It says "session in progress" and renders no Join, so it
      // sits at exactly the same height as the remote card two columns over
      // that does render one.
      isRemote: false,
      slots: [liveNowSlot(now, 240)],
      startedDaysAgo: 0,
      endsInDays: 0,
      groupCount: 2,
      gamerCount: 18,
      groupName: "Reds",
      groupGamerCount: 9,
    }),
  ];

  const rows =
    scenario === "clubs-only" ? clubRows : [...clubRows, ...otherRows];

  const assignments = rollUpGeduAssignments({
    rows,
    now,
    locale,
    attentionByProductId: outstandingByProduct(now),
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
    verified: scenario !== "unverified",
  };
}

/**
 * Count each scene-backed product's outstanding sessions straight out of the
 * feed its card links to. Derived rather than authored so the two scenes can't
 * drift.
 *
 * The count is taken against that feed's own roster, because "outstanding" now
 * means "some of this group is still unmarked" — a session with three of eight
 * marked counts, exactly as the card behind it says it does.
 */
function outstandingByProduct(now: Date): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [productId, scenario] of Object.entries(SCENE_BY_PRODUCT)) {
    const { entries, feedRoster } = buildGeduProductPageFixture(now, scenario);
    counts[productId] = countEntriesNeedingAttention(entries, feedRoster);
  }
  return counts;
}

function assignmentRow(opts: {
  now: Date;
  id: string;
  name: string;
  productType: GeduAssignmentRow["product"]["productType"];
  isRemote: boolean;
  slots: GeduAssignmentRow["slots"];
  startedDaysAgo: number;
  /** Days after `now` the product ends, or `null` for an ongoing club. */
  endsInDays: number | null;
  groupCount: number;
  gamerCount: number;
  groupName: string;
  groupGamerCount: number;
}): GeduAssignmentRow {
  return {
    product: {
      id: opts.id,
      timezone: SESSION_FEED_TIMEZONE,
      startDate: calendarDate(opts.now, -opts.startedDaysAgo),
      endDate:
        opts.endsInDays === null ? null : calendarDate(opts.now, opts.endsInDays),
      padletUrl: null,
      isRemote: opts.isRemote,
      productType: opts.productType,
      translations: [{ locale: "en", name: opts.name, description: "" }],
    },
    groupId: `${opts.id}-group-a`,
    groupCount: opts.groupCount,
    gamerCount: opts.gamerCount,
    groupName: opts.groupName,
    groupGamerCount: opts.groupGamerCount,
    slots: opts.slots,
  };
}

/**
 * A weekly slot whose current occurrence started a few minutes ago, so the
 * assignment is mid-session the moment the scene is opened.
 *
 * The wall clock is read **in the product's own zone** and floored to a quarter
 * hour, because that is where a schedule slot lives: a slot is a weekday plus a
 * clock face in the product's timezone, not an instant, and deriving one from
 * the viewer's zone would put the session on the wrong day either side of
 * midnight. Flooring only ever moves the start earlier, so the session stays in
 * progress, and it keeps the cadence line reading like a real schedule
 * ("16:30–18:00") instead of an arbitrary minute.
 */
function liveNowSlot(
  now: Date,
  durationMinutes: number,
): GeduAssignmentRow["slots"][number] {
  const started = toZonedTime(
    new Date(now.getTime() - 25 * 60_000),
    SESSION_FEED_TIMEZONE,
  );
  started.setMinutes(Math.floor(started.getMinutes() / 15) * 15, 0, 0);
  return {
    // `getDay()` is 0 = Sunday; schedule slots are 0 = Monday.
    weekday: (started.getDay() + 6) % 7,
    startTime: `${pad2(started.getHours())}:${pad2(started.getMinutes())}`,
    durationMinutes,
  };
}

/**
 * A weekly slot a few days out, at a fixed clock face — the ordinary case, where
 * the next session is a date to read rather than a room to walk into.
 *
 * The weekday is derived in the product's zone for the same reason the live slot
 * is: a slot is a weekday there, not an offset from the viewer's today.
 */
function futureSlot(
  now: Date,
  daysAhead: number,
  startTime: string,
  durationMinutes: number,
): GeduAssignmentRow["slots"][number] {
  const target = toZonedTime(now, SESSION_FEED_TIMEZONE);
  target.setDate(target.getDate() + daysAhead);
  return {
    weekday: (target.getDay() + 6) % 7,
    startTime,
    durationMinutes,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A bare `YYYY-MM-DD` offset from today. A product's start date is a zoneless
 * calendar date, so it is pinned to UTC rather than re-anchored to a viewer.
 */
function calendarDate(now: Date, dayOffset: number): string {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return formatInTimeZone(date, "UTC", "yyyy-MM-dd");
}
