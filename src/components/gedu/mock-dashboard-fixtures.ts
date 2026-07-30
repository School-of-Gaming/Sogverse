import { formatInTimeZone } from "date-fns-tz";
import { previewSceneHref } from "@/components/preview/href";
import { countEntriesNeedingAttention } from "@/components/gedu/session-feed";
import { SESSION_FEED_TIMEZONE } from "@/components/gedu/session-feed/mock-fixtures";
import {
  buildGeduProductPageFixture,
  type GeduProductScenario,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import {
  expandAssignedSessionsToCards,
  type GroupSessionItem,
} from "@/lib/assigned-sessions";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { MyAssignedProductSessionRow } from "@/services/assignments";

/**
 * Fixtures for the gedu dashboard preview scene — a plausible week for a gedu
 * running two Monday clubs, computed from a `now` the caller supplies.
 *
 * The occurrence list is not hand-written: assignment rows go through the same
 * `expandAssignedSessionsToCards` the live dashboard uses, so the preview shows
 * the real expansion (per-slot occurrences, the eight-week cap on open-ended
 * clubs, the soonest item taking the prominent card) rather than a plausible
 * imitation of it. Only two fields are rewritten afterwards, and both because a
 * preview must not lead anywhere live: the Join button is made inert and every
 * card points at the matching product-page *scene*, so clicking through lands
 * on the feed the badge is talking about.
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
  sessions: GroupSessionItem[];
  /** Outstanding write-ups per product — the aggregate badge on each card. */
  attentionByProductId: Record<string, number>;
  verified: boolean;
}

const MINECRAFT_PRODUCT_ID = "mock-dashboard-minecraft-club";
const TERRARIA_PRODUCT_ID = "mock-dashboard-terraria-club";

/**
 * Which product-page scene each dashboard card opens. The two feeds behind
 * these scenes are also where the badge counts come from, so a card can never
 * advertise a number the page it links to disagrees with.
 */
const SCENE_BY_PRODUCT: Record<string, GeduProductScenario> = {
  [MINECRAFT_PRODUCT_ID]: "club-midterm",
  [TERRARIA_PRODUCT_ID]: "first-week",
};

export function buildGeduDashboardFixture(
  now: Date,
  scenario: GeduDashboardScenario,
  locale: SupportedLocale,
): GeduDashboardFixture {
  const rows: MyAssignedProductSessionRow[] = [
    assignmentRow({
      now,
      id: MINECRAFT_PRODUCT_ID,
      name: "Minecraft Monday Club",
      startTime: "16:30",
      durationMinutes: 90,
      startedDaysAgo: 84,
      groupCount: 3,
      gamerCount: 21,
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
    }),
  ];

  const sessions = expandAssignedSessionsToCards(rows, now, locale).map(
    (item) => ({
      ...item,
      // A preview has no room to join and no live product page to open.
      voiceHref: "#",
      openGroupHref: previewSceneHref(
        "gedu-product",
        SCENE_BY_PRODUCT[item.productId],
      ),
    }),
  );

  return {
    sessions,
    attentionByProductId:
      scenario === "all-clear" ? {} : outstandingByProduct(now),
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
}): MyAssignedProductSessionRow {
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
