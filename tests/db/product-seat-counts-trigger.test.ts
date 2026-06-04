import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * The product_seat_counts rollup is the single source of truth for
 * Realtime-driven seat counters on parent surfaces (Supabase Realtime
 * filters by RLS, and participations hides other customers' rows, so
 * we can't subscribe directly — see migration 00039 for the rationale).
 *
 * Every test asserts the rollup row reflects the new counts *within the
 * same statement* — the trigger is AFTER INSERT/UPDATE/DELETE so it
 * fires synchronously on the same transaction. No timing involved.
 *
 * Counts the rollup tracks:
 *   - active_count     — status = 'active'
 *   - reserving_count  — status = 'reserving' AND reserved_until > NOW()
 *                        (note: the seat-math RPC counts ALL reserving rows;
 *                         the rollup is the time-filtered "still live" view)
 *   - waitlist_count   — status = 'waitlisted'
 */

const PRODUCT_TRIG = "00000000-0000-0000-0000-0000000005c1";

interface RollupRow {
  active_count: number;
  reserving_count: number;
  waitlist_count: number;
}

async function readRollup(
  admin: SupabaseClient<Database>,
  productId: string,
): Promise<RollupRow> {
  const { data, error } = await admin
    .from("product_seat_counts")
    .select("active_count, reserving_count, waitlist_count")
    .eq("product_id", productId)
    .single();
  if (error) throw new Error(`readRollup failed: ${error.message}`);
  return data;
}

describe("product_seat_counts trigger", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, [PRODUCT_TRIG]);
    await createTestProduct(admin, { id: PRODUCT_TRIG, seatCount: 10 });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_TRIG]);
  });

  beforeEach(async () => {
    await admin
      .from("participations")
      .delete()
      .eq("product_id", PRODUCT_TRIG);
  });

  it("seeds the rollup row at product creation with all-zero counts", async () => {
    // The migration's seed insert + the AFTER-INSERT-on-products
    // path both ensure a rollup row exists from the start.
    const counts = await readRollup(admin, PRODUCT_TRIG);
    expect(counts).toEqual({
      active_count: 0,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("inserting an active row increments active_count", async () => {
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 1,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("inserting a live reserving row increments reserving_count", async () => {
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "reserving",
      reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      reserving_count: 1,
      waitlist_count: 0,
    });
  });

  it("an expired reserving row does NOT count toward reserving_count", async () => {
    // The rollup is the "is the seat live right now?" view — used by
    // the parent's seat-counter UI. The seat-math RPC uses a different
    // function (count_seats_taken) that holds the seat regardless of
    // reserved_until. The two views diverge intentionally.
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "reserving",
      reserved_until: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("inserting a waitlisted row increments waitlist_count", async () => {
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "waitlisted",
      waitlist_position: 1,
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      reserving_count: 0,
      waitlist_count: 1,
    });
  });

  it("transition reserving → active swaps the count", async () => {
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "reserving",
        reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select("id")
      .single();

    expect(await readRollup(admin, PRODUCT_TRIG)).toMatchObject({
      reserving_count: 1,
      active_count: 0,
    });

    await admin
      .from("participations")
      .update({ status: "active", reserved_until: null })
      .eq("id", inserted!.id);

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 1,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("transition active → completed drops active_count", async () => {
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();

    await admin
      .from("participations")
      .update({ status: "completed" })
      .eq("id", inserted!.id);

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("deleting an active row decrements active_count", async () => {
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();

    expect((await readRollup(admin, PRODUCT_TRIG)).active_count).toBe(1);

    await admin.from("participations").delete().eq("id", inserted!.id);

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      reserving_count: 0,
      waitlist_count: 0,
    });
  });

  it("counts compose correctly with mixed statuses", async () => {
    // Two actives, one live reserving, one expired reserving (excluded
    // from the rollup), one completed (excluded from every count). Builds
    // up the table mutation-by-mutation rather than a bulk insert to
    // exercise the AFTER-INSERT trigger on each row.
    //
    // We don't include a 'waitlisted' row here — the partial unique
    // index `(product_id, gamer_id) WHERE status IN (active, waitlisted,
    // completed)` would conflict with the active rows already on both
    // seeded gamers. Waitlisted increments are covered by the dedicated
    // test above.
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER_2,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    await admin.from("participations").insert({
      // Same gamer as the first row but reserving — the partial unique
      // index excludes 'reserving' so this is allowed.
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER_2,
      status: "reserving",
      reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      gamer_id: TEST_IDS.GAMER_2,
      customer_id: TEST_IDS.CUSTOMER_2,
      status: "reserving",
      reserved_until: new Date(Date.now() - 60_000).toISOString(),
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 2,
      reserving_count: 1,
      waitlist_count: 0,
    });
  });
});
