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
import {
  createAdminTestClient,
  createAuthenticatedClient,
  dbInterval,
  dbNow,
  utcDatesThrough,
  utcDayOffset,
} from "./helpers";
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
 * started a month ago, each session ending at midnight, so today's is the first
 * that has not ended. Its first group cancelled the day after tomorrow, so that
 * group's horizon is the eighth session from today on that it has not
 * cancelled, today plus eight; its second group cancelled ten days running from
 * today, so its next running session is ten days away and its horizon
 * seventeen. GEDU teaches DATED's first group and holds a trainee seat on OPEN's group;
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
const OPEN_GROUP_2 = "00000000-0000-0000-0000-000000000865";

const ALL_PRODUCTS = [DATED, OPEN];
const ALL_GROUPS = [DATED_GROUP, DATED_GROUP_2, OPEN_GROUP, OPEN_GROUP_2];

/**
 * The database's clock, read when the file loads: the dates below are built
 * then, and they count from the database's today, the one its functions judge
 * against.
 */
const DB_NOW = await dbNow();

/** The ten days, from today, that OPEN's second group cancelled. */
const OPEN_GROUP_2_CANCELLED = Array.from({ length: 10 }, (_, offset) => utcDayOffset(DB_NOW, offset));

const OPEN_START = utcDayOffset(DB_NOW, -30);

/** January 2030's Mondays at 10:00 UTC, for an hour, as the documents carry them. */
const DATED_PLAN = ["2030-01-07", "2030-01-14", "2030-01-21", "2030-01-28"].map(
  (date) => ({
    date,
    startsAt: new Date(`${date}T10:00:00.000Z`),
    endsAt: new Date(`${date}T11:00:00.000Z`),
    cancelled: false,
  }),
);

/**
 * Asserts an open-ended daily plan runs, every day at 23:00 for an hour, from
 * OPEN's start to one of `horizons`.
 *
 * A horizon counting from today moves when midnight passes, since midnight
 * ends the day's session and the eighth that has not ended is then a day
 * later. Such a plan is read inside `dbInterval` and passed the horizon for
 * each clock read, one date unless midnight passed during the read. A horizon
 * that no midnight moves — beyond a run of cancelled days, or a paid-until
 * date — is passed alone.
 */
function expectDailyPlanTo(plan: PlannedSession[], horizons: string[]) {
  const last = plan.at(-1)?.date ?? "";
  expect(horizons).toContain(last);
  expect(plan.map((session) => session.date)).toEqual(utcDatesThrough(OPEN_START, last));
  for (const session of plan) {
    const nextDay = utcDayOffset(new Date(`${session.date}T00:00:00.000Z`), 1);
    expect(session.startsAt.toISOString()).toBe(`${session.date}T23:00:00.000Z`);
    expect(session.endsAt.toISOString()).toBe(`${nextDay}T00:00:00.000Z`);
    expect(session.cancelled).toBe(false);
  }
}

/**
 * OPEN_GROUP's horizon on each clock read's day: today plus seven, one further
 * for the day the group cancelled.
 */
function openGroupHorizons(reads: Date[]): string[] {
  return reads.map((read) => utcDayOffset(read, 8));
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
      { id: OPEN_GROUP_2, product_id: OPEN, name: "Open two" },
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
      { group_id: OPEN_GROUP, session_date: utcDayOffset(DB_NOW, 2), cancelled_by: TEST_IDS.ADMIN },
      ...OPEN_GROUP_2_CANCELLED.map((session_date) => ({
        group_id: OPEN_GROUP_2,
        session_date,
        cancelled_by: TEST_IDS.ADMIN,
      })),
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
      current_period_end: `${utcDayOffset(DB_NOW, 40)}T12:00:00.000Z`,
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
    it("the gedu group feed plans to its group's horizon and has no final session", async () => {
      const {
        result: { data, error },
        reads,
      } = await dbInterval(async () =>
        adminAuth.rpc("get_gedu_group_feed", { p_group_id: OPEN_GROUP }),
      );
      expect(error).toBeNull();
      const feed = geduGroupFeed.parse(data);
      // The cancelled day after tomorrow is still planned.
      expectDailyPlanTo(feed.planned_sessions, openGroupHorizons(reads));
      expect(feed.planned_sessions.map((s) => s.date)).toContain(utcDayOffset(DB_NOW, 2));
      expect(feed.final_session_date).toBeNull();
    });

    it("the gedu group feed of a group that cancelled many dates ahead still holds its next running session", async () => {
      const { data, error } = await adminAuth.rpc("get_gedu_group_feed", {
        p_group_id: OPEN_GROUP_2,
      });
      expect(error).toBeNull();
      const feed = geduGroupFeed.parse(data);
      // Ten cancelled days, then eight that run: the first of them, ten days
      // away, is inside, and the plan reaches the eighth. A midnight only eats
      // into the cancelled days, so the eighth stays where it is.
      expectDailyPlanTo(feed.planned_sessions, [utcDayOffset(DB_NOW, 17)]);
      expect(feed.planned_sessions.map((s) => s.date)).toContain(utcDayOffset(DB_NOW, 10));
    });

    it("the trainee's feed and door carry the same plan", async () => {
      const feedRead = await dbInterval(async () =>
        geduAuth.rpc("get_trainee_group_feed", { p_group_id: OPEN_GROUP }),
      );
      expect(feedRead.result.error).toBeNull();
      const feed = traineeGroupFeed.parse(feedRead.result.data);
      expectDailyPlanTo(feed.planned_sessions, openGroupHorizons(feedRead.reads));
      expect(feed.final_session_date).toBeNull();

      // A read of its own, so judged against its own clock reads rather than
      // compared with the feed's: midnight can fall between the two.
      const doorRead = await dbInterval(async () =>
        geduAuth.rpc("get_trainee_assigned_product", { p_product_id: OPEN }),
      );
      expect(doorRead.result.error).toBeNull();
      const door = traineeAssignedProduct.parse(doorRead.result.data);
      expectDailyPlanTo(door.planned_sessions, openGroupHorizons(doorRead.reads));
      expect(door.final_session_date).toBeNull();
    });

    it("the admin document plans to the furthest group's horizon, with no final session on any group", async () => {
      const { data, error } = await adminAuth.rpc("get_admin_product_sessions", {
        p_product_id: OPEN,
      });
      expect(error).toBeNull();
      const document = adminProductSessions.parse(data);
      // The second group's horizon, past the first group's and the product's
      // on either side of a midnight.
      expectDailyPlanTo(document.planned_sessions, [utcDayOffset(DB_NOW, 17)]);
      expect(document.groups.map((g) => g.final_session_date)).toEqual([null, null]);
    });
  });

  describe("the family document", () => {
    /** The family's plan, with the database's clock read on either side of it. */
    async function familyPlan() {
      const {
        result: { data, error },
        reads,
      } = await dbInterval(async () =>
        customerAuth.rpc("get_my_family_product_feed", { p_participation_id: participationId }),
      );
      expect(error).toBeNull();
      return { plan: familyProductFeed.parse(data).planned_sessions, reads };
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
      const { plan, reads } = await familyPlan();
      expectDailyPlanTo(plan, openGroupHorizons(reads));
    });

    it("plans a cancelled membership through the date it is paid until", async () => {
      await setSubscriptionStatus("canceling");
      try {
        // The paid-until date is past the group's horizon on either side of a
        // midnight, so it alone is the end.
        const { plan } = await familyPlan();
        expectDailyPlanTo(plan, [utcDayOffset(DB_NOW, 40)]);
      } finally {
        await setSubscriptionStatus("active");
      }
    });
  });
});
