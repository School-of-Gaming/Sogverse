import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { holidayBreakRows, type HolidayBreak } from "@/lib/holiday-breaks";
import {
  geduGroupFeed,
  traineeGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { adminProductSessions } from "@/services/admin-sessions/admin-sessions.contracts";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import { geduInvoicingSnapshot } from "@/services/gedu-invoicing/gedu-invoicing.contracts";
import { adminDashboardSnapshot } from "@/services/admin-dashboard/admin-dashboard.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * The holiday breaks on the session documents: every document a session list
 * or an invoice is drawn from carries `holiday_breaks` beside its plan, over
 * the plan's own span, and a holiday date carries its break and nothing else —
 * no stored session row and no cancellation travels on one.
 *
 * Layout. CLUB is a dated consumer club meeting Mondays at 10:00 UTC from
 * 2 September to 30 December 2030, with one group taught by the seeded gedu
 * and the seeded gamer seated in it. It follows one calendar with three
 * breaks: a summer break before the term (outside every span here), an autumn
 * break 14–18 October (withdrawing Monday the 14th) and a Christmas break
 * from 21 December into January (withdrawing the 23rd and the 30th, the last
 * day of the term). The group stored a session on 7 October and on the
 * holiday 14 October, and cancelled the holiday 14 October and the ordinary
 * 21 October — both written before the calendar was followed, as a record
 * and a cancellation on a date that later becomes a holiday are.
 *
 * DAILY is an open-ended daily club that started a month ago, following the
 * same calendar, which also breaks three days from today for three days: the
 * admin dashboard reads a window around today, so its break has to be near.
 *
 * Every document parses through its own contract.
 *
 * Fixture UUIDs 8a0-8a3 (see the allocation registry in product-helpers.ts).
 * The calendar is minted by the RPC under test and found by a name prefix only
 * this file uses.
 */

const CLUB = "00000000-0000-0000-0000-0000000008a0";
const CLUB_GROUP = "00000000-0000-0000-0000-0000000008a1";
const DAILY = "00000000-0000-0000-0000-0000000008a2";
const DAILY_GROUP = "00000000-0000-0000-0000-0000000008a3";
const ALL_PRODUCTS = [CLUB, DAILY];
const ALL_GROUPS = [CLUB_GROUP, DAILY_GROUP];

const NAME_PREFIX = "Holiday-documents test";

const ORDINARY = "2030-10-07";
const HOLIDAY = "2030-10-14";
const CANCELLED = "2030-10-21";

/** A UTC calendar date `offset` days from now; DAILY runs in UTC. */
function utcDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  )
    .toISOString()
    .slice(0, 10);
}

/** CLUB's Monday session on `date`, as a parsed plan row. */
function clubSession(date: string) {
  return {
    date,
    startsAt: new Date(`${date}T10:00:00.000Z`),
    endsAt: new Date(`${date}T11:00:00.000Z`),
    cancelled: false,
  };
}

const AUTUMN_NAMES = [
  { locale: "en", name: "Autumn break" },
  { locale: "fi", name: "Syysloma" },
  { locale: "fr", name: "Vacances d'automne" },
  { locale: "sv", name: "Höstlov" },
];
const CHRISTMAS_NAMES = [
  { locale: "en", name: "Christmas break" },
  { locale: "fi", name: "Joululoma" },
];

describe("the session documents carry the holiday breaks", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  let calendar = "";
  let participationId = "";
  let autumnId = "";
  let christmasId = "";
  let nearId = "";

  /** CLUB's two breaks inside its term, as every CLUB document carries them. */
  function clubBreaks(): HolidayBreak[] {
    return [
      {
        id: autumnId,
        startDate: "2030-10-14",
        endDate: "2030-10-18",
        names: AUTUMN_NAMES,
        withdrawnSessions: [clubSession(HOLIDAY)],
      },
      {
        id: christmasId,
        startDate: "2030-12-21",
        endDate: "2031-01-06",
        names: CHRISTMAS_NAMES,
        withdrawnSessions: [clubSession("2030-12-23"), clubSession("2030-12-30")],
      },
    ];
  }

  async function removeCalendars() {
    await admin.from("holiday_calendars").delete().like("name", `${NAME_PREFIX}%`);
  }

  async function geduFeed() {
    const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
      p_group_id: CLUB_GROUP,
    });
    expect(error).toBeNull();
    return geduGroupFeed.parse(data);
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    [adminAuth, customerAuth, geduAuth] = await Promise.all([
      createAuthenticatedClient(TEST_CREDENTIALS.ADMIN.email, TEST_CREDENTIALS.ADMIN.password),
      createAuthenticatedClient(TEST_CREDENTIALS.CUSTOMER.email, TEST_CREDENTIALS.CUSTOMER.password),
      createAuthenticatedClient(TEST_CREDENTIALS.GEDU.email, TEST_CREDENTIALS.GEDU.password),
    ]);

    await admin.from("session_cancellations").delete().in("group_id", ALL_GROUPS);
    await admin.from("gedu_group_assignments").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();

    await createTestProduct(admin, {
      id: CLUB,
      seatCount: null,
      startDate: "2030-09-02",
      endDate: "2030-12-30",
    });
    await createScheduleSlot(admin, CLUB, { weekday: 0, startTime: "10:00", durationMinutes: 60 });
    await createTestProduct(admin, { id: DAILY, seatCount: null, startDate: utcDate(-30) });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, DAILY, { weekday, startTime: "10:00", durationMinutes: 60 });
    }

    const groups = await admin.from("product_groups").insert([
      { id: CLUB_GROUP, product_id: CLUB, name: "Holiday documents cohort" },
      { id: DAILY_GROUP, product_id: DAILY, name: "Holiday documents daily cohort" },
    ]);
    expect(groups.error).toBeNull();

    const assignment = await admin.from("gedu_group_assignments").insert({
      product_id: CLUB,
      group_id: CLUB_GROUP,
      gedu_id: TEST_IDS.GEDU,
      role: "primary",
    });
    expect(assignment.error).toBeNull();

    const seat = await admin
      .from("participations")
      .insert({
        product_id: CLUB,
        group_id: CLUB_GROUP,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();
    expect(seat.error).toBeNull();
    participationId = seat.data?.id ?? "";

    const sessions = await admin.from("group_sessions").insert(
      [ORDINARY, HOLIDAY].map((date) => ({
        group_id: CLUB_GROUP,
        session_date: date,
        starts_at: `${date}T10:00:00Z`,
        ends_at: `${date}T11:00:00Z`,
        report: `Report for ${date}`,
      })),
    );
    expect(sessions.error).toBeNull();

    const cancellations = await admin.from("session_cancellations").insert(
      [HOLIDAY, CANCELLED].map((date) => ({
        group_id: CLUB_GROUP,
        session_date: date,
        cancelled_by: TEST_IDS.ADMIN,
      })),
    );
    expect(cancellations.error).toBeNull();

    const created = await adminAuth.rpc("create_holiday_calendar", {
      p_name: `${NAME_PREFIX} Helsinki schools`,
      p_breaks: [
        {
          start_date: "2030-08-01",
          end_date: "2030-08-05",
          names: [{ locale: "en", name: "Summer's end" }],
        },
        { start_date: "2030-10-14", end_date: "2030-10-18", names: AUTUMN_NAMES },
        { start_date: "2030-12-21", end_date: "2031-01-06", names: CHRISTMAS_NAMES },
        {
          start_date: utcDate(3),
          end_date: utcDate(5),
          names: [{ locale: "en", name: "Long weekend" }],
        },
      ],
    });
    expect(created.error).toBeNull();
    calendar = created.data ?? "";

    const stored = await admin
      .from("holiday_breaks")
      .select("id, start_date")
      .eq("calendar_id", calendar);
    expect(stored.error).toBeNull();
    const idOn = (start: string) =>
      (stored.data ?? []).find((row) => row.start_date === start)?.id ?? "";
    autumnId = idOn("2030-10-14");
    christmasId = idOn("2030-12-21");
    nearId = idOn(utcDate(3));

    for (const product of ALL_PRODUCTS) {
      const { error } = await adminAuth.rpc("set_product_holiday_calendars", {
        p_product_id: product,
        p_calendar_ids: [calendar],
      });
      expect(error).toBeNull();
    }
  });

  afterAll(async () => {
    await admin.from("session_cancellations").delete().in("group_id", ALL_GROUPS);
    await admin.from("gedu_group_assignments").delete().in("product_id", ALL_PRODUCTS);
    // Products first: the link to a calendar is ON DELETE RESTRICT.
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();
  });

  describe("holiday_breaks_document", () => {
    it("answers anon exactly as it answers an admin, every name included", async () => {
      // The scope test for holiday_breaks_document's self-scoping
      // classification.
      const args = { p_product_id: CLUB, p_from: "2030-01-01", p_to: "2030-12-31" };
      const asAnon = await anon.rpc("holiday_breaks_document", args);
      const asAdmin = await adminAuth.rpc("holiday_breaks_document", args);
      expect(asAnon.error).toBeNull();
      expect(asAdmin.error).toBeNull();
      expect(asAnon.data).toEqual(asAdmin.data);

      const breaks = holidayBreakRows.parse(asAnon.data);
      // The summer break is outside the term, so it withdraws nothing — but it
      // touches the span, so it is listed.
      expect(breaks.map((row) => [row.startDate, row.withdrawnSessions.length])).toEqual([
        ["2030-08-01", 0],
        ["2030-10-14", 1],
        ["2030-12-21", 2],
      ]);
      expect(breaks[1].names).toEqual(AUTUMN_NAMES);
    });

    it("is an empty array for a span no break touches", async () => {
      const { data, error } = await anon.rpc("holiday_breaks_document", {
        p_product_id: CLUB,
        p_from: "2030-11-01",
        p_to: "2030-11-30",
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe("the session feeds", () => {
    it("the family feed carries the breaks, and neither the holiday's record nor its cancellation", async () => {
      const { data, error } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: participationId,
      });
      expect(error).toBeNull();
      const feed = familyProductFeed.parse(data);
      expect(feed.holiday_breaks).toEqual(clubBreaks());
      expect(feed.planned_sessions.map((s) => s.date)).not.toContain(HOLIDAY);
      expect(feed.sessions.map((s) => s.session_date)).toEqual([ORDINARY]);
      expect(feed.cancellations.map((c) => c.session_date)).toEqual([CANCELLED]);
    });

    it("the gedu feed carries the breaks, and neither the holiday's record nor its cancellation", async () => {
      const feed = await geduFeed();
      expect(feed.holiday_breaks).toEqual(clubBreaks());
      expect(feed.sessions.map((s) => s.session_date)).toEqual([ORDINARY]);
      expect(feed.cancellations.map((c) => c.session_date)).toEqual([CANCELLED]);
    });

    it("the trainee feed carries the breaks, and neither the holiday's record nor its cancellation", async () => {
      // An admin passes the trainee read outright, to preview the trainee's view.
      const { data, error } = await adminAuth.rpc("get_trainee_group_feed", {
        p_group_id: CLUB_GROUP,
      });
      expect(error).toBeNull();
      const feed = traineeGroupFeed.parse(data);
      expect(feed.holiday_breaks).toEqual(clubBreaks());
      expect(feed.sessions.map((s) => s.session_date)).toEqual([ORDINARY]);
      expect(feed.cancellations.map((c) => c.session_date)).toEqual([CANCELLED]);
    });

    it("the admin product document carries the breaks once, and no group carries the holiday", async () => {
      const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: CLUB,
      });
      expect(error).toBeNull();
      const document = adminProductSessions.parse(data);
      expect(document.holiday_breaks).toEqual(clubBreaks());
      const group = document.groups.find((g) => g.id === CLUB_GROUP);
      expect(group?.sessions.map((s) => s.session_date)).toEqual([ORDINARY]);
      expect(group?.cancellations.map((c) => c.session_date)).toEqual([CANCELLED]);
    });
  });

  describe("the other documents", () => {
    it("the gedu's invoicing month carries the month's break and no holiday cancellation", async () => {
      const { data, error } = await geduAuth.rpc("get_my_gedu_invoicing", {
        p_month_start: "2030-10-01",
      });
      expect(error).toBeNull();
      const month = geduInvoicingSnapshot.parse(data);
      const product = month.products.find((p) => p.id === CLUB);
      // October holds the autumn break alone.
      expect(product?.holiday_breaks).toEqual([clubBreaks()[0]]);
      expect(product?.planned_dates).toEqual([ORDINARY, CANCELLED, "2030-10-28"]);
      const group = month.groups.find((g) => g.id === CLUB_GROUP);
      expect(group?.sessions).toEqual([ORDINARY]);
      expect(group?.cancelled_sessions).toEqual([CANCELLED]);
    });

    it("the admin dashboard carries the breaks inside its window", async () => {
      const { data, error } = await adminAuth.rpc("get_admin_dashboard");
      expect(error).toBeNull();
      const dashboard = adminDashboardSnapshot.parse(data);
      const daily = dashboard.schedule_products.find((p) => p.id === DAILY);
      expect(daily?.holiday_breaks.map((row) => row.id)).toEqual([nearId]);
      expect(daily?.holiday_breaks[0].withdrawnSessions.map((s) => s.date)).toEqual([
        utcDate(3),
        utcDate(4),
        utcDate(5),
      ]);
      const plannedDates = daily?.planned_sessions.map((s) => s.session_date) ?? [];
      expect(plannedDates).toContain(utcDate(2));
      expect(plannedDates).not.toContain(utcDate(4));
    });
  });

  describe("a break that goes", () => {
    it("hands the record and the cancellation back to the documents", async () => {
      // Saved whole without the autumn break: the others keep their ids.
      const { error } = await adminAuth.rpc("update_holiday_calendar", {
        p_id: calendar,
        p_name: `${NAME_PREFIX} Helsinki schools`,
        p_breaks: [
          {
            id: christmasId,
            start_date: "2030-12-21",
            end_date: "2031-01-06",
            names: CHRISTMAS_NAMES,
          },
          {
            id: nearId,
            start_date: utcDate(3),
            end_date: utcDate(5),
            names: [{ locale: "en", name: "Long weekend" }],
          },
        ],
      });
      expect(error).toBeNull();

      const feed = await geduFeed();
      expect(feed.holiday_breaks).toEqual([clubBreaks()[1]]);
      expect(feed.sessions.map((s) => s.session_date)).toEqual([HOLIDAY, ORDINARY]);
      expect(feed.cancellations.map((c) => c.session_date)).toEqual([CANCELLED, HOLIDAY]);
    });
  });
});
