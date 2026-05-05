import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import {
  createV2TestProduct,
  createV2ScheduleSlot,
  deleteV2TestProducts,
  resetFamilySubsV2,
} from "./v2-helpers";

/**
 * The hourly cron `process_session_credits_v2` walks every active
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
const PRODUCT_RULE_1 = "00000000-0000-0000-0000-0000000005d1";
const PRODUCT_RULE_2 = "00000000-0000-0000-0000-0000000005d2";
const PRODUCT_RULE_3 = "00000000-0000-0000-0000-0000000005d3";
const PRODUCT_RULE_4 = "00000000-0000-0000-0000-0000000005d4";
const PRODUCT_IDEMP  = "00000000-0000-0000-0000-0000000005d5";
const PRODUCT_UNDER  = "00000000-0000-0000-0000-0000000005d6";

const ALL_PRODUCTS = [
  PRODUCT_RULE_1,
  PRODUCT_RULE_2,
  PRODUCT_RULE_3,
  PRODUCT_RULE_4,
  PRODUCT_IDEMP,
  PRODUCT_UNDER,
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
 * GET DIAGNOSTICS line in apply_credit_motion_v2) shows up only as a
 * missing-row failure three layers down.
 */
async function runCron(admin: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await admin.rpc("process_session_credits_v2");
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
    .from("participations_v2")
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
 * Marks a participation as sub-covered by inserting a family_subscriptions_v2
 * row + family_subscription_items_v2 link. The cron's coverage check only
 * looks for an item row whose family_subscription has status IN ('active',
 * 'past_due', 'canceling') — we use 'active'.
 */
async function makeSubCovered(
  admin: SupabaseClient<Database>,
  participationId: string,
  uniqueTag: string,
): Promise<void> {
  const { data: sub, error: subErr } = await admin
    .from("family_subscriptions_v2")
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
    .from("family_subscription_items_v2")
    .insert({
      family_subscription_id: sub.id,
      participation_id: participationId,
      stripe_subscription_item_id: `si_test_${uniqueTag}`,
      stripe_price_id: `price_test_${uniqueTag}`,
    });
  if (itemErr) throw new Error(`makeSubCovered/item: ${itemErr.message}`);
}

describe("process_session_credits_v2 — four-rule motion table", () => {
  let admin: SupabaseClient<Database>;
  let timing: SessionTiming;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
    await resetFamilySubsV2(admin);

    timing = thirtyMinutesAgoSlot();

    // One product per scenario, each with the same "fires 30 minutes ago"
    // schedule slot. consumer_club + paid is required for the cron to
    // pick the row up.
    for (const id of ALL_PRODUCTS) {
      await createV2TestProduct(admin, {
        id,
        productType: "consumer_club",
        billingMode: "paid",
        seatCount: 10,
        timezone: "UTC",
      });
      await createV2ScheduleSlot(admin, id, {
        weekday: timing.weekday,
        startTime: timing.startTime,
      });
    }
  });

  afterAll(async () => {
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
    await resetFamilySubsV2(admin);
  });

  beforeEach(async () => {
    // Wipe all motion + cancellation rows from prior tests on these
    // products. credit_deductions_v2 cascades from participations_v2,
    // so deleting participations is enough — but we also delete sub
    // links so each test starts fresh.
    await admin
      .from("participations_v2")
      .delete()
      .in("product_id", ALL_PRODUCTS);
    await resetFamilySubsV2(admin);
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
    await admin.from("session_cancellations_v2").insert({
      participation_id: participationId,
      session_date: timing.sessionDate,
      cancelled_at: cancelledAt.toISOString(),
    });

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .eq("session_date", timing.sessionDate)
      .single();
    expect(deduction?.delta).toBe(1);
    expect(deduction?.reason).toBe("sub_cancel_credit");

    const { data: row } = await admin
      .from("participations_v2")
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
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("sub_covered");

    const { data: row } = await admin
      .from("participations_v2")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Rule 3: bundle + cancelled-in-window → 0 (bundle_cancel_no_charge)
  // ---------------------------------------------------------------------------

  it("rule 3: bundle + cancelled in window logs delta=0 (no charge)", async () => {
    // Bundle = no family_subscription_items_v2 row.
    const participationId = await seedActiveParticipation(
      admin,
      PRODUCT_RULE_3,
      TEST_IDS.GAMER,
      4,
    );

    const cancelledAt = new Date(
      timing.sessionStart.getTime() - (CHARGE_WINDOW_HOURS + 1) * 60 * 60_000,
    );
    await admin.from("session_cancellations_v2").insert({
      participation_id: participationId,
      session_date: timing.sessionDate,
      cancelled_at: cancelledAt.toISOString(),
    });

    await runCron(admin);

    const { data: deduction } = await admin
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("bundle_cancel_no_charge");

    const { data: row } = await admin
      .from("participations_v2")
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
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    expect(deduction?.delta).toBe(-1);
    expect(deduction?.reason).toBe("bundle_attended_or_no_show");

    const { data: row } = await admin
      .from("participations_v2")
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
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .eq("session_date", timing.sessionDate);

    // UNIQUE on (participation_id, session_date) means at most one row
    // for this slot regardless of how many times the cron fires.
    expect(deductions?.length).toBe(1);
    expect(deductions![0].delta).toBe(-1);

    const { data: row } = await admin
      .from("participations_v2")
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
      .from("credit_deductions_v2")
      .select("delta, reason")
      .eq("participation_id", participationId)
      .single();
    // Per the rule's underflow guard: delta is logged as 0 and the reason
    // is suffixed with `_underflow_skipped` so the audit trail captures
    // the decision.
    expect(deduction?.delta).toBe(0);
    expect(deduction?.reason).toBe("bundle_attended_or_no_show_underflow_skipped");

    const { data: row } = await admin
      .from("participations_v2")
      .select("credits_remaining")
      .eq("id", participationId)
      .single();
    expect(row?.credits_remaining).toBe(0); // no negative drift
  });
});
