import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import {
  createTestProduct,
  createScheduleSlot,
  deleteTestProducts,
  resetFamilySubs,
} from "./product-helpers";

/**
 * The hourly cron `process_session_credits` walks every active
 * participation on a paid consumer-club product, finds the session-start
 * instant that fell in the last hour, and applies the four-rule motion
 * table from docs/products-redesign.md §4.5:
 *
 *   1. Sub-covered + cancelled in window  → +1 credit  (sub_cancel_credit)
 *   2. Sub-covered + no cancel            →  0         (sub_covered)
 *   3. Bundle + cancelled in window       →  0         (bundle_cancel_no_charge)
 *   4. Bundle attended (or no-show)       → -1 credit  (bundle_attended_or_no_show)
 *
 * Plus an underflow guard: a bundle row with credits_remaining = 0 must
 * not drop below zero — the motion is logged with reason
 * '..._underflow_skipped' and delta=0 so the audit trail still sees the
 * decision.
 *
 * To make the cron deterministic without test timing, we rig each
 * product's schedule slot to fire at NOW() − 30 minutes:
 *   - timezone = "UTC" (no DST drama)
 *   - weekday  = (sessionStart.getUTCDay() + 6) % 7   ← ISODOW − 1
 *   - start_time = the HH:MM:00 of the 30-minutes-ago wall-clock instant
 * The cron's lookback window is (NOW() − 1h, NOW()), so 30 minutes ago
 * always lands inside it regardless of test execution time.
 */

const CHARGE_WINDOW_HOURS = 24;

// Distinct product per rule so each runs in isolation and the cron's
// "already processed?" check on (participation_id, session_date) doesn't
// interfere across tests.
const PRODUCT_RULE_1   = "00000000-0000-0000-0000-0000000005d1";
const PRODUCT_RULE_2   = "00000000-0000-0000-0000-0000000005d2";
const PRODUCT_RULE_3   = "00000000-0000-0000-0000-0000000005d3";
const PRODUCT_RULE_4   = "00000000-0000-0000-0000-0000000005d4";
const PRODUCT_IDEMP    = "00000000-0000-0000-0000-0000000005d5";
const PRODUCT_UNDER    = "00000000-0000-0000-0000-0000000005d6";
const PRODUCT_HOLIDAY  = "00000000-0000-0000-0000-0000000005d7";
const PRODUCT_MULTI    = "00000000-0000-0000-0000-0000000005d8";
const PRODUCT_LATECXL  = "00000000-0000-0000-0000-0000000005d9";

const HOLIDAY_CALENDAR = "00000000-0000-0000-0000-0000000005da";

const ALL_PRODUCTS = [
  PRODUCT_RULE_1,
  PRODUCT_RULE_2,
  PRODUCT_RULE_3,
  PRODUCT_RULE_4,
  PRODUCT_IDEMP,
  PRODUCT_UNDER,
  PRODUCT_HOLIDAY,
  PRODUCT_MULTI,
  PRODUCT_LATECXL,
];

interface SessionTiming {
  weekday: number;
  startTime: string;
  sessionStart: Date;
  sessionDate: string; // YYYY-MM-DD in UTC
}

/** Computes the schedule-slot triple that fires 30 minutes before now in UTC. */
function thirtyMinutesAgoSlot(): SessionTiming {
  const sessionStart = new Date(Date.now() - 30 * 60_000);
  const weekday = (sessionStart.getUTCDay() + 6) % 7; // ISODOW - 1
  const hh = sessionStart.getUTCHours().toString().padStart(2, "0");
  const mm = sessionStart.getUTCMinutes().toString().padStart(2, "0");
  const startTime = `${hh}:${mm}:00`;
  // Date portion in UTC — match the cron's `(NOW() AT TIME ZONE timezone)::DATE`
  // for products with timezone='UTC'. Per CLAUDE.md, never use
  // `toISOString().slice(0, 10)` to derive a local date — `formatInTimeZone`
  // with an explicit zone is the right tool even when the zone is UTC.
  const sessionDate = formatInTimeZone(sessionStart, "UTC", "yyyy-MM-dd");
  return { weekday, startTime, sessionStart, sessionDate };
}

/**
 * Calls the cron and asserts no per-participation BEGIN block silently
 * raised. The cron's outer EXCEPTION WHEN OTHERS catches everything and
 * increments `errors` in the return JSONB instead of propagating. Without
 * this assertion a real bug (like the BOOLEAN/INT mismatch we hit on the
 * GET DIAGNOSTICS line in apply_credit_motion) shows up only as a
 * missing-row failure three layers down.
 */
async function runCron(admin: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await admin.rpc("process_session_credits");
  expect(error).toBeNull();
  expect((data as { errors: number }).errors).toBe(0);
}

/**
 * Inserts a participation directly via admin client (skipping the RPC's
 * payment dance). Returns its id. Required setup for cron tests since
 * the cron only operates on rows already in 'active' state.
 */
async function seedActiveParticipation(
  admin: SupabaseClient<Database>,
  productId: string,
  gamerId: string,
  creditsRemaining: number,
): Promise<string> {
  const { data, error } = await admin
    .from("participations")
    .insert({
      product_id: productId,
      gamer_id: gamerId,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      credits_remaining: creditsRemaining,
    })
    .select("id")
    .single();
  if (error) throw new Error(`seedActiveParticipation: ${error.message}`);
  return data.id;
}

/**
 * Marks a participation as sub-covered by inserting a family_subscriptions
 * row + family_subscription_items link. The cron's coverage check only
 * looks for an item row whose family_subscription has status IN ('active',
 * 'past_due', 'canceling') — we use 'active'.
 */
async function makeSubCovered(
  admin: SupabaseClient<Database>,
  participationId: string,
  uniqueTag: string,
): Promise<void> {
  const { data: sub, error: subErr } = await admin
    .from("family_subscriptions")
    .insert({
      customer_id: TEST_IDS.CUSTOMER,
      stripe_subscription_id: `sub_test_${uniqueTag}`,
      stripe_customer_id: `cus_test_${uniqueTag}`,
      frequency: "monthly",
      currency: "eur",
      status: "active",
    })
    .select("id")
    .single();
  if (subErr) throw new Error(`makeSubCovered/sub: ${subErr.message}`);

  const { error: itemErr } = await admin
    .from("family_subscription_items")
    .insert({
      family_subscription_id: sub.id,
      participation_id: participationId,
      stripe_subscription_item_id: `si_test_${uniqueTag}`,
      stripe_price_id: `price_test_${uniqueTag}`,
    });
  if (itemErr) throw new Error(`makeSubCovered/item: ${itemErr.message}`);
}

describe("process_session_credits — four-rule motion table", () => {
  let admin: SupabaseClient<Database>;
  let timing: SessionTiming;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await resetFamilySubs(admin);

    timing = thirtyMinutesAgoSlot();

    // One product per scenario, each with the same "fires 30 minutes ago"
    // schedule slot. consumer_club + paid is required for the cron to
    // pick the row up.
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, {
        id,
        productType: "consumer_club",
        billingMode: "paid",
        seatCount: 10,
        timezone: "UTC",
      });
      await createScheduleSlot(admin, id, {
        weekday: timing.weekday,
        startTime: timing.startTime,
      });
    }
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await resetFamilySubs(admin);
  });

  beforeEach(async () => {
    // Wipe all motion + cancellation rows from prior tests on these
    // products. credit_deductions cascades from participations,
    // so deleting participations is enough — but we also delete sub
    // links so each test starts fresh.
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await resetFamilySubs(admin);
  });

  // ---------------------------------------------------------------------------
  // Rule 1: sub-covered + cancelled-in-window → +1 (sub_cancel_credit)
  // ---------------------------------------------------------------------------

  it("rule 1: sub-covered + cancelled in window grants +1 credit", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_RULE_1,
      TEST_IDS.GAMER,
      0,
    );
    await makeSubCovered(admin, participationId, "rule1");

    // Cancellation must have been entered ≥24h before the session start.
    const cancelledAt = new Date(
      timing.sessionStart.getTime() - (CHARGE_WINDOW_HOURS + 1) * 60 * 60_000,
    );
    await admin.from("session_cancellations").insert({
      participation_id: participationId,
      session_date: timing.sessionDate,
      cancelled_at: cancelledAt.toISOString(),
    });

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .eq("session_date", timing.sessionDate)
      .single();
    expect(deduction?.delta).toBe(1);
    expect(deduction?.reason).toBe("sub_cancel_credit");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Rule 2: sub-covered + no cancel → 0 (sub_covered)
  // ---------------------------------------------------------------------------

  it("rule 2: sub-covered with no cancellation logs delta=0", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_RULE_2,
      TEST_IDS.GAMER,
      0,
    );
    await makeSubCovered(admin, participationId, "rule2");

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("sub_covered");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Rule 3: bundle + cancelled-in-window → 0 (bundle_cancel_no_charge)
  // ---------------------------------------------------------------------------

  it("rule 3: bundle + cancelled in window logs delta=0 (no charge)", async () => {
    // Bundle = no family_subscription_items row.
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_RULE_3,
      TEST_IDS.GAMER,
      4,
    );

    const cancelledAt = new Date(
      timing.sessionStart.getTime() - (CHARGE_WINDOW_HOURS + 1) * 60 * 60_000,
    );
    await admin.from("session_cancellations").insert({
      participation_id: participationId,
      session_date: timing.sessionDate,
      cancelled_at: cancelledAt.toISOString(),
    });

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("bundle_cancel_no_charge");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(4); // unchanged
  });

  // ---------------------------------------------------------------------------
  // Rule 4: bundle, attended (or no-show) → -1 (bundle_attended_or_no_show)
  // ---------------------------------------------------------------------------

  it("rule 4: bundle attended deducts -1 credit", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_RULE_4,
      TEST_IDS.GAMER,
      4,
    );

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(-1);
    expect(deduction?.reason).toBe("bundle_attended_or_no_show");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  it("running the cron twice does not double-apply motion", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_IDEMP,
      TEST_IDS.GAMER,
      4,
    );

    await runCron(admin);
    await runCron(admin);

    const { data: deductions } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .eq("session_date", timing.sessionDate);

    // UNIQUE on (participation_id, session_date) means at most one row
    // for this slot regardless of how many times the cron fires.
    expect(deductions?.length).toBe(1);
    expect(deductions![0].delta).toBe(-1);

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(3); // not 2
  });

  // ---------------------------------------------------------------------------
  // Underflow guard
  // ---------------------------------------------------------------------------

  it("a bundle attended at credits_remaining=0 does not drop below zero", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_UNDER,
      TEST_IDS.GAMER,
      0,
    );

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    // Per the rule's underflow guard: delta is logged as 0 and the reason
    // is suffixed with `_underflow_skipped` so the audit trail captures
    // the decision.
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("bundle_attended_or_no_show_underflow_skipped");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(0); // no negative drift
  });

  // ---------------------------------------------------------------------------
  // Late-cancel branch (bundle, cancellation row outside the 24h window)
  // ---------------------------------------------------------------------------
  //
  // 00043 split this out of the no-show branch: same delta=-1, distinct
  // reason ('bundle_late_cancel_charged') so a parent disputing a charge
  // can see in the audit trail that the cancellation happened but landed
  // too late.

  it("rule 4b: bundle + cancelled past 24h window charges with late-cancel reason", async () => {
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_LATECXL,
      TEST_IDS.GAMER,
      4,
    );

    // Cancellation entered AFTER the 24h cutoff — within (sessionStart-24h, sessionStart).
    const cancelledAt = new Date(timing.sessionStart.getTime() - 60 * 60_000);
    await admin.from("session_cancellations").insert({
      participation_id: participationId,
      session_date: timing.sessionDate,
      cancelled_at: cancelledAt.toISOString(),
    });

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(-1);
    expect(deduction?.reason).toBe("bundle_late_cancel_charged");

    const { data: row } = await admin
      .from("participations")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Holiday calendar
  // ---------------------------------------------------------------------------
  //
  // product_has_session returns false when the session_date is on a
  // holiday the product subscribes to. The cron must skip the row (no
  // deduction, no charge).

  it("a session_date that falls on a subscribed holiday is skipped", async () => {
    // Create the calendar + holiday + link from the cron's product to it.
    await admin.from("holiday_calendars").upsert({
      id: HOLIDAY_CALENDAR,
      name: "v2-cron-test-holidays",
      timezone: "UTC",
    });
    await admin
      .from("calendar_holidays")
      .delete()
      .eq("calendar_id", HOLIDAY_CALENDAR);
    await admin.from("calendar_holidays").insert({
      calendar_id: HOLIDAY_CALENDAR,
      date: timing.sessionDate,
      reason: "test holiday",
    });
    await admin.from("product_holiday_calendars").upsert({
      product_id: PRODUCT_HOLIDAY,
      calendar_id: HOLIDAY_CALENDAR,
    });

    await seedActiveParticipation(admin, PRODUCT_HOLIDAY, TEST_IDS.GAMER, 4);

    await runCron(admin);

    const { data: deductions } = await admin
      .from("credit_deductions")
      .select("id")
      .eq("product_id", PRODUCT_HOLIDAY)
      .eq("session_date", timing.sessionDate);
    expect(deductions?.length).toBe(0);

    // Cleanup so the calendar doesn't leak into other tests.
    await admin
      .from("product_holiday_calendars")
      .delete()
      .eq("product_id", PRODUCT_HOLIDAY);
    await admin
      .from("calendar_holidays")
      .delete()
      .eq("calendar_id", HOLIDAY_CALENDAR);
    await admin
      .from("holiday_calendars")
      .delete()
      .eq("id", HOLIDAY_CALENDAR);
  });

  // ---------------------------------------------------------------------------
  // Multi-slot products
  // ---------------------------------------------------------------------------
  //
  // A product with two schedule slots on different weekdays produces two
  // rows in the cron's outer loop iteration for the same participation.
  // Only the slot whose computed session_start lands in the lookback
  // window should result in a credit_deductions row this hour.

  it("multi-slot product: only the in-window slot produces a deduction", async () => {
    // Add a second slot 3 days off from the in-window slot — it can't
    // possibly land in the (NOW-1h, NOW) window for this run.
    const otherWeekday = (timing.weekday + 3) % 7;
    await admin.from("schedule_slots").insert({
      product_id: PRODUCT_MULTI,
      weekday: otherWeekday,
      start_time: "09:00:00",
      duration_minutes: 60,
    });

    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_MULTI,
      TEST_IDS.GAMER,
      4,
    );

    await runCron(admin);

    const { data: deductions } = await admin
      .from("credit_deductions")
      .select("delta, reason, session_date")
      .eq("participation_id", participationId);

    // Exactly one row, for the in-window session_date, charging the bundle.
    expect(deductions?.length).toBe(1);
    expect(deductions![0].session_date).toBe(timing.sessionDate);
    expect(deductions![0].delta).toBe(-1);
    expect(deductions![0].reason).toBe("bundle_attended_or_no_show");

    // Cleanup so this product is left with only the standard slot for
    // any subsequent test runs.
    await admin
      .from("schedule_slots")
      .delete()
      .eq("product_id", PRODUCT_MULTI)
      .eq("weekday", otherWeekday);
  });
});
