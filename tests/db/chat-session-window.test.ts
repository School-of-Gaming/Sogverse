import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { toZonedTime } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import { computeSessionWindow } from "@/lib/session-schedule";
import { ensureChatChannelResult } from "@/services/chat/chat.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * `ensure_chat_channel`'s window search, held to the TypeScript one.
 *
 * **There are two implementations of the same arithmetic and this file is what
 * stops them drifting.** The voice token route computes a session window in
 * TypeScript (`computeSessionWindow` over `getNextSessionStart`); the chat RPC
 * had to compute the same window in PL/pgSQL, because a participant-callable
 * guard cannot ask the caller which window is open — a client-supplied instant
 * would let a member mint an arbitrary read bound over the group's whole
 * history. The duplication was taken knowingly; this is the price paid for it.
 *
 * The shapes below are the ones `tests/unit/session-schedule.test.ts` uses: a
 * plain hour-long weekly slot, the same slot in a zone that observes DST, and a
 * slot that starts at 23:30 and runs past local midnight. What they cannot be
 * is the same *instants*: the RPC reads `now()` and there is no way to inject a
 * clock into PostgREST, so each case is re-anchored so that its window is open
 * at the moment the file runs, and the two implementations are then asked for
 * the same window and compared to the millisecond.
 *
 * **What that covers and what it does not.** Northern and southern zones are
 * both exercised on every run — one of Helsinki and Auckland is always in
 * summer time and the other always is not — so an offset bug cannot hide for
 * half the year, and the midnight case exercises the adjacent-day probe that
 * replaces the TypeScript search's previous-occurrence step. What is out of
 * reach is a run *at* a transition instant; the guarantee left there is that
 * both sides ask their platform's tz database for the same wall clock on the
 * same date, and a disagreement between Postgres and ICU would show up here as
 * soon as either moved.
 */

const PRODUCT_UTC = "00000000-0000-0000-0000-0000000007f1";
const PRODUCT_NORTH = "00000000-0000-0000-0000-0000000007f2";
const PRODUCT_SOUTH = "00000000-0000-0000-0000-0000000007f3";
const PRODUCT_MIDNIGHT = "00000000-0000-0000-0000-0000000007f4";
const ALL_PRODUCTS = [
  PRODUCT_UTC,
  PRODUCT_NORTH,
  PRODUCT_SOUTH,
  PRODUCT_MIDNIGHT,
];

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

/**
 * The weekday and wall clock an instant lands on in a zone.
 *
 * `toZonedTime` hands back a Date whose *local* getters read the wall clock in
 * `timezone` — the same contract `src/lib/enrollment.ts` depends on, and the
 * reason `getUTC*` must not be used here: those agree only on a UTC runtime and
 * land on the wrong weekday anywhere else.
 */
function slotFor(instant: Date, timezone: string) {
  const zoned = toZonedTime(instant, timezone);
  return {
    // schedule_slots.weekday is 0 = Monday; getDay() is 0 = Sunday.
    weekday: (zoned.getDay() + 6) % 7,
    startTime: `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`,
  };
}

/**
 * A fixed-offset zone in which `now` reads 00:xx.
 *
 * Whole-hour `Etc/GMT` zones exist precisely so a test can pin a local time of
 * day without waiting for the clock, and they observe no DST, so nothing in the
 * midnight case is confounded by a transition. **The POSIX sign is inverted**:
 * `Etc/GMT+5` is UTC−5, not UTC+5.
 */
function zoneWhereItIsJustAfterMidnight(now: Date): string {
  let offset = (24 - now.getUTCHours()) % 24;
  // Etc/GMT runs +12 … −14; keeping the offset inside ±12 keeps every hour of
  // the day expressible.
  if (offset > 12) offset -= 24;
  if (offset === 0) return "UTC";
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

interface WindowCase {
  name: string;
  productId: string;
  groupId: string;
  schedule: {
    day_of_week: number;
    start_time: string;
    timezone: string;
    duration_minutes: number;
  };
}

describe("ensure_chat_channel's window agrees with computeSessionWindow", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  /** One instant, shared by every case and by both implementations. */
  const now = new Date();
  const cases: WindowCase[] = [];

  async function seed(
    productId: string,
    name: string,
    timezone: string,
    weekday: number,
    startTime: string,
    durationMinutes: number,
  ): Promise<void> {
    await createTestProduct(admin, { id: productId, seatCount: 50, timezone });
    await createScheduleSlot(admin, productId, {
      weekday,
      startTime,
      durationMinutes,
    });
    const created = ok(
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: productId,
        p_added_groups: [{ tempId: "g", name, geduIds: [] }],
      }),
    );
    cases.push({
      name,
      productId,
      groupId: getStringRecord(created, "tempMap").g,
      schedule: {
        day_of_week: weekday,
        start_time: startTime,
        timezone,
        duration_minutes: durationMinutes,
      },
    });
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // Three ordinary hour-long slots, each started twenty minutes ago in its
    // own zone, so `now` sits mid-session with a comfortable margin either side
    // — the RPC's clock runs seconds later than this one and must land in the
    // same window.
    const started = new Date(now.getTime() - 20 * 60_000);

    const utc = slotFor(started, "UTC");
    await seed(PRODUCT_UTC, "UTC", "UTC", utc.weekday, utc.startTime, 60);

    const north = slotFor(started, "Europe/Helsinki");
    await seed(
      PRODUCT_NORTH,
      "North",
      "Europe/Helsinki",
      north.weekday,
      north.startTime,
      60,
    );

    // The southern hemisphere twin. Whenever Helsinki is on summer time
    // Auckland is not and the other way round, so every run exercises one zone
    // at each side of its own DST rule rather than whichever the calendar
    // happens to offer.
    const south = slotFor(started, "Pacific/Auckland");
    await seed(
      PRODUCT_SOUTH,
      "South",
      "Pacific/Auckland",
      south.weekday,
      south.startTime,
      60,
    );

    // The midnight case, and the one the SQL's adjacent-day probe exists for.
    // In this zone it is 00:xx, so a session that began at 23:30 YESTERDAY is
    // still running — the occurrence's local date is not today's, which is
    // exactly what a probe of today alone would miss.
    const midnightZone = zoneWhereItIsJustAfterMidnight(now);
    const zonedNow = toZonedTime(now, midnightZone);
    const todayWeekday = (zonedNow.getDay() + 6) % 7;
    await seed(
      PRODUCT_MIDNIGHT,
      "Midnight",
      midnightZone,
      // Yesterday, in Monday-is-zero terms.
      (todayWeekday + 6) % 7,
      "23:30",
      // Started 30 minutes before local midnight and running an hour past now.
      30 + zonedNow.getMinutes() + 60,
    );
  });

  afterAll(async () => {
    for (const entry of cases) {
      await admin.from("chat_channels").delete().eq("group_id", entry.groupId);
    }
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  it("every case's window is genuinely open, so the comparisons are not vacuous", () => {
    expect(cases).toHaveLength(4);
    for (const entry of cases) {
      expect(
        computeSessionWindow(entry.schedule, now).isOpen,
        `${entry.name}: the fixture schedule is not live, so nothing below is comparing anything`,
      ).toBe(true);
    }
  });

  it("the midnight case really does sit on the previous local date", () => {
    // The precondition the adjacent-day probe is being tested through. If the
    // zone arithmetic above ever stopped landing on 00:xx, the case would
    // quietly become a fourth ordinary same-day slot and prove nothing.
    const midnight = cases.find((entry) => entry.name === "Midnight");
    expect(midnight).toBeDefined();
    if (!midnight) return;

    const zonedNow = toZonedTime(now, midnight.schedule.timezone);
    expect(zonedNow.getHours()).toBe(0);

    const occurrenceStart = computeSessionWindow(midnight.schedule, now)
      .nextSessionStart;
    const occurrenceDay = toZonedTime(
      occurrenceStart,
      midnight.schedule.timezone,
    ).getDate();
    expect(occurrenceDay).not.toBe(zonedNow.getDate());
  });

  it.each([
    ["UTC"],
    ["North"],
    ["South"],
    ["Midnight"],
  ])("%s: SQL and TypeScript derive the same window instants", async (name) => {
    const entry = cases.find((candidate) => candidate.name === name);
    expect(entry).toBeDefined();
    if (!entry) return;

    const expected = computeSessionWindow(entry.schedule, now);
    const [channel] = ensureChatChannelResult.parse(
      ok(
        await adminAuth.rpc("ensure_chat_channel", {
          p_group_id: entry.groupId,
        }),
      ),
    );

    expect(
      new Date(channel.session_opens_at).toISOString(),
      `${name}: the SQL window opens somewhere the voice room does not`,
    ).toBe(expected.windowOpensAt.toISOString());
    expect(
      new Date(channel.session_ends_at).toISOString(),
      `${name}: the SQL window closes somewhere the voice room does not`,
    ).toBe(expected.windowClosesAt.toISOString());

    // The unique key is (group_id, session_opens_at), so agreeing on the open
    // instant is also what keeps a room and its chat on the same channel: a
    // disagreement here is not a cosmetic drift, it is two channels for one
    // session.
    expect(channel.group_id).toBe(entry.groupId);
  });
});
