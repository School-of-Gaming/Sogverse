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
 *   - waitlist_count   — status = 'waitlisted'
 *
 * The rollup and the capacity gate now read the same rows: a seat is held by an
 * active participation and nothing else. There used to be a third count for
 * pre-payment holds, filtered by a deadline the gate ignored — the disagreement
 * that let an expired hold destroy a seat while showing the page a free one.
 */

const PRODUCT_TRIG = "00000000-0000-0000-0000-0000000005c1";

interface RollupRow {
  active_count: number;
  waitlist_count: number;
}

async function readRollup(
  admin: SupabaseClient<Database>,
  productId: string,
): Promise<RollupRow> {
  const { data, error } = await admin
    .from("product_seat_counts")
    .select("active_count, waitlist_count")
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
      waitlist_count: 0,
    });
  });

  it("inserting an active row increments active_count", async () => {
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 1,
      waitlist_count: 0,
    });
  });

  it("inserting a waitlisted row increments waitlist_count", async () => {
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "waitlisted",
      waitlisted_at: new Date().toISOString(),
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      waitlist_count: 1,
    });
  });

  it("transition waitlisted → active swaps the count", async () => {
    // The one status change that happens in production: an admin promotes a
    // waitlisted gamer into a seat.
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      waitlist_count: 1,
    });

    await admin
      .from("participations")
      .update({ status: "active", waitlisted_at: null })
      .eq("id", inserted!.id);

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 1,
      waitlist_count: 0,
    });
  });

  it("transition active → completed drops active_count", async () => {
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        participant_id: TEST_IDS.GAMER,
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
      waitlist_count: 0,
    });
  });

  it("deleting an active row decrements active_count", async () => {
    const { data: inserted } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_TRIG,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();

    expect((await readRollup(admin, PRODUCT_TRIG)).active_count).toBe(1);

    await admin.from("participations").delete().eq("id", inserted!.id);

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 0,
      waitlist_count: 0,
    });
  });

  it("counts compose correctly across statuses", async () => {
    // One active, one waitlisted, built up mutation-by-mutation rather than as
    // a bulk insert so the AFTER-INSERT trigger fires on each row.
    //
    // Two rows is the ceiling here, and the constraint is real rather than
    // laziness: the partial unique index `(product_id, participant_id) WHERE status
    // IN (active, waitlisted, completed)` allows one row per gamer per product
    // across every status the rollup can count, and the seed data carries two
    // gamers. There is no longer a status outside that index to stack extra
    // rows with.
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    await admin.from("participations").insert({
      product_id: PRODUCT_TRIG,
      participant_id: TEST_IDS.GAMER_2,
      customer_id: TEST_IDS.CUSTOMER,
      status: "waitlisted",
      waitlisted_at: new Date().toISOString(),
    });

    expect(await readRollup(admin, PRODUCT_TRIG)).toEqual({
      active_count: 1,
      waitlist_count: 1,
    });
  });
});
