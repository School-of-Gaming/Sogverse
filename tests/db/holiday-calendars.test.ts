import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SESSION_CANCELLED_SQLSTATE } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { adminSubstitutionRequests } from "@/services/session-substitution/session-substitution.contracts";
import {
  accessTokenFor,
  callRpcRaw,
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
 * Holiday calendars: the four tables, their three writers, and what a holiday
 * does to a club's plan and to anything stored on one.
 *
 *   - Who reads what: anyone reads the breaks (and their names) of a calendar
 *     some product follows; only an admin reads a calendar's own name or an
 *     unattached calendar's breaks; nobody writes any of the four tables
 *     directly, an admin included.
 *   - A save carries the calendar whole, and its breaks are diffed against the
 *     stored ones.
 *   - Only a club follows calendars.
 *   - A holiday is never planned, and whatever is stored on one counts as not
 *     running — exactly as a cancellation does — until the break goes.
 *
 * Layout. CLUB is a dated consumer club meeting Mondays at 10:00 UTC through
 * autumn 2030, with one group. Calendar A breaks 14–18 October and calendar B
 * 18–22 October: they overlap each other (legal across calendars), and the
 * club follows both, so Mondays 14 and 21 October are holidays. CAMP is the
 * product type that may not follow a calendar. DAILY is an open-ended daily
 * club taught by the seeded gedu, for the substitution case, which needs a
 * date a few days from now.
 *
 * Calendars are minted by the RPC under test, so they are found by name: every
 * name this file uses starts with NAME_PREFIX, which no other file uses.
 *
 * Fixture UUIDs 890-895 (see the allocation registry in product-helpers.ts).
 */

const CLUB = "00000000-0000-0000-0000-000000000890";
const CLUB_GROUP = "00000000-0000-0000-0000-000000000891";
const CAMP = "00000000-0000-0000-0000-000000000892";
const DAILY = "00000000-0000-0000-0000-000000000893";
const DAILY_GROUP = "00000000-0000-0000-0000-000000000894";
/** A break id that must NEVER exist, for the "not this calendar's" case. */
const BREAK_MISSING = "00000000-0000-0000-0000-000000000895";
const ALL_PRODUCTS = [CLUB, CAMP, DAILY];

const NAME_PREFIX = "Holiday-calendars test";

/** `YYYY-MM-DD`, `offset` days from today. DAILY runs in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

type BreakPayload = {
  id?: string | null;
  start_date: string;
  end_date: string;
  names: { locale: string; name: string }[];
}

describe("holiday calendars", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customer: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;

  let calendarA: string;
  let calendarB: string;
  /** Followed by nobody, ever: its breaks are admin-only. */
  let calendarUnattached: string;
  let breakA: string;
  let breakB: string;

  async function removeCalendars() {
    await admin.from("holiday_calendars").delete().like("name", `${NAME_PREFIX}%`);
  }

  async function createCalendar(name: string, breaks: BreakPayload[]) {
    const { data, error } = await adminAuth.rpc("create_holiday_calendar", {
      p_name: `${NAME_PREFIX} ${name}`,
      p_breaks: breaks,
    });
    expect(error).toBeNull();
    if (data === null) throw new Error("no calendar id");
    return data;
  }

  async function breaksOf(calendar: string) {
    const { data, error } = await admin
      .from("holiday_breaks")
      .select("id, start_date, end_date, updated_at, holiday_break_translations(locale, name)")
      .eq("calendar_id", calendar)
      .order("start_date");
    expect(error).toBeNull();
    return (data ?? []).map((row) => ({
      ...row,
      holiday_break_translations: [...row.holiday_break_translations].sort((a, b) =>
        a.locale.localeCompare(b.locale),
      ),
    }));
  }

  async function follow(product: string, calendars: string[]) {
    const { error } = await adminAuth.rpc("set_product_holiday_calendars", {
      p_product_id: product,
      p_calendar_ids: calendars,
    });
    expect(error).toBeNull();
  }

  async function planDates(
    client: SupabaseClient<Database>,
    from: string,
    to: string,
    includeHolidays?: boolean,
  ) {
    const { data, error } = await client.rpc("planned_session_dates", {
      p_product_id: CLUB,
      p_from: from,
      p_to: to,
      ...(includeHolidays === undefined ? {} : { p_include_holidays: includeHolidays }),
    });
    expect(error).toBeNull();
    return data ?? [];
  }

  async function isCancelled(group: string, date: string) {
    const { data, error } = await admin.rpc("group_session_is_cancelled", {
      p_group_id: group,
      p_session_date: date,
    });
    expect(error).toBeNull();
    return data;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    await admin.from("session_substitution_requests").delete().eq("group_id", DAILY_GROUP);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();

    await createTestProduct(admin, {
      id: CLUB,
      seatCount: null,
      startDate: "2030-09-02",
      endDate: "2030-12-30",
    });
    await createScheduleSlot(admin, CLUB, { weekday: 0, startTime: "10:00" });
    await createTestProduct(admin, {
      id: CAMP,
      productType: "camp",
      startDate: "2030-06-03",
      endDate: "2030-06-07",
    });
    await createTestProduct(admin, {
      id: DAILY,
      seatCount: null,
      startDate: dayOffset(-30),
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, DAILY, { weekday, startTime: "23:00" });
    }

    const groups = await admin.from("product_groups").insert([
      { id: CLUB_GROUP, product_id: CLUB, name: "Holiday cohort" },
      { id: DAILY_GROUP, product_id: DAILY, name: "Holiday daily cohort" },
    ]);
    expect(groups.error).toBeNull();
    const assignment = await admin.from("gedu_group_assignments").insert({
      product_id: DAILY,
      group_id: DAILY_GROUP,
      gedu_id: TEST_IDS.GEDU,
      role: "primary",
    });
    expect(assignment.error).toBeNull();

    calendarA = await createCalendar("A", [
      {
        start_date: "2030-10-14",
        end_date: "2030-10-18",
        names: [
          { locale: "en", name: "Autumn break" },
          { locale: "fi", name: "Syysloma" },
        ],
      },
    ]);
    calendarB = await createCalendar("B", [
      {
        start_date: "2030-10-18",
        end_date: "2030-10-22",
        names: [{ locale: "en", name: "Teacher days" }],
      },
    ]);
    calendarUnattached = await createCalendar("unattached", [
      {
        start_date: "2030-10-07",
        end_date: "2030-10-07",
        names: [{ locale: "en", name: "Nobody's day off" }],
      },
    ]);
    breakA = (await breaksOf(calendarA))[0].id;
    breakB = (await breaksOf(calendarB))[0].id;
    await follow(CLUB, [calendarA, calendarB]);
  });

  afterAll(async () => {
    await admin.from("session_substitution_requests").delete().eq("group_id", DAILY_GROUP);
    // Products first: the link to a calendar is ON DELETE RESTRICT.
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await removeCalendars();
  });

  // -------------------------------------------------------------------------
  // Who reads, and that nobody writes
  // -------------------------------------------------------------------------

  describe("access", () => {
    it.each([
      ["anon", () => anon],
      ["a family", () => customer],
    ])("lets %s read a followed calendar's breaks and names, and nothing else", async (_label, client) => {
      const breaks = await client()
        .from("holiday_breaks")
        .select("id, start_date, end_date")
        .in("calendar_id", [calendarA, calendarUnattached]);
      expect(breaks.error).toBeNull();
      expect(breaks.data).toEqual([
        { id: breakA, start_date: "2030-10-14", end_date: "2030-10-18" },
      ]);

      const unattachedBreak = (await breaksOf(calendarUnattached))[0].id;
      const names = await client()
        .from("holiday_break_translations")
        .select("break_id, locale, name")
        .in("break_id", [breakA, unattachedBreak])
        .order("locale");
      expect(names.error).toBeNull();
      expect(names.data).toEqual([
        { break_id: breakA, locale: "en", name: "Autumn break" },
        { break_id: breakA, locale: "fi", name: "Syysloma" },
      ]);

      const links = await client()
        .from("product_holiday_calendars")
        .select("calendar_id")
        .eq("product_id", CLUB);
      expect(links.error).toBeNull();
      expect((links.data ?? []).map((row) => row.calendar_id).sort()).toEqual(
        [calendarA, calendarB].sort(),
      );
    });

    it("never shows a family a calendar's name, and refuses anon outright", async () => {
      const asFamily = await customer
        .from("holiday_calendars")
        .select("id")
        .in("id", [calendarA, calendarB]);
      expect(asFamily.error).toBeNull();
      expect(asFamily.data).toEqual([]);

      const asAnon = await anon.from("holiday_calendars").select("id").eq("id", calendarA);
      expect(asAnon.error).not.toBeNull();
    });

    it("shows an admin every calendar and every break, attached or not", async () => {
      const calendars = await adminAuth
        .from("holiday_calendars")
        .select("id")
        .in("id", [calendarA, calendarUnattached]);
      expect(calendars.data?.map((row) => row.id).sort()).toEqual(
        [calendarA, calendarUnattached].sort(),
      );
      const breaks = await adminAuth
        .from("holiday_breaks")
        .select("calendar_id")
        .eq("calendar_id", calendarUnattached);
      expect(breaks.data).toEqual([{ calendar_id: calendarUnattached }]);
    });

    it("refuses an admin writing any of the four tables directly", async () => {
      const inserted = await adminAuth
        .from("holiday_calendars")
        .insert({ name: `${NAME_PREFIX} direct` });
      expect(inserted.error?.code).toBe("42501");

      const updated = await adminAuth
        .from("holiday_breaks")
        .update({ end_date: "2030-10-19" })
        .eq("id", breakA);
      expect(updated.error?.code).toBe("42501");

      const deleted = await adminAuth
        .from("holiday_break_translations")
        .delete()
        .eq("break_id", breakA);
      expect(deleted.error?.code).toBe("42501");

      const linked = await adminAuth
        .from("product_holiday_calendars")
        .insert({ product_id: CAMP, calendar_id: calendarA });
      expect(linked.error?.code).toBe("42501");

      expect(await breaksOf(calendarA)).toMatchObject([
        { end_date: "2030-10-18", holiday_break_translations: [{}, {}] },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // The writers
  // -------------------------------------------------------------------------

  describe("the calendar writers", () => {
    const oneBreak = (start: string, end: string, name = "Break"): BreakPayload => ({
      start_date: start,
      end_date: end,
      names: [{ locale: "en", name }],
    });

    it.each<[string, string, BreakPayload[]]>([
      ["a blank name", "   ", []],
      ["a name another calendar has, in another case", "  holiday-calendars test a ", []],
      ["a break ending before it begins", "Backwards", [oneBreak("2030-01-10", "2030-01-09")]],
      ["a break with no name", "Nameless", [{ start_date: "2030-01-01", end_date: "2030-01-02", names: [] }]],
      [
        "a blank break name",
        "Blank break",
        [{ start_date: "2030-01-01", end_date: "2030-01-02", names: [{ locale: "en", name: " " }] }],
      ],
      [
        "two names in one language",
        "Twice",
        [
          {
            start_date: "2030-01-01",
            end_date: "2030-01-02",
            names: [
              { locale: "en", name: "One" },
              { locale: "en", name: "Two" },
            ],
          },
        ],
      ],
      [
        "two breaks that overlap",
        "Overlapping",
        [oneBreak("2030-01-01", "2030-01-05"), oneBreak("2030-01-05", "2030-01-08")],
      ],
      ["a break id no break has", "Phantom", [{ ...oneBreak("2030-01-01", "2030-01-02"), id: BREAK_MISSING }]],
    ])("refuses %s with a sentence", async (_case, name, breaks) => {
      const { error } = await adminAuth.rpc("create_holiday_calendar", {
        p_name: name.startsWith(" ") ? name : `${NAME_PREFIX} ${name}`,
        p_breaks: breaks,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message ?? "").not.toMatch(/constraint|chk_/i);
    });

    it("saves a calendar whole: edits, inserts and deletes breaks, and replaces names", async () => {
      const calendar = await createCalendar("diffed", [
        {
          start_date: "2031-02-17",
          end_date: "2031-02-21",
          names: [
            { locale: "en", name: "Ski week" },
            { locale: "fi", name: "Hiihtoloma" },
          ],
        },
        oneBreak("2031-04-14", "2031-04-18", "Easter"),
        oneBreak("2031-06-01", "2031-08-10", "Summer"),
      ]);
      const [ski, easter, summer] = await breaksOf(calendar);

      const { error } = await adminAuth.rpc("update_holiday_calendar", {
        p_id: calendar,
        p_name: `${NAME_PREFIX} diffed, renamed`,
        p_breaks: [
          // Dates moved, names replaced: en reworded, fi gone, sv new.
          {
            id: ski.id,
            start_date: "2031-02-24",
            end_date: "2031-02-28",
            names: [
              { locale: "en", name: "Winter break" },
              { locale: "sv", name: "Sportlov" },
            ],
          },
          // Untouched.
          { id: easter.id, start_date: "2031-04-14", end_date: "2031-04-18", names: [{ locale: "en", name: "Easter" }] },
          // New. Summer is left out, so it goes.
          oneBreak("2031-10-13", "2031-10-17", "Autumn"),
        ],
      });
      expect(error).toBeNull();

      const after = await breaksOf(calendar);
      expect(after.map(({ updated_at: _ignored, ...row }) => row)).toEqual([
        {
          id: ski.id,
          start_date: "2031-02-24",
          end_date: "2031-02-28",
          holiday_break_translations: [
            { locale: "en", name: "Winter break" },
            { locale: "sv", name: "Sportlov" },
          ],
        },
        {
          id: easter.id,
          start_date: "2031-04-14",
          end_date: "2031-04-18",
          holiday_break_translations: [{ locale: "en", name: "Easter" }],
        },
        {
          id: expect.any(String),
          start_date: "2031-10-13",
          end_date: "2031-10-17",
          holiday_break_translations: [{ locale: "en", name: "Autumn" }],
        },
      ]);
      expect(after.map((row) => row.id)).not.toContain(summer.id);
      // A break whose dates did not change is not rewritten.
      expect(after[1].updated_at).toBe(easter.updated_at);

      const renamed = await admin.from("holiday_calendars").select("name").eq("id", calendar).single();
      expect(renamed.data?.name).toBe(`${NAME_PREFIX} diffed, renamed`);
    });

    it("refuses another calendar's break, and an overlap the edit would create", async () => {
      const foreign = await adminAuth.rpc("update_holiday_calendar", {
        p_id: calendarUnattached,
        p_name: `${NAME_PREFIX} unattached`,
        p_breaks: [{ id: breakA, start_date: "2030-10-14", end_date: "2030-10-18", names: [{ locale: "en", name: "Stolen" }] }],
      });
      expect(foreign.error?.code).toBe("23514");

      const unattachedBreak = (await breaksOf(calendarUnattached))[0];
      const overlap = await adminAuth.rpc("update_holiday_calendar", {
        p_id: calendarUnattached,
        p_name: `${NAME_PREFIX} unattached`,
        p_breaks: [
          { id: unattachedBreak.id, start_date: "2030-10-07", end_date: "2030-10-07", names: [{ locale: "en", name: "Nobody's day off" }] },
          oneBreak("2030-10-01", "2030-10-07"),
        ],
      });
      expect(overlap.error?.code).toBe("23514");

      // Both refusals left both calendars as they were.
      expect((await breaksOf(calendarA)).map((row) => row.id)).toEqual([breakA]);
      expect((await breaksOf(calendarUnattached)).map((row) => row.id)).toEqual([unattachedBreak.id]);
    });

    it("refuses an id no calendar has", async () => {
      const { error } = await adminAuth.rpc("update_holiday_calendar", {
        p_id: BREAK_MISSING,
        p_name: `${NAME_PREFIX} missing`,
        p_breaks: [],
      });
      expect(error?.code).toBe("P0002");
    });

    it("refuses a family and a gedu with a payload an admin would be given a calendar for", async () => {
      for (const client of [customer, geduAuth]) {
        const { error } = await client.rpc("create_holiday_calendar", {
          p_name: `${NAME_PREFIX} not theirs`,
          p_breaks: [],
        });
        expect(error?.code).toBe("42501");
      }
      const { count } = await admin
        .from("holiday_calendars")
        .select("id", { count: "exact", head: true })
        .eq("name", `${NAME_PREFIX} not theirs`);
      expect(count).toBe(0);
    });
  });

  describe("set_product_holiday_calendars", () => {
    it("refuses a calendar on a product that is not a club, and accepts clearing one", async () => {
      const { error } = await adminAuth.rpc("set_product_holiday_calendars", {
        p_product_id: CAMP,
        p_calendar_ids: [calendarA],
      });
      expect(error?.code).toBe("23514");

      const cleared = await adminAuth.rpc("set_product_holiday_calendars", {
        p_product_id: CAMP,
        p_calendar_ids: [],
      });
      expect(cleared.error).toBeNull();
    });

    it("refuses a NULL element", async () => {
      // Raw, because the generated argument type admits no NULL element.
      const token = await accessTokenFor(
        TEST_CREDENTIALS.ADMIN.email,
        TEST_CREDENTIALS.ADMIN.password,
      );
      const result = await callRpcRaw(token, "set_product_holiday_calendars", {
        p_product_id: CLUB,
        p_calendar_ids: [calendarA, null],
      });
      expect(result.code).toBe("23514");
      // And the set it would have merged into is untouched.
      const links = await admin
        .from("product_holiday_calendars")
        .select("calendar_id")
        .eq("product_id", CLUB);
      expect((links.data ?? []).map((row) => row.calendar_id).sort()).toEqual(
        [calendarA, calendarB].sort(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // The plan
  // -------------------------------------------------------------------------

  describe("the plan", () => {
    it("leaves holiday dates out by default, from either calendar", async () => {
      const rows = await planDates(adminAuth, "2030-10-01", "2030-10-31");
      expect(rows.map((row) => row.session_date)).toEqual(["2030-10-07", "2030-10-28"]);
      // The generated type calls the column a string; the LEFT JOIN makes it
      // NULL on every date the plan holds, which is every date it returns here.
      expect(rows.map((row) => row.holiday_break_id)).toEqual([null, null]);
    });

    it("returns them tagged with their break when asked", async () => {
      const rows = await planDates(adminAuth, "2030-10-01", "2030-10-31", true);
      expect(rows.map((row) => [row.session_date, row.holiday_break_id])).toEqual([
        ["2030-10-07", null],
        ["2030-10-14", breakA],
        ["2030-10-21", breakB],
        ["2030-10-28", null],
      ]);
    });

    it("answers anon exactly as it answers an admin", async () => {
      // The scope test for product_holiday_breaks' self-scoping classification,
      // and planned_session_dates' over the new tables.
      for (const include of [false, true]) {
        expect(await planDates(anon, "2030-09-01", "2030-12-31", include)).toEqual(
          await planDates(adminAuth, "2030-09-01", "2030-12-31", include),
        );
      }
      const asAnon = await anon.rpc("product_holiday_breaks", {
        p_product_id: CLUB,
        p_from: "2030-01-01",
        p_to: "2030-12-31",
      });
      const asAdmin = await adminAuth.rpc("product_holiday_breaks", {
        p_product_id: CLUB,
        p_from: "2030-01-01",
        p_to: "2030-12-31",
      });
      expect(asAnon.error).toBeNull();
      expect(asAnon.data).toEqual([
        { break_id: breakA, calendar_id: calendarA, start_date: "2030-10-14", end_date: "2030-10-18" },
        { break_id: breakB, calendar_id: calendarB, start_date: "2030-10-18", end_date: "2030-10-22" },
      ]);
      expect(asAdmin.data).toEqual(asAnon.data);
    });

    it("derives no session window on a holiday", async () => {
      const holiday = await admin.rpc("derive_group_session_window", {
        p_group_id: CLUB_GROUP,
        p_session_date: "2030-10-14",
      });
      expect(holiday.error).toBeNull();
      expect(holiday.data).toBeNull();
      const ordinary = await admin.rpc("derive_group_session_window", {
        p_group_id: CLUB_GROUP,
        p_session_date: "2030-10-07",
      });
      expect(ordinary.data).not.toBeNull();
    });

    it("counts a holiday as not running even with nothing stored on it", async () => {
      expect(await isCancelled(CLUB_GROUP, "2030-10-14")).toBe(true);
      expect(await isCancelled(CLUB_GROUP, "2030-10-07")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // What is stored on a holiday
  // -------------------------------------------------------------------------

  describe("a record on a date that becomes a holiday", () => {
    const DATE = "2030-09-09";

    it("is cancelled in effect, frozen and named to the partner API, and comes back when the break goes", async () => {
      const stored = await admin.from("group_sessions").insert({
        group_id: CLUB_GROUP,
        session_date: DATE,
        starts_at: `${DATE}T10:00:00Z`,
        ends_at: `${DATE}T11:00:00Z`,
        report: "We built a lighthouse.",
      });
      expect(stored.error).toBeNull();

      const calendar = await createCalendar("record", [
        { start_date: DATE, end_date: DATE, names: [{ locale: "en", name: "Strike day" }] },
      ]);
      await follow(CLUB, [calendarA, calendarB, calendar]);

      try {
        expect(await isCancelled(CLUB_GROUP, DATE)).toBe(true);

        // Frozen: the notes write meets the plan first, which no longer holds
        // the date, and the report mail is refused as a cancelled session.
        const notes = await adminAuth.rpc("set_group_session_notes", {
          p_group_id: CLUB_GROUP,
          p_session_date: DATE,
          p_report: "Should not land",
          p_gedu_note: "",
        });
        expect(notes.error?.code).toBe("23514");
        const claim = await adminAuth.rpc("claim_group_session_report_email", {
          p_group_id: CLUB_GROUP,
          p_session_date: DATE,
        });
        expect(claim.error?.code).toBe(SESSION_CANCELLED_SQLSTATE);

        const partner = await admin.rpc("get_session_cancellations_in_effect", {
          p_group_ids: [CLUB_GROUP],
        });
        expect(partner.error).toBeNull();
        expect(partner.data).toEqual([{ group_id: CLUB_GROUP, session_date: DATE }]);

        // The break goes: the record is a session again.
        const { error } = await adminAuth.rpc("update_holiday_calendar", {
          p_id: calendar,
          p_name: `${NAME_PREFIX} record`,
          p_breaks: [],
        });
        expect(error).toBeNull();

        expect(await isCancelled(CLUB_GROUP, DATE)).toBe(false);
        const after = await admin.rpc("get_session_cancellations_in_effect", {
          p_group_ids: [CLUB_GROUP],
        });
        expect(after.data).toEqual([]);
        const reopened = await adminAuth.rpc("claim_group_session_report_email", {
          p_group_id: CLUB_GROUP,
          p_session_date: DATE,
        });
        expect(reopened.error).toBeNull();
      } finally {
        await follow(CLUB, [calendarA, calendarB]);
        await admin.from("group_sessions").delete().eq("group_id", CLUB_GROUP);
      }
    });
  });

  describe("a substitution request on a date that becomes a holiday", () => {
    it("leaves the admin queue while the break stands, and returns when it goes", async () => {
      const date = dayOffset(5);
      const filed = await geduAuth.rpc("request_session_substitution", {
        p_group_id: DAILY_GROUP,
        p_session_date: date,
        p_reason: "other",
      });
      expect(filed.error).toBeNull();

      const queued = async () => {
        const { data, error } = await adminAuth.rpc("get_admin_substitution_requests");
        expect(error).toBeNull();
        return adminSubstitutionRequests
          .parse(data)
          .filter((row) => row.group_id === DAILY_GROUP && row.session_date === date);
      };
      expect(await queued()).toHaveLength(1);

      const calendar = await createCalendar("substitution", [
        { start_date: date, end_date: date, names: [{ locale: "en", name: "Day off" }] },
      ]);
      await follow(DAILY, [calendar]);
      expect(await queued()).toHaveLength(0);

      // Detaching the calendar is the other way a holiday stops being one.
      await follow(DAILY, []);
      expect(await queued()).toHaveLength(1);
    });
  });
});
