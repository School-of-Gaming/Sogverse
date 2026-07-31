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
 * running one remote club and one in-person camp, computed from a `now` the
 * caller supplies.
 *
 * Nothing here is hand-written narrative. Assignment rows go through the same
 * roll-up adapter the live dashboard will use, and the recurring-schedule line
 * comes from the same product-schedule formatter the public browse cards use, so
 * the preview shows the real derivations (next occurrence including an
 * in-progress one, cadence in the viewer's zone) rather than a plausible
 * imitation of them. Only two fields are rewritten afterwards, and both because
 * a preview must not lead anywhere live: the Join button is made inert and every
 * card points at the matching product-page *scene*, so clicking through lands on
 * the feed the badge is talking about.
 *
 * **The badge counts are derived, not authored.** Each assignment's
 * needs-attention number is counted out of the very feed its card links to, so a
 * card can never advertise a number the page behind it disagrees with.
 */

/**
 * **Two scenarios.** `default` is the working dashboard and carries everything
 * that can coexist on one: two assignments, one behind on write-ups and one
 * clear, one of them live *right now* so the open Join state is on screen
 * without anyone having to wait for a Monday. `unverified` is the only genuinely
 * exclusive variant — an account an admin has not approved yet, which swaps the
 * instant-room panel for a notice and cannot be true at the same time as the
 * panel being usable.
 *
 * There was a third, `all-clear`, showing zero outstanding badges. That state
 * lives inside `default` now, on the camp card: a scenario per badge value is a
 * scenario that will rot the first time the badge changes shape.
 */
export const GEDU_DASHBOARD_SCENARIOS = ["default", "unverified"] as const;

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

/**
 * Which product-page scene each dashboard card opens. The feeds behind these
 * scenes are also where the badge counts come from — so the two assignments are
 * the two product-page scenarios, and clicking a card lands on the very feed
 * its badge was counted out of.
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
  const rows: GeduAssignmentRow[] = [
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
  ];

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
 * Count each product's outstanding sessions straight out of the feed its card
 * links to. Derived rather than authored so the two scenes can't drift.
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
 * assignment's voice window is open the moment the scene is opened.
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
