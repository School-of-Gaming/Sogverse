import { formatInTimeZone } from "date-fns-tz";
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
 * running two Monday clubs, computed from a `now` the caller supplies.
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
 * card can never advertise a number the page behind it disagrees with. Substitute
 * requests are deliberately excluded: they are a message to admins, not work the
 * gedu owes, and folding them in would make one number mean two things.
 */

export const GEDU_DASHBOARD_SCENARIOS = [
  "default",
  "all-clear",
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
const TERRARIA_PRODUCT_ID = "mock-dashboard-terraria-club";

/**
 * Which product-page scene each dashboard card opens. The feeds behind these
 * scenes are also where the badge counts come from.
 */
const SCENE_BY_PRODUCT: Record<string, GeduProductScenario> = {
  [MINECRAFT_PRODUCT_ID]: "club-midterm",
  [TERRARIA_PRODUCT_ID]: "first-week",
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
      startTime: "16:30",
      durationMinutes: 90,
      startedDaysAgo: 84,
      groupCount: 3,
      gamerCount: 21,
      groupName: "Monday A",
      groupGamerCount: 8,
    }),
    assignmentRow({
      now,
      id: TERRARIA_PRODUCT_ID,
      name: "Terraria Starter Club",
      startTime: "18:15",
      durationMinutes: 90,
      startedDaysAgo: 9,
      groupCount: 2,
      gamerCount: 13,
      groupName: "Tuesday A",
      groupGamerCount: 6,
    }),
  ];

  const assignments = rollUpGeduAssignments({
    rows,
    now,
    locale,
    attentionByProductId:
      scenario === "all-clear" ? {} : outstandingByProduct(now),
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
 * Count each product's outstanding write-ups straight out of the feed its card
 * links to. Derived rather than authored so the two scenes can't drift.
 */
function outstandingByProduct(now: Date): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [productId, scenario] of Object.entries(SCENE_BY_PRODUCT)) {
    counts[productId] = countEntriesNeedingAttention(
      buildGeduProductPageFixture(now, scenario).entries,
    );
  }
  return counts;
}

function assignmentRow(opts: {
  now: Date;
  id: string;
  name: string;
  startTime: string;
  durationMinutes: number;
  startedDaysAgo: number;
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
      endDate: null,
      padletUrl: null,
      isRemote: true,
      productType: "consumer_club",
      translations: [{ locale: "en", name: opts.name, description: "" }],
    },
    groupId: `${opts.id}-group-a`,
    groupCount: opts.groupCount,
    gamerCount: opts.gamerCount,
    groupName: opts.groupName,
    groupGamerCount: opts.groupGamerCount,
    // 0 = Monday. Both clubs run the same evening, back to back.
    slots: [
      {
        weekday: 0,
        startTime: opts.startTime,
        durationMinutes: opts.durationMinutes,
      },
    ],
  };
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
