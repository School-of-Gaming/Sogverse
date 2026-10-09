import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PlannedSession } from "@/lib/planned-sessions";
import {
  geduGroupFeed,
  traineeGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { adminProductSessions } from "@/services/admin-sessions/admin-sessions.contracts";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import {
  geduAssignedProduct,
  traineeAssignedProduct,
} from "@/services/assignments/assignments.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * The plan on the session documents: every document a session list is drawn
 * from carries `planned_sessions`, and the group-scoped ones
 * `final_session_date`.
 *
 * DATED is a club of four Mondays in January 2030 with two groups, the first of
 * which cancelled the last Monday — so its final session is the one before,
 * while the other group's is the last. OPEN is an open-ended daily club that
 * started a month ago, whose one group cancelled the day after tomorrow: the
 * product's horizon is the ninth date from yesterday on, the group's one later.
 * GEDU teaches DATED's first group and holds a trainee seat on OPEN's group;
 * CUSTOMER's GAMER sits in OPEN's group, on a subscription the tests move
 * between active and cancelling.
 *
 * Every document parses through its own contract, so the new members are held
 * to the wire shape as well as to their values.
 */

const DATED = "00000000-0000-0000-0000-000000000860";
const DATED_GROUP = "00000000-0000-0000-0000-000000000861";
const DATED_GROUP_2 = "00000000-0000-0000-0000-000000000862";
const OPEN = "00000000-0000-0000-0000-000000000863";
const OPEN_GROUP = "00000000-0000-0000-0000-000000000864";

const ALL_PRODUCTS = [DATED, OPEN];
const ALL_GROUPS = [DATED_GROUP, DATED_GROUP_2, OPEN_GROUP];

/** A UTC calendar date `offset` days from now; the products all run in UTC. */
function utcDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  )
    .toISOString()
    .slice(0, 10);
}

/** Every calendar date from `from` to `to`, both inclusive, UTC-pinned. */
function everyDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let day = new Date(`${from}T00:00:00.000Z`);
    day.toISOString().slice(0, 10) <= to;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

const OPEN_START = utcDate(-30);

/** January 2030's Mondays at 10:00 UTC, for an hour, as the documents carry them. */
const DATED_PLAN = ["2030-01-07", "2030-01-14", "2030-01-21", "2030-01-28"].map(
  (date) => ({
    date,
    startsAt: new Date(`${date}T10:00:00.000Z`),
    endsAt: new Date(`${date}T11:00:00.000Z`),
    cancelled: false,
  }),
);

/** `date` stepped by `days`, UTC-pinned. */
function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * Asserts an open-ended daily plan runs, every day at 23:00 for an hour, from
 * OPEN's start to `horizon` — or to the day before it, the horizon the
 * database computed if the run crossed midnight between the read and this
 * check.
 */
function expectDailyPlanTo(plan: PlannedSession[], horizon: string) {
  const last = plan.at(-1)?.date ?? "";
  expect([horizon, addDays(horizon, -1)]).toContain(last);
  expect(plan.map((session) => session.date)).toEqual(everyDay(OPEN_START, last));
  for (const session of plan) {
    expect(session.startsAt.toISOString()).toBe(`${session.date}T23:00:00.000Z`);
    expect(session.endsAt.toISOString()).toBe(`${addDays(session.date, 1)}T00:00:00.000Z`);
    expect(session.cancelled).toBe(false);
  }
}

describe("the session documents carry the plan", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let participationId = "";

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, customerAuth, geduAuth] = await Promise.all([
      createAuthenticatedClient(TEST_CREDENTIALS.ADMIN.email, TEST_CREDENTIALS.ADMIN.password),
      createAuthenticatedClient(TEST_CREDENTIALS.CUSTOMER.email, TEST_CREDENTIALS.CUSTOMER.password),
      createAuthenticatedClient(TEST_CREDENTIALS.GEDU.email, TEST_CREDENTIALS.GEDU.password),
    ]);

    await deleteTestProducts(admin, ALL_PRODUCTS);

    await createTestProduct(admin, {
      id: DATED,
      seatCount: null,
      startDate: "2030-01-07",
      endDate: "2030-01-28",
    });
    await createScheduleSlot(admin, DATED, { weekday: 0, startTime: "10:00", durationMinutes: 60 });

    await createTestProduct(admin, { id: OPEN, seatCount: null, startDate: OPEN_START });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, OPEN, { weekday, startTime: "23:00", durationMinutes: 60 });
    }

    const groups = await admin.from("product_groups").insert([
      { id: DATED_GROUP, product_id: DATED, name: "Dated one" },
      { id: DATED_GROUP_2, product_id: DATED, name: "Dated two" },
      { id: OPEN_GROUP, product_id: OPEN, name: "Open" },
    ]);
    expect(groups.error).toBeNull();

    const assignment = await admin.from("gedu_group_assignments").insert({
      group_id: DATED_GROUP,
      gedu_id: TEST_IDS.GEDU,
      product_id: DATED,
    });
    expect(assignment.error).toBeNull();
    const trainee = await admin.from("gedu_group_trainees").insert({
      group_id: OPEN_GROUP,
      gedu_id: TEST_IDS.GEDU,
      product_id: OPEN,
    });
    expect(trainee.error).toBeNull();

    const cancellations = await admin.from("session_cancellations").insert([
      { group_id: DATED_GROUP, session_date: "2030-01-28", cancelled_by: TEST_IDS.ADMIN },
      { group_id: OPEN_GROUP, session_date: utcDate(2), cancelled_by: TEST_IDS.ADMIN },
    ]);
    expect(cancellations.error).toBeNull();

    const seat = await admin
      .from("participations")
      .insert({
        product_id: OPEN,
        group_id: OPEN_GROUP,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();
    expect(seat.error).toBeNull();
    participationId = seat.data?.id ?? "";

    const subscription = await admin.from("family_subscriptions").insert({
      participation_id: participationId,
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: "sub_session_documents_plan",
      stripe_customer_id: "cus_session_documents_plan",
      currency: "eur",
      status: "active",
      current_period_end: `${utcDate(40)}T12:00:00.000Z`,
    });
    expect(subscription.error).toBeNull();
  });

  afterAll(async () => {
    await admin.from("session_cancellations").delete().in("group_id", ALL_GROUPS);
    await admin.from("gedu_group_trainees").delete().in("product_id", ALL_PRODUCTS);
    await admin.from("gedu_group_assignments").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  describe("on a dated product", () => {
    it("the gedu group feed plans the whole run and names the group's final session", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: DATED_GROUP,
      });
      expect(error).toBeNull();
      const feed = geduGroupFeed.parse(data);
      // The cancelled last Monday stays in the plan: the cancellation is laid
      // over it from the document's own list.
      expect(feed.planned_sessions).toEqual(DATED_PLAN);
      expect(feed.cancellations.map((c) => c.session_date)).toEqual(["2030-01-28"]);
      expect(feed.final_session_date).toBe("2030-01-21");
    });

    it("the gedu product door carries the same plan and its group's final session", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: DATED,
      });
      expect(error).toBeNull();
      const door = geduAssignedProduct.parse(data);
      expect(door.planned_sessions).toEqual(DATED_PLAN);
      expect(door.final_session_date).toBe("2030-01-21");
    });

    it("the admin document plans the product once and names each group's final session", async () => {
      const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: DATED,
      });
      expect(error).toBeNull();
      const document = adminProductSessions.parse(data);
      expect(document.planned_sessions).toEqual(DATED_PLAN);
      expect(
        Object.fromEntries(document.groups.map((g) => [g.id, g.final_session_date])),
      ).toEqual({ [DATED_GROUP]: "2030-01-21", [DATED_GROUP_2]: "2030-01-28" });
    });
  });

  describe("on an open-ended product", () => {
    it("the gedu group feed plans to the product's horizon and has no final session", async () => {
      const { data, error } = await adminAuth.rpc("get_gedu_group_feed", {
        p_group_id: OPEN_GROUP,
      });
      expect(error).toBeNull();
      const feed = geduGroupFeed.parse(data);
      // The product's horizon ignores the group's cancellation: yesterday plus
      // eight. The cancelled date is still planned.
      expectDailyPlanTo(feed.planned_sessions, utcDate(7));
      expect(feed.planned_sessions.map((s) => s.date)).toContain(utcDate(2));
      expect(feed.final_session_date).toBeNull();
    });

    it("the trainee's feed and door carry the same plan", async () => {
      const feedRead = await geduAuth.rpc("get_trainee_group_feed", {
        p_group_id: OPEN_GROUP,
      });
      expect(feedRead.error).toBeNull();
      const feed = traineeGroupFeed.parse(feedRead.data);
      expectDailyPlanTo(feed.planned_sessions, utcDate(7));
      expect(feed.final_session_date).toBeNull();

      const doorRead = await geduAuth.rpc("get_trainee_assigned_product", {
        p_product_id: OPEN,
      });
      expect(doorRead.error).toBeNull();
      const door = traineeAssignedProduct.parse(doorRead.data);
      expect(door.planned_sessions).toEqual(feed.planned_sessions);
      expect(door.final_session_date).toBeNull();
    });

    it("the admin document plans to the product's horizon, with no final session on the group", async () => {
      const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: OPEN,
      });
      expect(error).toBeNull();
      const document = adminProductSessions.parse(data);
      expectDailyPlanTo(document.planned_sessions, utcDate(7));
      expect(document.groups.map((g) => g.final_session_date)).toEqual([null]);
    });
  });

  describe("the family document", () => {
    async function familyPlan() {
      const { data, error } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: participationId,
      });
      expect(error).toBeNull();
      return familyProductFeed.parse(data).planned_sessions;
    }

    async function setSubscriptionStatus(status: "active" | "canceling") {
      const { error } = await admin
        .from("family_subscriptions")
        .update({ status })
        .eq("participation_id", participationId);
      expect(error).toBeNull();
    }

    it("plans to its own group's horizon, past the date the group cancelled", async () => {
      await setSubscriptionStatus("active");
      // Yesterday plus eight, one further for the cancelled day after tomorrow.
      expectDailyPlanTo(await familyPlan(), utcDate(8));
    });

    it("plans a cancelled membership through the date it is paid until", async () => {
      await setSubscriptionStatus("canceling");
      try {
        expectDailyPlanTo(await familyPlan(), utcDate(40));
      } finally {
        await setSubscriptionStatus("active");
      }
    });
  });
});
