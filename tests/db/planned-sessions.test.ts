import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { plannedSessionRows, trimOpenEndedFuture } from "@/lib/planned-sessions";
import {
  endDateToCutoff,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
  MAX_PAST_OCCURRENCES_PER_SLOT,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
  type SlotShape,
} from "@/lib/session-occurrence";
import {
  callServiceRoleRpcRaw,
  createAdminTestClient,
  createAnonTestClient,
} from "./helpers";
import { TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
  type ProductOptions,
} from "./product-helpers";

/**
 * The session plan: `planned_session_dates`, `planned_group_sessions`, the
 * horizon and final-session helpers built on them, and the guard that keeps the
 * plan expanded in one place.
 *
 * Every dated fixture sits in 2030, so the plan's answers do not depend on when
 * this runs; only the horizon cases and one live parity case read "today", and
 * each holds on either side of a midnight the run might cross.
 */

const TERM = "00000000-0000-0000-0000-000000000850";
const CAMP = "00000000-0000-0000-0000-000000000851";
const OPEN = "00000000-0000-0000-0000-000000000852";
const HELSINKI = "00000000-0000-0000-0000-000000000853";
const AUCKLAND = "00000000-0000-0000-0000-000000000854";
const CANCELLING = "00000000-0000-0000-0000-000000000855";
const GROUP_ONE = "00000000-0000-0000-0000-000000000856";
const GROUP_TWO = "00000000-0000-0000-0000-000000000857";
const HORIZON = "00000000-0000-0000-0000-000000000858";
const GROUP_HORIZON = "00000000-0000-0000-0000-000000000859";
const CROSS_HELSINKI = "00000000-0000-0000-0000-00000000085a";
const CROSS_AUCKLAND = "00000000-0000-0000-0000-00000000085b";
const CROSS_LOS_ANGELES = "00000000-0000-0000-0000-00000000085c";
const LATE_START = "00000000-0000-0000-0000-00000000085d";
const LIVE = "00000000-0000-0000-0000-00000000085e";

const ALL_PRODUCTS = [
  TERM,
  CAMP,
  OPEN,
  HELSINKI,
  AUCKLAND,
  CANCELLING,
  HORIZON,
  CROSS_HELSINKI,
  CROSS_AUCKLAND,
  CROSS_LOS_ANGELES,
  LATE_START,
  LIVE,
];

const plannedGroupRows = z.array(
  z.object({
    session_date: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    cancelled_group_ids: z.array(z.string()),
  }),
);

const functionBodies = z.array(
  z.object({ function_name: z.string(), body: z.string() }),
);

/** A UTC calendar date `offset` days from now, UTC-pinned end to end. */
function utcDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  )
    .toISOString()
    .slice(0, 10);
}

/** `date` stepped by `days`, UTC-pinned. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Instants as the database renders them, normalised for comparison. */
function iso(value: string): string {
  return new Date(value).toISOString();
}

describe("the session plan", () => {
  let admin: SupabaseClient<Database>;

  /** One product with its slots. */
  async function seed(
    id: string,
    options: ProductOptions,
    slots: SlotShape[],
  ): Promise<void> {
    await createTestProduct(admin, { id, ...options });
    for (const slot of slots) {
      await createScheduleSlot(admin, id, {
        weekday: slot.weekday,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes,
      });
    }
  }

  async function plan(product: string, from: string, to: string) {
    const { data, error } = await admin.rpc("planned_session_dates", {
      p_product_id: product,
      p_from: from,
      p_to: to,
    });
    expect(error).toBeNull();
    return (data ?? []).map((row) => ({
      session_date: row.session_date,
      starts_at: iso(row.starts_at),
      ends_at: iso(row.ends_at),
    }));
  }

  async function planDates(product: string, from: string, to: string) {
    return (await plan(product, from, to)).map((row) => row.session_date);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, ALL_PRODUCTS);

    // Mondays 7, 14 and 21 January 2030, at 10:00 UTC.
    await seed(
      TERM,
      { timezone: "UTC", startDate: "2030-01-07", endDate: "2030-01-21" },
      [{ weekday: 0, startTime: "10:00", durationMinutes: 60 }],
    );

    // A camp's week, every weekday at its own hour, so a session landing on
    // the wrong date also lands at the wrong time.
    await seed(
      CAMP,
      {
        productType: "camp",
        timezone: "UTC",
        startDate: "2030-06-03",
        endDate: "2030-06-07",
      },
      [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        startTime: `${String(9 + weekday).padStart(2, "0")}:00`,
        durationMinutes: 120,
      })),
    );

    // Open-ended, every day of the week: the densest plan there is.
    await seed(
      OPEN,
      { timezone: "UTC", startDate: "2030-01-07", endDate: null },
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 60,
      })),
    );

    // Helsinki springs forward at 03:00 on Sunday 31 March 2030. The Saturday
    // slot starts at 23:00 and runs five hours, across midnight and across the
    // transition.
    await seed(
      HELSINKI,
      { timezone: "Europe/Helsinki", startDate: "2030-03-23", endDate: "2030-04-06" },
      [
        { weekday: 5, startTime: "23:00", durationMinutes: 300 },
        { weekday: 6, startTime: "10:00", durationMinutes: 60 },
      ],
    );

    // Auckland falls back at 03:00 on Sunday 7 April 2030.
    await seed(
      AUCKLAND,
      { timezone: "Pacific/Auckland", startDate: "2030-03-24", endDate: "2030-04-14" },
      [{ weekday: 6, startTime: "10:00", durationMinutes: 60 }],
    );

    // Mondays 4, 11, 18 and 25 February 2030, with two groups.
    await seed(
      CANCELLING,
      { timezone: "UTC", startDate: "2030-02-04", endDate: "2030-02-25" },
      [{ weekday: 0, startTime: "10:00", durationMinutes: 60 }],
    );

    // Open-ended and running since 2020, every day, each session ending on
    // the stroke of midnight: whatever the hour, yesterday's has ended and
    // today's has not, so "the sessions that have not ended" start today.
    await seed(
      HORIZON,
      { timezone: "UTC", startDate: "2020-01-06", endDate: null },
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      })),
    );

    // Open-ended, every day, starting 360 days from now: seven sessions fall
    // inside the year the horizon searches (eight when a run crosses midnight
    // after seeding, which puts the eighth on the year's last day).
    await seed(
      LATE_START,
      { timezone: "UTC", startDate: utcDate(360), endDate: null },
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        durationMinutes: 60,
      })),
    );

    const groups = await admin.from("product_groups").insert([
      { id: GROUP_ONE, product_id: CANCELLING, name: "Cohort one" },
      { id: GROUP_TWO, product_id: CANCELLING, name: "Cohort two" },
      { id: GROUP_HORIZON, product_id: HORIZON, name: "Cohort horizon" },
    ]);
    expect(groups.error).toBeNull();

    const cancellations = await admin.from("session_cancellations").insert([
      // The group's LAST planned session.
      { group_id: GROUP_ONE, session_date: "2030-02-25", cancelled_by: TEST_IDS.ADMIN },
      // A Tuesday, which the plan does not hold: inert, so in no row.
      { group_id: GROUP_ONE, session_date: "2030-02-12", cancelled_by: TEST_IDS.ADMIN },
      { group_id: GROUP_TWO, session_date: "2030-02-11", cancelled_by: TEST_IDS.ADMIN },
      { group_id: GROUP_HORIZON, session_date: utcDate(1), cancelled_by: TEST_IDS.ADMIN },
      { group_id: GROUP_HORIZON, session_date: utcDate(3), cancelled_by: TEST_IDS.ADMIN },
    ]);
    expect(cancellations.error).toBeNull();
  });

  afterAll(async () => {
    await admin
      .from("session_cancellations")
      .delete()
      .in("group_id", [GROUP_ONE, GROUP_TWO, GROUP_HORIZON]);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  describe("planned_session_dates", () => {
    it("clips the span to the term, both ends inclusive", async () => {
      expect(await planDates(TERM, "2030-01-01", "2030-01-31")).toEqual([
        "2030-01-07",
        "2030-01-14",
        "2030-01-21",
      ]);
      // The first and last days of the term are each a span of their own.
      expect(await planDates(TERM, "2030-01-07", "2030-01-07")).toEqual(["2030-01-07"]);
      expect(await planDates(TERM, "2030-01-21", "2030-01-21")).toEqual(["2030-01-21"]);
      // A day either side of the term plans nothing, though it is a Monday.
      expect(await planDates(TERM, "2029-12-31", "2029-12-31")).toEqual([]);
      expect(await planDates(TERM, "2030-01-28", "2030-01-28")).toEqual([]);
      // A span inside the term, and one with its ends reversed.
      expect(await planDates(TERM, "2030-01-10", "2030-01-20")).toEqual(["2030-01-14"]);
      expect(await planDates(TERM, "2030-01-21", "2030-01-07")).toEqual([]);
    });

    it("maps weekday 0 to Monday and on to Sunday, at each slot's own time", async () => {
      expect(await plan(CAMP, "2030-06-01", "2030-06-30")).toEqual(
        ["2030-06-03", "2030-06-04", "2030-06-05", "2030-06-06", "2030-06-07"].map(
          (date, weekday) => ({
            session_date: date,
            starts_at: `${date}T${String(9 + weekday).padStart(2, "0")}:00:00.000Z`,
            ends_at: `${date}T${String(11 + weekday).padStart(2, "0")}:00:00.000Z`,
          }),
        ),
      );
    });

    it("plans nothing when either bound is NULL, even where the term has both", async () => {
      const openTo = await callServiceRoleRpcRaw("planned_session_dates", {
        p_product_id: OPEN,
        p_from: "2030-01-07",
        p_to: null,
      });
      expect(openTo).toEqual([]);
      const datedTo = await callServiceRoleRpcRaw("planned_session_dates", {
        p_product_id: TERM,
        p_from: "2030-01-01",
        p_to: null,
      });
      expect(datedTo).toEqual([]);
      const datedFrom = await callServiceRoleRpcRaw("planned_session_dates", {
        p_product_id: TERM,
        p_from: null,
        p_to: "2030-01-31",
      });
      expect(datedFrom).toEqual([]);
    });

    it("clamps the span to the 3660 days before its end, keeping the newest dates", async () => {
      // Every day is planned, so the rows run from the first day the clamp
      // lets through, the span's end less 3660 days, to the span's end itself.
      // Read one row from each end: the Data API caps a response at 1000 rows.
      async function edge(ascending: boolean) {
        const { data, error } = await admin
          .rpc("planned_session_dates", {
            p_product_id: OPEN,
            p_from: "2000-01-01",
            p_to: "2100-01-01",
          })
          .order("session_date", { ascending })
          .limit(1);
        expect(error).toBeNull();
        return data?.map((row) => row.session_date);
      }
      expect(await edge(true)).toEqual([addDays("2100-01-01", -3660)]);
      expect(await edge(false)).toEqual(["2100-01-01"]);
    });

    it("resolves wall clocks across a European spring-forward, and keeps a session that crosses midnight on the date it starts", async () => {
      expect(await plan(HELSINKI, "2030-03-01", "2030-04-30")).toEqual([
        // EET, UTC+2.
        {
          session_date: "2030-03-23",
          starts_at: "2030-03-23T21:00:00.000Z",
          ends_at: "2030-03-24T02:00:00.000Z",
        },
        {
          session_date: "2030-03-24",
          starts_at: "2030-03-24T08:00:00.000Z",
          ends_at: "2030-03-24T09:00:00.000Z",
        },
        // Starts in EET and ends in EEST: five hours of real time, so 05:00 on
        // the wall clock rather than 04:00.
        {
          session_date: "2030-03-30",
          starts_at: "2030-03-30T21:00:00.000Z",
          ends_at: "2030-03-31T02:00:00.000Z",
        },
        // EEST, UTC+3.
        {
          session_date: "2030-03-31",
          starts_at: "2030-03-31T07:00:00.000Z",
          ends_at: "2030-03-31T08:00:00.000Z",
        },
        {
          session_date: "2030-04-06",
          starts_at: "2030-04-06T20:00:00.000Z",
          ends_at: "2030-04-07T01:00:00.000Z",
        },
      ]);
    });

    it("resolves wall clocks across a southern fall-back", async () => {
      expect(await plan(AUCKLAND, "2030-03-01", "2030-04-30")).toEqual([
        // NZDT, UTC+13: 10:00 local is the previous UTC day.
        {
          session_date: "2030-03-24",
          starts_at: "2030-03-23T21:00:00.000Z",
          ends_at: "2030-03-23T22:00:00.000Z",
        },
        {
          session_date: "2030-03-31",
          starts_at: "2030-03-30T21:00:00.000Z",
          ends_at: "2030-03-30T22:00:00.000Z",
        },
        // NZST, UTC+12, from 03:00 that morning.
        {
          session_date: "2030-04-07",
          starts_at: "2030-04-06T22:00:00.000Z",
          ends_at: "2030-04-06T23:00:00.000Z",
        },
        {
          session_date: "2030-04-14",
          starts_at: "2030-04-13T22:00:00.000Z",
          ends_at: "2030-04-13T23:00:00.000Z",
        },
      ]);
    });

    it("answers anon exactly as it answers the service role", async () => {
      // The scope test for planned_session_dates' self-scoping classification:
      // SECURITY INVOKER over two tables every caller reads in full, so there
      // is no per-caller answer to leak.
      const anon = createAnonTestClient();
      for (const product of [HELSINKI, CAMP, OPEN]) {
        const asAnon = await anon.rpc("planned_session_dates", {
          p_product_id: product,
          p_from: "2030-01-01",
          p_to: "2030-12-31",
        });
        expect(asAnon.error).toBeNull();
        const asAdmin = await admin.rpc("planned_session_dates", {
          p_product_id: product,
          p_from: "2030-01-01",
          p_to: "2030-12-31",
        });
        expect(asAdmin.error).toBeNull();
        expect(asAnon.data?.length).toBeGreaterThan(0);
        expect(asAnon.data).toEqual(asAdmin.data);
      }
    });
  });

  describe("planned_group_sessions", () => {
    it("lists a group as cancelled on a date exactly when group_session_is_cancelled says so", async () => {
      const { data, error } = await admin.rpc("planned_group_sessions", {
        p_product_id: CANCELLING,
        p_from: "2030-01-01",
        p_to: "2030-12-31",
      });
      expect(error).toBeNull();
      const rows = plannedGroupRows.parse(data);
      expect(rows.map((row) => [row.session_date, row.cancelled_group_ids])).toEqual([
        ["2030-02-04", []],
        ["2030-02-11", [GROUP_TWO]],
        ["2030-02-18", []],
        ["2030-02-25", [GROUP_ONE]],
      ]);

      for (const row of rows) {
        for (const group of [GROUP_ONE, GROUP_TWO]) {
          const cancelled = await admin.rpc("group_session_is_cancelled", {
            p_group_id: group,
            p_session_date: row.session_date,
          });
          expect(cancelled.error).toBeNull();
          expect(row.cancelled_group_ids.includes(group)).toBe(cancelled.data);
        }
      }
    });
  });

  describe("group_final_session_date", () => {
    async function finalSession(group: string) {
      const { data, error } = await admin.rpc("group_final_session_date", {
        p_group_id: group,
      });
      expect(error).toBeNull();
      return data;
    }

    it("hands a cancelled last session's role to the one before it, for that group only", async () => {
      expect(await finalSession(GROUP_ONE)).toBe("2030-02-18");
      expect(await finalSession(GROUP_TWO)).toBe("2030-02-25");
    });

    it("is NULL on an open-ended product", async () => {
      expect(await finalSession(GROUP_HORIZON)).toBeNull();
    });
  });

  describe("session_plan_horizon", () => {
    /**
     * Asks the horizon and accepts the answer for either UTC day the call may
     * have run on: a run crossing midnight moves "today" under it.
     */
    async function expectHorizon(
      args: { p_group_id?: string; p_at_least?: string },
      expected: () => string,
      product: string = HORIZON,
    ) {
      const before = expected();
      const { data, error } = await admin.rpc("session_plan_horizon", {
        p_product_id: product,
        ...args,
      });
      expect(error).toBeNull();
      expect([before, expected()]).toContain(data);
    }

    it("is a dated product's end date", async () => {
      const { data, error } = await admin.rpc("session_plan_horizon", {
        p_product_id: TERM,
      });
      expect(error).toBeNull();
      expect(data).toBe("2030-01-21");
    });

    it("is the eighth session that has not ended, open-ended", async () => {
      // Yesterday's has ended and today's has not: today plus seven.
      await expectHorizon({}, () => utcDate(7));
    });

    it("skips the dates the group cancelled", async () => {
      // Today, +2, +4, +5, +6, +7, +8 and +9: the group cancelled +1 and +3,
      // so its eighth is two days later.
      await expectHorizon({ p_group_id: GROUP_HORIZON }, () => utcDate(9));
    });

    it("is the last day of the year it searches when fewer than eight fall inside it", async () => {
      await expectHorizon({}, () => utcDate(366), LATE_START);
    });

    it("is raised to p_at_least, and never lowered by it", async () => {
      await expectHorizon({ p_at_least: utcDate(100) }, () => utcDate(100));
      await expectHorizon({ p_at_least: utcDate(0) }, () => utcDate(7));
    });
  });

  describe("the plan is expanded in one place", () => {
    /**
     * The functions allowed to walk dates against weekdays. Every other reader
     * of the plan asks planned_session_dates.
     */
    const EXPANDERS: Record<string, string> = {
      planned_session_dates: "the plan itself",
    };

    it("no other function maps dates to weekdays or steps through days", async () => {
      const { data, error } = await admin.rpc("_list_function_authorization_surface");
      expect(error).toBeNull();
      const walkers = functionBodies
        .parse(data)
        .filter(
          (fn) =>
            /\b(iso)?dow\b/i.test(fn.body) ||
            /generate_series\s*\([^;]*interval/i.test(fn.body),
        )
        .map((fn) => fn.function_name)
        .sort();

      // Both directions: a new walker fails, and so does an entry whose
      // function stopped walking, so an allowance cannot outlive its reason.
      expect(walkers).toEqual(Object.keys(EXPANDERS).sort());
    });
  });

  /**
   * TRANSITIONAL: the SQL plan against the TypeScript occurrence walks it
   * replaces, over a matrix of zones, schedules and moments. It proves the move
   * from one to the other changes no session, and it is deleted with those
   * walks in the last piece of this refactor (P7).
   */
  describe("the plan agrees with the TypeScript occurrence walks", () => {
    const MARGIN_MS = 5 * 60_000;

    interface Fixture {
      id: string;
      timezone: string;
      startDate: string;
      endDate: string | null;
      slots: SlotShape[];
      moments: string[];
    }

    const FIXTURES: Fixture[] = [
      {
        id: CROSS_HELSINKI,
        timezone: "Europe/Helsinki",
        startDate: "2030-02-01",
        endDate: "2030-05-31",
        slots: [
          { weekday: 0, startTime: "17:30", durationMinutes: 90 },
          { weekday: 3, startTime: "17:30", durationMinutes: 90 },
        ],
        moments: [
          "2030-01-15T12:00:00.000Z",
          "2030-03-28T16:00:00.000Z", // Thursday 18:00 EET: in progress.
          "2030-04-01T12:00:00.000Z",
          "2030-07-01T12:00:00.000Z",
        ],
      },
      {
        id: CROSS_AUCKLAND,
        timezone: "Pacific/Auckland",
        startDate: "2030-03-01",
        endDate: null,
        slots: [
          { weekday: 2, startTime: "23:30", durationMinutes: 120 },
          { weekday: 6, startTime: "10:00", durationMinutes: 60 },
        ],
        moments: [
          "2030-02-01T00:00:00.000Z",
          "2030-04-03T11:00:00.000Z", // Wednesday 23:30 NZDT has just begun.
          "2030-04-10T00:00:00.000Z",
          "2030-06-15T00:00:00.000Z",
        ],
      },
      {
        id: CROSS_LOS_ANGELES,
        timezone: "America/Los_Angeles",
        startDate: "2030-10-28",
        endDate: "2030-11-10",
        slots: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startTime: "08:00",
          durationMinutes: 45,
        })),
        moments: [
          "2030-10-01T00:00:00.000Z",
          "2030-11-03T16:20:00.000Z", // Sunday 08:20 PST, the day it falls back.
          "2030-11-20T00:00:00.000Z",
        ],
      },
    ];

    beforeAll(async () => {
      for (const fixture of FIXTURES) {
        await seed(
          fixture.id,
          {
            timezone: fixture.timezone,
            startDate: fixture.startDate,
            endDate: fixture.endDate,
          },
          fixture.slots,
        );
      }
    });

    /** The started sessions and the open ones, as the feeds walk them today. */
    function walked(fixture: Fixture, now: Date) {
      const startBoundary = startDateToCutoff(fixture.startDate, fixture.timezone);
      const endBoundary = endDateToCutoff(fixture.endDate, fixture.timezone);
      const past = enumeratePastRowOccurrences({
        slots: fixture.slots,
        timezone: fixture.timezone,
        now,
        floor: startBoundary ?? now,
        endBoundary,
        maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
      });
      const ahead = enumerateRowOccurrences({
        slots: fixture.slots,
        timezone: fixture.timezone,
        now,
        startBoundary,
        endBoundary,
        cap: fixture.endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Infinity,
        windowCloseMs: MARGIN_MS,
      });
      const byStart = new Map<number, { start: Date; end: Date }>();
      for (const occurrence of [...past, ...ahead]) {
        byStart.set(occurrence.start.getTime(), occurrence);
      }
      return [...byStart.values()]
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .map((o) => [o.start.toISOString(), o.end.toISOString()]);
    }

    it("read to session_plan_horizon, holds every session the walk shows when yesterday's and today's have both ended", async () => {
      // Every day at 00:00 for a minute: a daily club after today's session,
      // so the day before and the day itself both hold finished sessions.
      const fixture: Fixture = {
        id: LIVE,
        timezone: "UTC",
        startDate: utcDate(-20),
        endDate: null,
        slots: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startTime: "00:00",
          durationMinutes: 1,
        })),
        moments: [],
      };
      await seed(
        fixture.id,
        { timezone: fixture.timezone, startDate: fixture.startDate, endDate: null },
        fixture.slots,
      );

      // Taken before the database reads its own clock: the horizon only grows
      // with time, so a plan read a moment later still holds everything the
      // walk at this instant shows.
      const now = new Date();
      const horizon = await admin.rpc("session_plan_horizon", { p_product_id: LIVE });
      expect(horizon.error).toBeNull();
      const { data, error } = await admin.rpc("planned_session_dates", {
        p_product_id: LIVE,
        p_from: fixture.startDate,
        p_to: z.string().parse(horizon.data),
      });
      expect(error).toBeNull();
      const planned = plannedSessionRows.parse(data);

      expect(
        trimOpenEndedFuture(planned, now, OPEN_ENDED_OCCURRENCE_CAP, MARGIN_MS).map((s) => [
          s.startsAt.toISOString(),
          s.endsAt.toISOString(),
        ]),
      ).toEqual(walked(fixture, now));
    });

    it.each(FIXTURES.map((fixture) => [fixture.timezone, fixture] as const))(
      "%s",
      async (_zone, fixture) => {
        const to = fixture.endDate ?? "2031-12-31";
        const { data, error } = await admin.rpc("planned_session_dates", {
          p_product_id: fixture.id,
          p_from: fixture.startDate,
          p_to: to,
        });
        expect(error).toBeNull();
        const planned = plannedSessionRows.parse(data);
        expect(planned.length).toBeGreaterThan(0);

        for (const moment of fixture.moments) {
          const now = new Date(moment);
          const shown =
            fixture.endDate === null
              ? trimOpenEndedFuture(planned, now, OPEN_ENDED_OCCURRENCE_CAP, MARGIN_MS)
              : planned;
          expect(
            shown.map((s) => [s.startsAt.toISOString(), s.endsAt.toISOString()]),
            moment,
          ).toEqual(walked(fixture, now));
        }
      },
    );
  });
});
