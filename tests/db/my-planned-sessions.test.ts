import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { myPlannedSessions } from "@/services/participations/participations.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * `get_my_planned_sessions`: the plan behind the family My SOG cards.
 *
 * What the cards lean on, in order: the read answers only for the caller's own
 * seats, in either role; each seat's span starts the day before the earlier of
 * today and the day the seat became the family's, and ends at the plan's
 * horizon for its group raised to a cancelled membership's paid-through date;
 * a date the seat's group cancelled is flagged, and never on an unplaced seat;
 * and a seat placed just now still has the two sessions its prep window counts.
 *
 * Layout, all in UTC so a calendar date is the date the assertions read:
 *
 * - DAILY runs a 23:00 hour every day, open-ended, started thirty days ago.
 *   The seeded gamer holds a seat in its group, bought and placed twenty days
 *   ago, so the span reaches back past today.
 * - WEEKLY runs one 23:00 hour a week on tomorrow's weekday, open-ended. The
 *   seeded gamer holds a seat placed just now, on a membership the parent has
 *   cancelled with paid access running twelve weeks out — past the plan's
 *   eight-session horizon. The second family holds an unplaced seat on it.
 *
 * Own ids 870–877, registered in product-helpers.ts.
 */

const DAILY = "00000000-0000-0000-0000-000000000870";
const DAILY_GROUP = "00000000-0000-0000-0000-000000000871";
const DAILY_SEAT = "00000000-0000-0000-0000-000000000872";
const WEEKLY = "00000000-0000-0000-0000-000000000873";
const WEEKLY_GROUP = "00000000-0000-0000-0000-000000000874";
const WEEKLY_SEAT = "00000000-0000-0000-0000-000000000875";
const UNPLACED_SEAT = "00000000-0000-0000-0000-000000000876";
const ALL_PRODUCTS = [DAILY, WEEKLY];

/** `YYYY-MM-DD`, `offset` days from today. Every product here runs in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday, matching `schedule_slots.weekday`. */
function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const TODAY = dayOffset(0);
const TOMORROW = dayOffset(1);
/** Twelve weeks after tomorrow: the WEEKLY membership's paid-through date. */
const PAID_THROUGH = dayOffset(85);

describe("get_my_planned_sessions", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let stranger: SupabaseClient<Database>;
  /** When WEEKLY_SEAT became the family's — the instant it was placed. */
  let weeklySeatMoment: Date;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    stranger = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    await createTestProduct(admin, {
      id: DAILY,
      seatCount: null,
      startDate: dayOffset(-30),
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, DAILY, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }

    await createTestProduct(admin, {
      id: WEEKLY,
      seatCount: null,
      startDate: dayOffset(-30),
    });
    await createScheduleSlot(admin, WEEKLY, {
      weekday: weekdayOf(TOMORROW),
      startTime: "23:00",
      durationMinutes: 60,
    });

    const groups = await admin.from("product_groups").insert([
      { id: DAILY_GROUP, product_id: DAILY, name: "Planned daily cohort" },
      { id: WEEKLY_GROUP, product_id: WEEKLY, name: "Planned weekly cohort" },
    ]);
    expect(groups.error).toBeNull();

    const twentyDaysAgo = `${dayOffset(-20)}T09:00:00.000Z`;
    // Its own insert: a bulk insert sends every row the union of the rows'
    // columns, and a NULL signed_up_at on the others is refused.
    const dailySeat = await admin.from("participations").insert({
      id: DAILY_SEAT,
      product_id: DAILY,
      group_id: DAILY_GROUP,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      signed_up_at: twentyDaysAgo,
    });
    expect(dailySeat.error).toBeNull();
    const seats = await admin.from("participations").insert([
      {
        id: WEEKLY_SEAT,
        product_id: WEEKLY,
        group_id: WEEKLY_GROUP,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        id: UNPLACED_SEAT,
        product_id: WEEKLY,
        group_id: null,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER_2,
        status: "active",
      },
    ]);
    expect(seats.error).toBeNull();
    // The stamping trigger sets group_joined_at to now(); DAILY_SEAT was
    // placed the day it was bought. An UPDATE that does not name group_id
    // leaves the trigger silent.
    const joined = await admin
      .from("participations")
      .update({ group_joined_at: twentyDaysAgo })
      .eq("id", DAILY_SEAT);
    expect(joined.error).toBeNull();

    const weeklySeat = await admin
      .from("participations")
      .select("signed_up_at, group_joined_at")
      .eq("id", WEEKLY_SEAT)
      .single();
    expect(weeklySeat.error).toBeNull();
    weeklySeatMoment = new Date(
      Math.max(
        Date.parse(weeklySeat.data!.signed_up_at),
        Date.parse(weeklySeat.data!.group_joined_at!),
      ),
    );

    const sub = await admin.from("family_subscriptions").insert({
      customer_id: TEST_IDS.CUSTOMER,
      participation_id: WEEKLY_SEAT,
      stripe_subscription_id: "sub_mps_weekly",
      stripe_customer_id: "cus_mps_weekly",
      stripe_price_id: "price_mps_weekly",
      currency: "eur",
      status: "canceling",
      current_period_end: `${PAID_THROUGH}T12:00:00.000Z`,
    });
    expect(sub.error).toBeNull();
  });

  afterAll(async () => {
    await admin
      .from("session_cancellations")
      .delete()
      .in("group_id", [DAILY_GROUP, WEEKLY_GROUP]);
    // Participations go first inside the helper, and their subscriptions
    // cascade with them.
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  beforeEach(async () => {
    await admin
      .from("session_cancellations")
      .delete()
      .in("group_id", [DAILY_GROUP, WEEKLY_GROUP]);
  });

  /** The caller's plan rows for one seat, parsed through the app's contract. */
  async function planFor(
    client: SupabaseClient<Database>,
    participationId: string,
  ) {
    const { data, error } = await client.rpc("get_my_planned_sessions");
    expect(error).toBeNull();
    return myPlannedSessions
      .parse(data)
      .filter((row) => row.participationId === participationId)
      .map((row) => row.session);
  }

  async function horizon(productId: string, groupId: string | null) {
    const { data, error } = await admin.rpc("session_plan_horizon", {
      p_product_id: productId,
      p_group_id: groupId ?? undefined,
    });
    expect(error).toBeNull();
    return data;
  }

  it("answers the seat's child and paying parent alike, and another family not at all", async () => {
    const asGamer = await planFor(gamerAuth, DAILY_SEAT);
    const asParent = await planFor(customerAuth, DAILY_SEAT);
    expect(asGamer.length).toBeGreaterThan(0);
    expect(asParent).toEqual(asGamer);

    expect(await planFor(stranger, DAILY_SEAT)).toEqual([]);
    expect(await planFor(stranger, WEEKLY_SEAT)).toEqual([]);
    // The other direction: the second family's own unplaced seat is theirs,
    // and the first family never sees it.
    expect((await planFor(stranger, UNPLACED_SEAT)).length).toBeGreaterThan(0);
    expect(await planFor(customerAuth, UNPLACED_SEAT)).toEqual([]);
  });

  it("spans from the day before the seat became theirs to the group's horizon", async () => {
    const plan = await planFor(customerAuth, DAILY_SEAT);
    const dates = plan.map((session) => session.date);

    // Placed twenty days ago, so the span opens the day before that rather
    // than the day before today.
    expect(dates[0]).toBe(dayOffset(-21));
    expect(dates.at(-1)).toBe(await horizon(DAILY, DAILY_GROUP));
    // Every day in between, once, soonest first: the club runs daily.
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    expect(plan.every((session) => !session.cancelled)).toBe(true);
  });

  it("flags the dates the seat's group cancelled, and reads past them to the horizon", async () => {
    const before = await horizon(DAILY, DAILY_GROUP);
    const cancelled = await adminAuth.rpc("cancel_session", {
      p_group_id: DAILY_GROUP,
      p_session_date: TOMORROW,
    });
    expect(cancelled.error).toBeNull();

    const plan = await planFor(gamerAuth, DAILY_SEAT);
    expect(
      plan.filter((session) => session.cancelled).map((s) => s.date),
    ).toEqual([TOMORROW]);
    // The horizon skips the group's cancelled session, so the span reaches one
    // day further and the card still has eight sessions that run.
    const after = await horizon(DAILY, DAILY_GROUP);
    expect(after).not.toBe(before);
    expect(plan.at(-1)?.date).toBe(after);
  });

  it("never flags an unplaced seat, whatever another group cancelled", async () => {
    const cancelled = await adminAuth.rpc("cancel_session", {
      p_group_id: WEEKLY_GROUP,
      p_session_date: TOMORROW,
    });
    expect(cancelled.error).toBeNull();

    const placed = await planFor(customerAuth, WEEKLY_SEAT);
    expect(placed.find((s) => s.date === TOMORROW)?.cancelled).toBe(true);

    const unplaced = await planFor(stranger, UNPLACED_SEAT);
    expect(unplaced.find((s) => s.date === TOMORROW)?.cancelled).toBe(false);
    expect(unplaced.every((session) => !session.cancelled)).toBe(true);
    // No group, no group horizon: the product's own.
    expect(unplaced.at(-1)?.date).toBe(await horizon(WEEKLY, null));
  });

  it("reaches a cancelled membership's paid-through date beyond the eighth session", async () => {
    const plan = await planFor(customerAuth, WEEKLY_SEAT);
    const upcoming = plan.filter((session) => session.date >= TODAY);

    // Weekly from tomorrow to twelve weeks after it: thirteen sessions, where
    // the plain horizon stops at the eighth.
    expect(upcoming).toHaveLength(13);
    expect(upcoming[0].date).toBe(TOMORROW);
    expect(plan.at(-1)?.date).toBe(PAID_THROUGH);
    expect(PAID_THROUGH > (await horizon(WEEKLY, WEEKLY_GROUP))!).toBe(true);
    // The last date is the paid-through DAY: its 23:00 session starts after
    // the 12:00 instant access ends, and the card filters it out by instant.
    expect(plan.at(-1)!.startsAt.getTime()).toBeGreaterThan(
      Date.parse(`${PAID_THROUGH}T12:00:00.000Z`),
    );
  });

  it("holds the prep window's two sessions for a seat placed just now", async () => {
    const plan = await planFor(gamerAuth, WEEKLY_SEAT);

    // Placed today, so nothing from before yesterday: the first weekly session
    // in the span is tomorrow's.
    expect(plan[0].date).toBe(TOMORROW);
    const theirs = plan.filter(
      (session) => session.startsAt.getTime() > weeklySeatMoment.getTime(),
    );
    expect(theirs.length).toBeGreaterThanOrEqual(2);
  });
});
