import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { ensureChatChannelResult } from "@/services/chat/chat.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * `group_open_session_windows` — the one definition of "the session window
 * open now", which the voice token route and `ensure_chat_channel` both take
 * the first row of — and `ensure_chat_channel` reading it.
 *
 * The function takes the clock as an argument, so every case below is a fixed
 * instant: the DST transitions of a northern and a southern zone, a session
 * running past midnight, one whose lead-in starts the day before, a date
 * outside the product's term, a cancelled date and two overlapping windows.
 * The fixtures sit in 2030 and the answers do not depend on when this runs.
 * Only the last block reads the real clock, because `ensure_chat_channel` has
 * no clock argument of its own.
 */

/** UTC: the midnight, overlap, cancellation and term cases. */
const PRODUCT_UTC = "00000000-0000-0000-0000-0000000007f1";
/** Europe/Helsinki: the northern transitions. */
const PRODUCT_NORTH = "00000000-0000-0000-0000-0000000007f2";
/** Pacific/Auckland: the southern transitions. */
const PRODUCT_SOUTH = "00000000-0000-0000-0000-0000000007f3";
/** Europe/Helsinki with a slot at a wall clock the transitions skip and repeat. */
const PRODUCT_GAP = "00000000-0000-0000-0000-0000000007f4";
/** UTC, with a session in progress while the file runs. */
const PRODUCT_LIVE = "00000000-0000-0000-0000-0000000007e4";
const ALL_PRODUCTS = [
  PRODUCT_UTC,
  PRODUCT_NORTH,
  PRODUCT_SOUTH,
  PRODUCT_GAP,
  PRODUCT_LIVE,
];

const LEAD_IN_MS = VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES * 60_000;
const TAIL_MS = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

type Result<T> = { data: T; error: null } | { data: null; error: PostgrestError };

function ok<T>(result: Result<T>): T {
  if (result.error) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function iso(value: string): string {
  return new Date(value).toISOString();
}

interface Window {
  session_date: string;
  starts_at: string;
  opens_at: string;
  closes_at: string;
  cancelled: boolean;
}

describe("group_open_session_windows", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  const groups: Record<string, string> = {};

  async function seed(
    productId: string,
    options: { timezone: string; startDate: string; endDate: string | null },
    slots: Array<{ weekday: number; startTime: string; durationMinutes: number }>,
  ): Promise<void> {
    await createTestProduct(admin, { id: productId, seatCount: 50, ...options });
    for (const slot of slots) {
      await createScheduleSlot(admin, productId, slot);
    }
    const created = ok(
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: productId,
        p_added_groups: [{ tempId: "g", name: "Group", geduIds: [] }],
      }),
    );
    groups[productId] = getStringRecord(created, "tempMap").g;
  }

  async function cancel(productId: string, sessionDate: string): Promise<void> {
    ok(
      await admin.from("session_cancellations").insert({
        group_id: groups[productId],
        session_date: sessionDate,
        cancelled_by: TEST_IDS.ADMIN,
      }),
    );
  }

  /** The open windows of `productId`'s group at `at`, every margin checked. */
  async function windowsAt(productId: string, at?: string): Promise<Window[]> {
    const rows = ok(
      await admin.rpc("group_open_session_windows", {
        p_group_id: groups[productId],
        ...(at === undefined ? {} : { p_at: at }),
      }),
    );
    for (const row of rows) {
      // The margins are SQL literals and VOICE_CONFIG is what the client's
      // countdown reads: this is what holds the two together.
      expect(
        new Date(row.starts_at).getTime() - new Date(row.opens_at).getTime(),
        "the SQL lead-in is not VOICE_CONFIG's",
      ).toBe(LEAD_IN_MS);
      expect(
        new Date(row.closes_at).getTime() - new Date(row.ends_at).getTime(),
        "the SQL tail is not VOICE_CONFIG's",
      ).toBe(TAIL_MS);
    }
    return rows.map((row) => ({
      session_date: row.session_date,
      starts_at: iso(row.starts_at),
      opens_at: iso(row.opens_at),
      closes_at: iso(row.closes_at),
      cancelled: row.cancelled,
    }));
  }

  /** The single open window at `at`, as session date and start instant. */
  async function sessionAt(productId: string, at: string) {
    const rows = await windowsAt(productId, at);
    expect(rows, `expected exactly one open window at ${at}`).toHaveLength(1);
    return { date: rows[0].session_date, startsAt: rows[0].starts_at };
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // 2030-01-01 is a Tuesday. schedule_slots.weekday is 0 = Monday.
    await seed(
      PRODUCT_UTC,
      { timezone: "UTC", startDate: "2025-01-01", endDate: "2030-06-30" },
      [
        { weekday: 1, startTime: "23:30", durationMinutes: 90 }, // Tue, past midnight
        { weekday: 4, startTime: "00:02", durationMinutes: 30 }, // Fri, lead-in on Thu
        // A product has one slot per weekday, so two windows overlap across
        // midnight: Sunday's runs to 01:00 and Monday's opens at 00:25.
        { weekday: 6, startTime: "23:00", durationMinutes: 120 },
        { weekday: 0, startTime: "00:30", durationMinutes: 60 },
      ],
    );
    await seed(
      PRODUCT_NORTH,
      { timezone: "Europe/Helsinki", startDate: "2030-01-01", endDate: "2030-12-31" },
      [
        { weekday: 1, startTime: "14:00", durationMinutes: 60 },
        // Sunday 02:00 for three hours runs across both transition instants.
        { weekday: 6, startTime: "02:00", durationMinutes: 180 },
      ],
    );
    await seed(
      PRODUCT_SOUTH,
      { timezone: "Pacific/Auckland", startDate: "2030-01-01", endDate: "2030-12-31" },
      [
        { weekday: 1, startTime: "14:00", durationMinutes: 60 },
        { weekday: 6, startTime: "01:30", durationMinutes: 120 },
      ],
    );
    await seed(
      PRODUCT_GAP,
      { timezone: "Europe/Helsinki", startDate: "2030-01-01", endDate: "2030-12-31" },
      // 03:30 does not exist on 2030-03-31 in Helsinki and happens twice on
      // 2030-10-27.
      [{ weekday: 6, startTime: "03:30", durationMinutes: 60 }],
    );

    // A session that started twenty minutes ago and runs an hour, so its
    // window is open however long this file takes. The term started a week ago.
    const started = new Date(Date.now() - 20 * 60_000);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    await seed(
      PRODUCT_LIVE,
      { timezone: "UTC", startDate: weekAgo, endDate: null },
      [
        {
          // getUTCDay() is 0 = Sunday.
          weekday: (started.getUTCDay() + 6) % 7,
          startTime: `${pad(started.getUTCHours())}:${pad(started.getUTCMinutes())}`,
          durationMinutes: 60,
        },
      ],
    );

    // Monday 2030-03-04 is cancelled; Monday 2030-03-11 is not.
    await cancel(PRODUCT_UTC, "2030-03-04");
  });

  afterAll(async () => {
    const groupIds = Object.values(groups);
    await admin.from("chat_channels").delete().in("group_id", groupIds);
    await admin.from("session_cancellations").delete().in("group_id", groupIds);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  describe("the window's edges", () => {
    it("opens at the lead-in, inclusive, and closes after the tail, exclusive", async () => {
      // Tuesday 2030-03-05 23:30–01:00 UTC: the window is 23:25 to 01:05.
      expect(await windowsAt(PRODUCT_UTC, "2030-03-05T23:24:59.999Z")).toEqual([]);
      expect(await windowsAt(PRODUCT_UTC, "2030-03-05T23:25:00.000Z")).toHaveLength(1);
      expect(await windowsAt(PRODUCT_UTC, "2030-03-06T01:04:59.999Z")).toHaveLength(1);
      expect(await windowsAt(PRODUCT_UTC, "2030-03-06T01:05:00.000Z")).toEqual([]);
    });
  });

  describe("midnight", () => {
    it("keeps a session running past midnight on the date it started", async () => {
      expect(await windowsAt(PRODUCT_UTC, "2030-03-06T00:15:00.000Z")).toEqual([
        {
          session_date: "2030-03-05",
          starts_at: "2030-03-05T23:30:00.000Z",
          opens_at: "2030-03-05T23:25:00.000Z",
          closes_at: "2030-03-06T01:05:00.000Z",
          cancelled: false,
        },
      ]);
    });

    it("opens a small-hours session's window on the day before it", async () => {
      // Friday 2030-03-08 00:02: the lead-in starts 23:57 on Thursday.
      expect(await sessionAt(PRODUCT_UTC, "2030-03-07T23:58:00.000Z")).toEqual({
        date: "2030-03-08",
        startsAt: "2030-03-08T00:02:00.000Z",
      });
    });
  });

  describe("the term", () => {
    it("opens no window on a slot weekday after the term ends", async () => {
      // Tuesday 2030-06-25 is the last Tuesday of the term; 2030-07-02 is past it.
      expect(await windowsAt(PRODUCT_UTC, "2030-06-25T23:45:00.000Z")).toHaveLength(1);
      expect(await windowsAt(PRODUCT_UTC, "2030-07-02T23:45:00.000Z")).toEqual([]);
    });

    it("opens no window on a slot weekday before the term starts, even one running into it", async () => {
      // Tuesday 2024-12-31 23:30 would run into the term's first day, but the
      // session is dated the day before it.
      expect(await windowsAt(PRODUCT_UTC, "2025-01-01T00:15:00.000Z")).toEqual([]);
    });
  });

  describe("overlap and cancellation", () => {
    it("returns overlapping windows earliest-opening first", async () => {
      const rows = await windowsAt(PRODUCT_UTC, "2030-03-11T00:40:00.000Z");
      expect(rows.map((row) => [row.session_date, row.starts_at])).toEqual([
        ["2030-03-10", "2030-03-10T23:00:00.000Z"],
        ["2030-03-11", "2030-03-11T00:30:00.000Z"],
      ]);
      expect(rows.every((row) => !row.cancelled)).toBe(true);
    });

    it("marks a cancelled date's window cancelled rather than dropping it", async () => {
      // Monday 2030-03-04 is cancelled; the Sunday overlapping it is not.
      const rows = await windowsAt(PRODUCT_UTC, "2030-03-04T00:40:00.000Z");
      expect(rows.map((row) => [row.session_date, row.cancelled])).toEqual([
        ["2030-03-03", false],
        ["2030-03-04", true],
      ]);
    });
  });

  describe("Europe/Helsinki across its transitions", () => {
    // A Tuesday 14:00 session, mid-session, the weeks either side of each
    // transition: the instant moves with the offset, the wall clock does not.
    it.each([
      ["the week before spring-forward (EET)", "2030-03-26T12:30:00.000Z", "2030-03-26T12:00:00.000Z"],
      ["the week after spring-forward (EEST)", "2030-04-02T11:30:00.000Z", "2030-04-02T11:00:00.000Z"],
      ["the week before fall-back (EEST)", "2030-10-22T11:30:00.000Z", "2030-10-22T11:00:00.000Z"],
      ["the week after fall-back (EET)", "2030-10-29T12:30:00.000Z", "2030-10-29T12:00:00.000Z"],
    ])("%s", async (_name, at, startsAt) => {
      expect(await sessionAt(PRODUCT_NORTH, at)).toEqual({
        date: at.slice(0, 10),
        startsAt,
      });
    });

    it("keeps a session's real length across spring-forward", async () => {
      // Sunday 2030-03-31 02:00 EET is 00:00Z; three real hours later it is
      // 06:00 on the wall clock, not 05:00. Read at 05:30 EEST.
      const [row] = await windowsAt(PRODUCT_NORTH, "2030-03-31T02:30:00.000Z");
      expect(row).toMatchObject({
        session_date: "2030-03-31",
        starts_at: "2030-03-31T00:00:00.000Z",
        closes_at: "2030-03-31T03:05:00.000Z",
      });
    });

    it("dates a fall-back session by its local day, though it starts on the UTC day before", async () => {
      // Sunday 2030-10-27 02:00 EEST is 23:00Z on the 26th; it runs until 02:00Z.
      const [row] = await windowsAt(PRODUCT_NORTH, "2030-10-27T01:30:00.000Z");
      expect(row).toMatchObject({
        session_date: "2030-10-27",
        starts_at: "2030-10-26T23:00:00.000Z",
        closes_at: "2030-10-27T02:05:00.000Z",
      });
    });

    it("resolves a wall clock the transitions skip or repeat as Postgres does", async () => {
      // The ordinary Sundays either side of each transition first.
      expect(await sessionAt(PRODUCT_GAP, "2030-03-24T01:45:00.000Z")).toEqual({
        date: "2030-03-24",
        startsAt: "2030-03-24T01:30:00.000Z", // 03:30 EET
      });
      expect(await sessionAt(PRODUCT_GAP, "2030-04-07T00:45:00.000Z")).toEqual({
        date: "2030-04-07",
        startsAt: "2030-04-07T00:30:00.000Z", // 03:30 EEST
      });
      // 03:30 on 2030-03-31 does not exist: Postgres reads it at the offset in
      // force before the gap, EET, which is 04:30 EEST.
      expect(await sessionAt(PRODUCT_GAP, "2030-03-31T01:45:00.000Z")).toEqual({
        date: "2030-03-31",
        startsAt: "2030-03-31T01:30:00.000Z",
      });
      // 03:30 on 2030-10-27 happens twice: Postgres takes standard time, EET,
      // the later of the two.
      expect(await sessionAt(PRODUCT_GAP, "2030-10-27T01:45:00.000Z")).toEqual({
        date: "2030-10-27",
        startsAt: "2030-10-27T01:30:00.000Z",
      });
    });
  });

  describe("Pacific/Auckland across its transitions", () => {
    it.each([
      ["the week before DST ends (NZDT)", "2030-04-02T01:30:00.000Z", "2030-04-02T01:00:00.000Z"],
      ["the week after DST ends (NZST)", "2030-04-09T02:30:00.000Z", "2030-04-09T02:00:00.000Z"],
      ["the week before DST starts (NZST)", "2030-09-24T02:30:00.000Z", "2030-09-24T02:00:00.000Z"],
      ["the week after DST starts (NZDT)", "2030-10-01T01:30:00.000Z", "2030-10-01T01:00:00.000Z"],
    ])("%s", async (_name, at, startsAt) => {
      expect(await sessionAt(PRODUCT_SOUTH, at)).toEqual({
        date: at.slice(0, 10),
        startsAt,
      });
    });

    it("keeps a session's real length as DST ends, dated by its local day", async () => {
      // Sunday 2030-04-07 01:30 NZDT is 12:30Z on the 6th; two real hours on,
      // the clock has gone back and reads 02:30 NZST.
      const [row] = await windowsAt(PRODUCT_SOUTH, "2030-04-06T14:20:00.000Z");
      expect(row).toMatchObject({
        session_date: "2030-04-07",
        starts_at: "2030-04-06T12:30:00.000Z",
        closes_at: "2030-04-06T14:35:00.000Z",
      });
    });

    it("keeps a session's real length as DST starts", async () => {
      // Sunday 2030-09-29 01:30 NZST is 13:30Z on the 28th; it ends at 15:30Z,
      // 04:30 NZDT on the wall clock.
      const [row] = await windowsAt(PRODUCT_SOUTH, "2030-09-28T15:20:00.000Z");
      expect(row).toMatchObject({
        session_date: "2030-09-29",
        starts_at: "2030-09-28T13:30:00.000Z",
        closes_at: "2030-09-28T15:35:00.000Z",
      });
    });
  });

  describe("ensure_chat_channel reads it", () => {
    it("defaults the clock to now", async () => {
      expect(await windowsAt(PRODUCT_LIVE)).toHaveLength(1);
    });

    it("materializes the channel on the open window's instants", async () => {
      const [window] = await windowsAt(PRODUCT_LIVE);
      const [channel] = ensureChatChannelResult.parse(
        ok(
          await adminAuth.rpc("ensure_chat_channel", {
            p_group_id: groups[PRODUCT_LIVE],
          }),
        ),
      );

      // The channel's key is (group, opening instant), so agreeing on the
      // opening is what keeps a voice room and its chat on one channel.
      expect(iso(channel.session_opens_at)).toBe(window.opens_at);
      expect(iso(channel.session_ends_at)).toBe(window.closes_at);
    });

    it("opens no chat on a cancelled session", async () => {
      const [window] = await windowsAt(PRODUCT_LIVE);
      await cancel(PRODUCT_LIVE, window.session_date);
      try {
        expect((await windowsAt(PRODUCT_LIVE))[0]?.cancelled).toBe(true);

        const { error } = await adminAuth.rpc("ensure_chat_channel", {
          p_group_id: groups[PRODUCT_LIVE],
        });
        expect(error?.code).toBe("P0002");
      } finally {
        await admin
          .from("session_cancellations")
          .delete()
          .eq("group_id", groups[PRODUCT_LIVE]);
      }
    });
  });
});
