import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { calendarDate, futureSlot } from "@/components/preview/fixture-clock";
import { SESSION_FEED_TIMEZONE } from "@/components/gedu/session-feed/mock-fixtures";
import type { SupportedLocale } from "@/lib/constants/locales";
import type {
  GeduAssignmentRow,
  GeduSubstitutionSummary,
} from "@/lib/gedu-assignment-rollup";
import {
  buildSubstitutionPoolRows,
  type SubstitutionPoolRow,
} from "@/lib/gedu-substitution-pool";
import {
  buildGeduUpcomingSessions,
  type GeduUpcomingSession,
} from "@/lib/gedu-upcoming-sessions";
import type { OpenSubstitutionRequest } from "@/services/session-substitution";
import { buildGeduDashboardFixture } from "./mock-dashboard-fixtures";

/**
 * Fixtures for the **Substitutions** page scene: the open queue a certified
 * gedu picks from, and the substitutions they have already taken.
 *
 * The open rows are **wire-shaped and run through the real derivation**, so the
 * weekday arithmetic that turns a bare date into a clock face in the viewer's
 * zone — and the ordering that puts the soonest first — are the code under
 * review rather than something a fixture asserted for them.
 *
 * The accepted half is borrowed whole from the dashboard fixture, because they
 * are the same two cards: a substitution is on My SOG and on this page, and a
 * second hand-written pair would be two fixtures drifting apart about one
 * component.
 */

/**
 * **Two scenarios, because the page has two states and they cannot share a
 * render.** `populated` is both sections with something in them — every way an
 * open card can differ, and both states a taken substitution has. `empty` is
 * the two all-clear lines, which a populated page structurally cannot show.
 *
 * There is deliberately no *uncertified* scenario: that page is the accepted
 * section alone with the queue withheld, which is a section this list already
 * shows in both its states.
 */
export const GEDU_SUBSTITUTIONS_SCENARIOS = ["populated", "empty"] as const;

export type GeduSubstitutionsScenario =
  (typeof GEDU_SUBSTITUTIONS_SCENARIOS)[number];

export function isGeduSubstitutionsScenario(
  s: string,
): s is GeduSubstitutionsScenario {
  return (GEDU_SUBSTITUTIONS_SCENARIOS as readonly string[]).includes(s);
}

export interface GeduSubstitutionsFixture {
  /** The open queue, already shaped and ordered by the real derivation. */
  pool: SubstitutionPoolRow[];
  /** What this gedu is standing in for, soonest first. */
  substitutions: GeduSubstitutionSummary[];
  /**
   * The viewer's **own** upcoming sessions — what the "Can't make a session?"
   * picker is a list of.
   *
   * Expanded from the seats below by the live helper, so the scene shows the
   * real schedule walk — a term of five weekly clubs, one of them stopping at
   * its end date — rather than a hand-written list that could not be wrong.
   */
  upcomingSessions: GeduUpcomingSession[];
  /**
   * The one picker row that is already asked for, so the disabled state and
   * the pickable one are on screen together.
   */
  filedSessionKeys: string[];
}

export function buildGeduSubstitutionsFixture(
  now: Date,
  scenario: GeduSubstitutionsScenario,
  locale: SupportedLocale,
  /** Viewer's IANA zone — the cards render their times in it, like every time. */
  timeZone: string,
): GeduSubstitutionsFixture {
  const dashboard = buildGeduDashboardFixture(now, "default", locale, timeZone);
  const upcomingSessions = buildGeduUpcomingSessions({
    rows: pickerSeats(now),
    locale,
    now,
  });

  if (scenario === "empty") {
    // Nothing outstanding on either section — but the viewer still holds their
    // seats, so the way into filing an absence is on the page exactly as it is
    // when the queue is full. A page with no seats at all is the uncertified
    // one, which has no queue either and is therefore not a scenario here.
    return {
      pool: [],
      substitutions: [],
      upcomingSessions,
      filedSessionKeys: [],
    };
  }

  return {
    pool: buildSubstitutionPoolRows(openRequests(now), locale),
    // The dashboard's pair: one substitution whose workspace has opened and one
    // still locked, which is the whole of what a taken substitution can look
    // like.
    substitutions: dashboard.substitutions,
    upcomingSessions,
    // The second row, so the picker's two states sit next to each other. The
    // first is left pickable, because the scene's write has to be reachable.
    filedSessionKeys: upcomingSessions.slice(1, 2).map((s) => s.key),
  };
}

/**
 * The seats the picker is a list of — **a working gedu's week, at the size the
 * owner asked this list to survive**: five weekly clubs and a camp.
 *
 * The mix is what the forward rule is judged on. Three clubs are open-ended, so
 * each projects the app's next-eight and stops; one runs to an end date ten
 * days out and therefore contributes two rows and then nothing, which is the
 * case a horizon expressed in days would have got wrong; one runs to a date far
 * enough out that the cap never applies; and the camp's two weekend blocks put
 * two sessions in one week from one seat.
 *
 * Deliberately not the dashboard fixture's rows: that set is composed to show
 * every *card* state (an ended run, a substitution, a locked one), which is a
 * different question from what a term of weekly clubs does to a list.
 */
function pickerSeats(now: Date): GeduAssignmentRow[] {
  const slot = (daysAhead: number, startTime: string, minutes: number) => [
    futureSlot(now, daysAhead, startTime, minutes, SESSION_FEED_TIMEZONE),
  ];

  const seat = (opts: {
    id: string;
    name: string;
    group: string;
    slots: GeduAssignmentRow["slots"];
    endsInDays: number | null;
    isRemote: boolean;
    siteName?: string | null;
    productType?: GeduAssignmentRow["product"]["productType"];
  }): GeduAssignmentRow => ({
    product: {
      id: opts.id,
      timezone: SESSION_FEED_TIMEZONE,
      startDate: calendarDate(now, -40, SESSION_FEED_TIMEZONE),
      endDate:
        opts.endsInDays === null
          ? null
          : calendarDate(now, opts.endsInDays, SESSION_FEED_TIMEZONE),
      isRemote: opts.isRemote,
      productType: opts.productType ?? "consumer_club",
      translations: [{ locale: "en", name: opts.name, description: "" }],
    },
    groupId: `${opts.id}-group`,
    kind: "assignment",
    substitutionDate: null,
    groupCount: 2,
    participantCount: 9,
    groupName: opts.group,
    groupParticipantCount: 9,
    siteName: opts.siteName ?? null,
    slots: opts.slots,
  });

  return [
    seat({
      id: "mock-picker-monday",
      name: "Minecraft Redstone Club",
      group: "Redstone A",
      slots: slot(1, "16:30", 90),
      endsInDays: null,
      isRemote: true,
    }),
    seat({
      id: "mock-picker-tuesday",
      name: "Roblox Builders Club",
      group: "Builders B",
      slots: slot(2, "17:00", 90),
      endsInDays: null,
      isRemote: true,
    }),
    seat({
      id: "mock-picker-wednesday",
      name: "Fortnite Creative Club",
      group: "Creative C",
      // The run that stops early — its last session is inside a fortnight, so
      // its rows simply run out while the others go on.
      slots: slot(3, "16:00", 90),
      endsInDays: 10,
      isRemote: false,
      siteName: "Sello Library, Espoo",
    }),
    seat({
      id: "mock-picker-thursday",
      name: "Creator Studio Club",
      group: "Studio A",
      slots: slot(4, "15:30", 90),
      endsInDays: 80,
      isRemote: true,
    }),
    seat({
      id: "mock-picker-friday",
      name: "Minecraft Bedrock Club",
      group: "Bedrock D",
      slots: slot(5, "17:30", 90),
      endsInDays: null,
      isRemote: false,
      siteName: "Kaapelitehdas, Helsinki",
    }),
    seat({
      id: "mock-picker-camp",
      name: "Winter Build Camp",
      group: "Reds",
      productType: "camp",
      // Two blocks in one weekend, which is what puts two sessions from one
      // seat in a single week heading.
      slots: [
        ...slot(6, "10:00", 180),
        ...slot(7, "10:00", 180),
      ],
      endsInDays: 20,
      isRemote: false,
      siteName: "Sello Library, Espoo",
    }),
  ];
}

/**
 * The queue, as the RPC would hand it over — six open requests a certified gedu
 * could take, chosen so that every axis a card varies on is on one screen and
 * the urgency treatment has both sides of its boundary beside it.
 *
 * What they differ in is the whole point: a session **in a couple of hours** and
 * one **later today** (the two inside the day, where the card wears the warning
 * mark), one **tomorrow** and three further out (the quiet ones); remote and in
 * person, which are the two answers to "where"; a primary seat and an assistant
 * one; a fee set and a fee not set; and one the caller has **already offered**
 * on, which is the only way to see the button's offered state beside its offer
 * state.
 */
function openRequests(now: Date): OpenSubstitutionRequest[] {
  const weekly = (daysAhead: number, startTime: string, minutes: number) => {
    const built = futureSlot(
      now,
      daysAhead,
      startTime,
      minutes,
      SESSION_FEED_TIMEZONE,
    );
    return [
      {
        weekday: built.weekday,
        start_time: built.startTime,
        duration_minutes: built.durationMinutes,
      },
    ];
  };

  const soon = upcomingOccurrence(now, 150, 90);
  const laterToday = upcomingOccurrence(now, 20 * 60, 90);

  return [
    {
      request_id: "mock-pool-request-soon",
      group_id: "mock-pool-group-soon",
      group_name: "Tuesday B",
      session_date: soon.sessionDate,
      role: "primary",
      fee_cents: 6500,
      has_offered: false,
      product: {
        id: "mock-pool-product-soon",
        product_type: "consumer_club",
        topic: "minecraft_java",
        spoken_language_code: "fi",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: true,
        start_date: calendarDate(now, -60, SESSION_FEED_TIMEZONE),
        end_date: null,
        site_name: null,
        translations: [
          { locale: "en", name: "Minecraft Redstone Club", description: "" },
        ],
        schedule_slots: soon.slots,
      },
    },
    {
      request_id: "mock-pool-request-today",
      group_id: "mock-pool-group-today",
      group_name: "Greens",
      session_date: laterToday.sessionDate,
      role: "assistant",
      // Unset, which is the ordinary state of an assistant fee: the card simply
      // says nothing about money rather than flagging a gap nobody is expected
      // to close.
      fee_cents: null,
      has_offered: false,
      product: {
        id: "mock-pool-product-today",
        product_type: "camp",
        topic: "roblox_studio",
        spoken_language_code: "en",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: false,
        start_date: calendarDate(now, -2, SESSION_FEED_TIMEZONE),
        end_date: calendarDate(now, 5, SESSION_FEED_TIMEZONE),
        site_name: "Sello Library, Espoo",
        translations: [
          { locale: "en", name: "Roblox Studio Camp", description: "" },
        ],
        schedule_slots: laterToday.slots,
      },
    },
    {
      request_id: "mock-pool-request-tomorrow",
      group_id: "mock-pool-group-tomorrow",
      group_name: "Thursday A",
      session_date: calendarDate(now, 1, SESSION_FEED_TIMEZONE),
      role: "primary",
      fee_cents: 7500,
      // Already offered — the other resting state of the one control, which
      // cannot be seen on the same card as the offer state and has to be on a
      // card of its own.
      has_offered: true,
      product: {
        id: "mock-pool-product-tomorrow",
        product_type: "municipality_club",
        topic: "fortnite",
        spoken_language_code: "sv",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: true,
        start_date: calendarDate(now, -90, SESSION_FEED_TIMEZONE),
        end_date: null,
        site_name: null,
        translations: [
          { locale: "en", name: "Fortnite Creative Club", description: "" },
        ],
        schedule_slots: weekly(1, "16:30", 90),
      },
    },
    {
      request_id: "mock-pool-request-midweek",
      group_id: "mock-pool-group-midweek",
      group_name: "Builders blue",
      session_date: calendarDate(now, 3, SESSION_FEED_TIMEZONE),
      role: "primary",
      fee_cents: 7000,
      has_offered: false,
      product: {
        id: "mock-pool-product-midweek",
        product_type: "event",
        topic: "minecraft_bedrock",
        spoken_language_code: "fi",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: false,
        start_date: calendarDate(now, 3, SESSION_FEED_TIMEZONE),
        end_date: calendarDate(now, 3, SESSION_FEED_TIMEZONE),
        site_name: "Kaapelitehdas, Helsinki",
        translations: [
          { locale: "en", name: "Winter LAN Afternoon", description: "" },
        ],
        schedule_slots: weekly(3, "13:00", 240),
      },
    },
    {
      request_id: "mock-pool-request-next-week",
      group_id: "mock-pool-group-next-week",
      group_name: "Monday C",
      session_date: calendarDate(now, 7, SESSION_FEED_TIMEZONE),
      role: "assistant",
      fee_cents: 4500,
      has_offered: false,
      product: {
        id: "mock-pool-product-next-week",
        product_type: "consumer_club",
        topic: "creator_studio",
        spoken_language_code: "en",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: true,
        start_date: calendarDate(now, -120, SESSION_FEED_TIMEZONE),
        end_date: null,
        site_name: null,
        translations: [
          { locale: "en", name: "Creator Studio Club", description: "" },
        ],
        schedule_slots: weekly(7, "15:00", 90),
      },
    },
    {
      request_id: "mock-pool-request-far",
      group_id: "mock-pool-group-far",
      group_name: "Saturday A",
      session_date: calendarDate(now, 12, SESSION_FEED_TIMEZONE),
      role: "primary",
      fee_cents: 6500,
      has_offered: false,
      product: {
        id: "mock-pool-product-far",
        product_type: "consumer_club",
        topic: "fortnite",
        spoken_language_code: "sv",
        timezone: SESSION_FEED_TIMEZONE,
        is_remote: true,
        start_date: calendarDate(now, -30, SESSION_FEED_TIMEZONE),
        end_date: null,
        site_name: null,
        translations: [
          { locale: "en", name: "Fortnite Builders Club", description: "" },
        ],
        schedule_slots: weekly(12, "11:00", 120),
      },
    },
  ];
}

/**
 * A slot and the calendar date it falls on, a fixed number of minutes from now
 * **in the product's own zone**.
 *
 * The pair has to be derived together, because a fixture asking for a session
 * twenty hours out is asking for tomorrow when the scene is opened in the
 * afternoon and for today when it is opened at dawn — and a date that disagreed
 * with its slot's weekday would produce a request the occurrence lookup answers
 * `null` for, which is the orphaned state rather than the urgent one this is
 * here to show.
 *
 * Floored to a quarter hour so the clock face reads like a real schedule.
 * Flooring only moves the start earlier, by up to fourteen minutes, which is why
 * nothing here is placed closer to `now` than that.
 */
function upcomingOccurrence(
  now: Date,
  minutesAhead: number,
  durationMinutes: number,
): {
  sessionDate: string;
  slots: { weekday: number; start_time: string; duration_minutes: number }[];
} {
  const at = toZonedTime(
    new Date(now.getTime() + minutesAhead * 60_000),
    SESSION_FEED_TIMEZONE,
  );
  at.setMinutes(Math.floor(at.getMinutes() / 15) * 15, 0, 0);
  const instant = fromZonedTime(at, SESSION_FEED_TIMEZONE);
  return {
    sessionDate: formatInTimeZone(
      instant,
      SESSION_FEED_TIMEZONE,
      "yyyy-MM-dd",
    ),
    slots: [
      {
        // `getDay()` is 0 = Sunday; schedule slots are 0 = Monday.
        weekday: (at.getDay() + 6) % 7,
        start_time: `${pad2(at.getHours())}:${pad2(at.getMinutes())}`,
        duration_minutes: durationMinutes,
      },
    ],
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
