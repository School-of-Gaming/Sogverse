import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  holidayCalendarChangePreview,
  type HolidayBreakInput,
} from "@/services/holiday-calendars/holiday-calendars.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createScheduleSlot, createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * The preview an admin is shown before saving a holiday calendar some club
 * follows: per club, the planned sessions the save removes and restores — past
 * and future alike — the stored records it hides and shows, and the
 * substitution requests it leaves without a session or reopens.
 *
 * Layout. CLUB is a dated Monday club (10:00 UTC) whose term runs from January
 * 2021 to December 2034, so a break in 2021 is the past and one in 2034 the
 * future whatever day the suite runs. It follows EDITED, the calendar every
 * preview here proposes breaks for — a past break on 1 March 2021 and a future
 * one on 1 May 2034 — and OTHER, which covers 6–10 March 2034. Its group
 * stored a session on 1 May 2034 (inside EDITED's break) and on 5 June 2034
 * (ordinary), and carries an open substitution request on each of those dates
 * plus a withdrawn one on 5 June, which no preview may list.
 *
 * SHORT is a Monday club whose term is the first quarter of 2025 and which
 * follows EDITED too, with nothing stored: an edit away from its term changes
 * nothing for it, so it is left out. UNFOLLOWED is a calendar no club follows.
 *
 * Fixture UUIDs 8b0-8b2 (see the allocation registry in product-helpers.ts).
 * The calendars are minted by the RPC and found by a name prefix only this
 * file uses.
 */

const CLUB = "00000000-0000-0000-0000-0000000008b0";
const CLUB_GROUP = "00000000-0000-0000-0000-0000000008b1";
const SHORT = "00000000-0000-0000-0000-0000000008b2";
const ALL_PRODUCTS = [CLUB, SHORT];

const NAME_PREFIX = "Holiday-impact test";

const PAST_BREAK = "2021-03-01";
const FUTURE_BREAK = "2034-05-01";
const ORDINARY = "2034-06-05";

const names = (name: string) => [{ locale: "en", name }];

/** CLUB's Monday session on `date`, as a parsed plan row. */
function session(date: string) {
  return {
    date,
    startsAt: new Date(`${date}T10:00:00.000Z`),
    endsAt: new Date(`${date}T11:00:00.000Z`),
    cancelled: false,
  };
}

describe("preview_holiday_calendar_change", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  let edited = "";
  let other = "";
  let unfollowed = "";
  let pastBreakId = "";
  let futureBreakId = "";
  let futureRequestId = "";
  let ordinaryRequestId = "";

  /** EDITED's breaks as they stand, as a save payload. */
  function currentBreaks(): HolidayBreakInput[] {
    return [
      {
        id: pastBreakId,
        start_date: PAST_BREAK,
        end_date: "2021-03-07",
        names: names("Ski week"),
      },
      {
        id: futureBreakId,
        start_date: FUTURE_BREAK,
        end_date: "2034-05-07",
        names: names("May week"),
      },
    ];
  }

  async function createCalendar(label: string, breaks: Omit<HolidayBreakInput, "id">[]) {
    const { data, error } = await adminAuth.rpc("create_holiday_calendar", {
      p_name: `${NAME_PREFIX} ${label}`,
      p_breaks: breaks.map((row) => ({ ...row, id: null })),
    });
    expect(error).toBeNull();
    return data ?? "";
  }

  async function removeCalendars() {
    await admin.from("holiday_calendars").delete().like("name", `${NAME_PREFIX}%`);
  }

  async function preview(calendar: string, breaks: HolidayBreakInput[]) {
    const { data, error } = await adminAuth.rpc("preview_holiday_calendar_change", {
      p_calendar_id: calendar,
      p_breaks: breaks,
    });
    expect(error).toBeNull();
    return holidayCalendarChangePreview.parse(data);
  }

  /** The preview's entry for CLUB, which every edit here touches. */
  async function clubImpact(breaks: HolidayBreakInput[]) {
    const result = await preview(edited, breaks);
    expect(result.products.map((row) => row.productId)).toEqual([CLUB]);
    return result.products[0];
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, customerAuth, geduAuth] = await Promise.all([
      createAuthenticatedClient(TEST_CREDENTIALS.ADMIN.email, TEST_CREDENTIALS.ADMIN.password),
      createAuthenticatedClient(TEST_CREDENTIALS.CUSTOMER.email, TEST_CREDENTIALS.CUSTOMER.password),
      createAuthenticatedClient(TEST_CREDENTIALS.GEDU.email, TEST_CREDENTIALS.GEDU.password),
    ]);

    await admin.from("session_substitution_requests").delete().eq("group_id", CLUB_GROUP);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();

    await createTestProduct(admin, {
      id: CLUB,
      seatCount: null,
      startDate: "2021-01-04",
      endDate: "2034-12-25",
    });
    await createScheduleSlot(admin, CLUB, { weekday: 0, startTime: "10:00", durationMinutes: 60 });
    const translation = await admin.from("product_translations").insert({
      product_id: CLUB,
      locale: "en",
      name: "Holiday impact club",
      short_description: "A club whose holidays are previewed",
    });
    expect(translation.error).toBeNull();
    await createTestProduct(admin, {
      id: SHORT,
      seatCount: null,
      startDate: "2025-01-06",
      endDate: "2025-03-31",
    });
    await createScheduleSlot(admin, SHORT, { weekday: 0, startTime: "10:00", durationMinutes: 60 });

    const group = await admin
      .from("product_groups")
      .insert({ id: CLUB_GROUP, product_id: CLUB, name: "Holiday impact cohort" });
    expect(group.error).toBeNull();

    const sessions = await admin.from("group_sessions").insert(
      [FUTURE_BREAK, ORDINARY].map((date) => ({
        group_id: CLUB_GROUP,
        session_date: date,
        starts_at: `${date}T10:00:00Z`,
        ends_at: `${date}T11:00:00Z`,
        report: `Report for ${date}`,
      })),
    );
    expect(sessions.error).toBeNull();

    const request = (date: string, status: "open" | "withdrawn") => ({
      group_id: CLUB_GROUP,
      session_date: date,
      requested_by: TEST_IDS.GEDU,
      role: "primary" as const,
      reason: "other" as const,
      status,
    });
    const requests = await admin
      .from("session_substitution_requests")
      .insert([
        request(FUTURE_BREAK, "open"),
        request(ORDINARY, "open"),
        request(ORDINARY, "withdrawn"),
      ])
      .select("id, session_date, status");
    expect(requests.error).toBeNull();
    const requestOn = (date: string) =>
      (requests.data ?? []).find((row) => row.session_date === date && row.status === "open")
        ?.id ?? "";
    futureRequestId = requestOn(FUTURE_BREAK);
    ordinaryRequestId = requestOn(ORDINARY);

    edited = await createCalendar("edited", [
      { start_date: PAST_BREAK, end_date: "2021-03-07", names: names("Ski week") },
      { start_date: FUTURE_BREAK, end_date: "2034-05-07", names: names("May week") },
    ]);
    other = await createCalendar("other", [
      { start_date: "2034-03-06", end_date: "2034-03-10", names: names("Other week") },
    ]);
    unfollowed = await createCalendar("unfollowed", [
      { start_date: ORDINARY, end_date: ORDINARY, names: names("Nobody's day") },
    ]);

    const stored = await admin
      .from("holiday_breaks")
      .select("id, start_date")
      .eq("calendar_id", edited);
    expect(stored.error).toBeNull();
    const idOn = (start: string) =>
      (stored.data ?? []).find((row) => row.start_date === start)?.id ?? "";
    pastBreakId = idOn(PAST_BREAK);
    futureBreakId = idOn(FUTURE_BREAK);

    for (const [product, calendars] of [
      [CLUB, [edited, other]],
      [SHORT, [edited]],
    ] as const) {
      const { error } = await adminAuth.rpc("set_product_holiday_calendars", {
        p_product_id: product,
        p_calendar_ids: [...calendars],
      });
      expect(error).toBeNull();
    }
  });

  afterAll(async () => {
    await admin.from("session_substitution_requests").delete().eq("group_id", CLUB_GROUP);
    // Products first: the link to a calendar is ON DELETE RESTRICT.
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();
  });

  it.each([
    ["a family", () => customerAuth],
    ["a gedu", () => geduAuth],
  ])("refuses %s", async (_label, client) => {
    const { error } = await client().rpc("preview_holiday_calendar_change", {
      p_calendar_id: edited,
      p_breaks: currentBreaks(),
    });
    expect(error?.code).toBe("42501");
  });

  it("refuses an id no calendar has", async () => {
    const { error } = await adminAuth.rpc("preview_holiday_calendar_change", {
      p_calendar_id: CLUB,
      p_breaks: [],
    });
    expect(error?.code).toBe("P0002");
  });

  it("refuses a payload the save would refuse, with the save's sentence", async () => {
    const { error } = await adminAuth.rpc("preview_holiday_calendar_change", {
      p_calendar_id: edited,
      p_breaks: [
        ...currentBreaks(),
        { id: null, start_date: "2034-05-05", end_date: "2034-05-10", names: names("Clash") },
      ],
    });
    expect(error?.code).toBe("23514");
    expect(error?.message).toBe(
      "The breaks from 2034-05-01 to 2034-05-07 and from 2034-05-05 to 2034-05-10 overlap",
    );
  });

  it("answers an empty list for an edit that changes nothing", async () => {
    expect(await preview(edited, currentBreaks())).toEqual({ products: [] });
  });

  it("answers an empty list for a calendar no club follows", async () => {
    expect(await preview(unfollowed, [])).toEqual({ products: [] });
  });

  it("removes the planned sessions a new break covers, past and future", async () => {
    const impact = await clubImpact([
      ...currentBreaks(),
      { id: null, start_date: "2021-06-07", end_date: "2021-06-13", names: names("June") },
      { id: null, start_date: ORDINARY, end_date: "2034-06-11", names: names("June") },
    ]);

    // SHORT follows the calendar too, but nothing in its term moved.
    expect(impact.productType).toBe("consumer_club");
    expect(impact.timezone).toBe("UTC");
    expect(impact.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(impact.translations).toEqual([{ locale: "en", name: "Holiday impact club" }]);
    expect(impact.removed).toEqual([session("2021-06-07"), session(ORDINARY)]);
    expect(impact.restored).toEqual([]);
  });

  it("restores the planned sessions a removed break held, past and future", async () => {
    const impact = await clubImpact([]);
    expect(impact.removed).toEqual([]);
    expect(impact.restored).toEqual([session(PAST_BREAK), session(FUTURE_BREAK)]);
  });

  it("both removes and restores when a break moves", async () => {
    const [past, future] = currentBreaks();
    const impact = await clubImpact([
      past,
      { ...future, start_date: "2034-05-08", end_date: "2034-05-14" },
    ]);
    expect(impact.removed).toEqual([session("2034-05-08")]);
    expect(impact.restored).toEqual([session(FUTURE_BREAK)]);
  });

  it("lists nothing for a date another followed calendar already covers", async () => {
    // OTHER already takes 6 March 2034 out, so only the 13th is new.
    const impact = await clubImpact([
      ...currentBreaks(),
      { id: null, start_date: "2034-03-06", end_date: "2034-03-13", names: names("March") },
    ]);
    expect(impact.removed).toEqual([session("2034-03-13")]);
    expect(impact.restored).toEqual([]);
  });

  it("hides a stored record on a new holiday, and shows one a removed break held", async () => {
    const added = await clubImpact([
      ...currentBreaks(),
      { id: null, start_date: ORDINARY, end_date: ORDINARY, names: names("June") },
    ]);
    expect(added.records).toEqual([
      {
        groupId: CLUB_GROUP,
        groupName: "Holiday impact cohort",
        date: ORDINARY,
        effect: "hidden",
      },
    ]);

    const removed = await clubImpact([currentBreaks()[0]]);
    expect(removed.records).toEqual([
      {
        groupId: CLUB_GROUP,
        groupName: "Holiday impact cohort",
        date: FUTURE_BREAK,
        effect: "shown",
      },
    ]);
  });

  it("leaves a request without its session on a new holiday, and reopens one a removed break held", async () => {
    const added = await clubImpact([
      ...currentBreaks(),
      { id: null, start_date: ORDINARY, end_date: ORDINARY, names: names("June") },
    ]);
    // The withdrawn request on the same date is history, and is not listed.
    expect(added.requests).toEqual([
      {
        requestId: ordinaryRequestId,
        groupId: CLUB_GROUP,
        groupName: "Holiday impact cohort",
        date: ORDINARY,
        status: "open",
        effect: "no_session",
      },
    ]);

    const removed = await clubImpact([currentBreaks()[0]]);
    expect(removed.requests).toEqual([
      {
        requestId: futureRequestId,
        groupId: CLUB_GROUP,
        groupName: "Holiday impact cohort",
        date: FUTURE_BREAK,
        status: "open",
        effect: "reopened",
      },
    ]);
  });

  it("lists every following club an edit touches, and writes nothing", async () => {
    const result = await preview(edited, [
      ...currentBreaks(),
      { id: null, start_date: "2025-02-03", end_date: "2025-02-09", names: names("February") },
    ]);
    expect(result.products.map((row) => [row.productId, row.removed.map((s) => s.date)])).toEqual([
      [CLUB, ["2025-02-03"]],
      [SHORT, ["2025-02-03"]],
    ]);

    const stored = await admin
      .from("holiday_breaks")
      .select("start_date")
      .eq("calendar_id", edited)
      .order("start_date");
    expect(stored.error).toBeNull();
    expect((stored.data ?? []).map((row) => row.start_date)).toEqual([PAST_BREAK, FUTURE_BREAK]);
  });
});
