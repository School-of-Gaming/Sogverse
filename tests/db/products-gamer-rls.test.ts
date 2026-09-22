import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type QueryData, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { applyGroupChangesResult } from "@/services/groups/groups.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Regression gate for the gamer dashboard's own read of a club whose term ended
 * long ago — the child signed in to their own account, reading the history a
 * family is still owed.
 *
 * The bug behind it: `getMyUpcomingSessions("gamer")` walks
 * `participations` → `products!inner` → (`schedule_slots`,
 * `product_translations`). An inner join drops the row entirely when the
 * product is unreadable, and an empty slots array drops it one layer later
 * (the reported empty-Sessions bug); an empty translations array renders a
 * blank product name. All three layers have to arrive, and this file asserts
 * all three.
 *
 * **What this file used to be, and why it is smaller now.** It pinned an
 * *enrolled-gamer carve-out* against a public read that
 * closed when a term ended, and its negative controls were half the point: a
 * `reserving` row, no participation, and an anonymous visitor each had to come
 * back empty. There is no carve-out to pin any more — every product stays
 * readable by direct link forever (owner decision, 2026-09-15) — so three cases
 * were deleted rather than inverted:
 *
 *   - "gamer with only a reserving row CANNOT SELECT the closed product"
 *   - "gamer with no participation CANNOT SELECT the closed product"
 *   - "anon CANNOT SELECT a closed product"
 *
 * Each asserted that some caller could not read a product, and no caller
 * cannot. The predicate's own behaviour — every caller gets the same answer for
 * any product that exists — is proved once, in `exposed-function-scope.test.ts`.
 * The surface claim left here did not move.
 */

/**
 * A term that ended long ago, in a zone that cannot argue about it: the
 * fixtures' timezone is UTC and the date is years back. It no longer closes a
 * read — nothing does — but it is still what makes this the *history* read
 * rather than an ordinary one.
 */
const CLOSED_END = "2020-01-31";

const CLOSED_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e1";
const CLOSED_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e2";
const ALL_PRODUCTS = [CLOSED_ACTIVE_PRODUCT, CLOSED_WAITLISTED_PRODUCT];

describe("gamer dashboard: product join shapes on an ended term", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;

  let activeGroupId: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    gamerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, endDate: CLOSED_END, seatCount: 10 });
    }

    // The active product gets a real group so the gamer's participation can
    // be placed — this lets the dashboard join-shape assertion (which
    // requires group_id NOT NULL) exercise the same query the dashboard runs.
    const created = await adminAuth.rpc("apply_group_changes", {
      p_product_id: CLOSED_ACTIVE_PRODUCT,
      p_added_groups: [{ tempId: "tA", name: "Cohort A", geduIds: [] }],
    });
    activeGroupId = applyGroupChangesResult.parse(created.data).tempMap.tA;

    // GAMER's participations, keyed on participant_id (the child's own account).
    // Admin client bypasses RLS to stage the post-signup state directly.
    const seed = await admin.from("participations").insert([
      {
        product_id: CLOSED_ACTIVE_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: activeGroupId,
      },
      {
        product_id: CLOSED_WAITLISTED_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      },
    ]);
    if (seed.error) throw seed.error;

    // The dashboard query (`getMyUpcomingSessions`) embeds the product's
    // schedule slots and translations *under* the product. Seed both on the
    // active product so the join assertion below can prove the *children*
    // survive RLS — not just the product row. The child tables carry their own
    // policies: without them the dashboard sees an empty slots array (→ dropped
    // row, the empty-Sessions bug) and an empty translations array (→ blank
    // product name).
    await createScheduleSlot(admin, CLOSED_ACTIVE_PRODUCT, {
      weekday: 1,
      startTime: "10:00",
    });
    const trans = await admin.from("product_translations").insert({
      product_id: CLOSED_ACTIVE_PRODUCT,
      locale: "en",
      name: "Finished Camp",
      short_description: "Seeded for the dashboard-join RLS assertion.",
    });
    if (trans.error) throw trans.error;
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  it("gamer with an active participation can SELECT the ended product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    // Non-vacuity: the row really is one whose term is years over, which is the
    // shape the dashboard has to keep rendering.
    expect(data?.end_date).toBe(CLOSED_END);
  });

  it("gamer with a waitlisted participation can SELECT the ended product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_WAITLISTED_PRODUCT);
    expect(data?.end_date).toBe(CLOSED_END);
  });

  it("dashboard join: gamer's active+placed session carries the ended product with its slots and translations", async () => {
    const query = gamerClient
      .from("participations")
      .select(
        "participant_id, group_id, product:products!inner(id, end_date, schedule_slots(weekday), product_translations(locale, name))",
      )
      .eq("participant_id", TEST_IDS.GAMER)
      .eq("status", "active")
      .not("group_id", "is", null)
      .eq("product_id", CLOSED_ACTIVE_PRODUCT);

    const { data, error } = await query;

    expect(error).toBeNull();
    const rows: QueryData<typeof query> = data ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].product.id).toBe(CLOSED_ACTIVE_PRODUCT);
    expect(rows[0].product.end_date).toBe(CLOSED_END);
    // The product surviving the inner join isn't enough: the dashboard reads
    // the embedded children too. An empty slots array makes the occurrence
    // walk drop the row (the reported empty-Sessions bug); an empty
    // translations array renders a blank product name. Both child
    // tables need their own read policy, so assert both actually arrive.
    expect(rows[0].product.schedule_slots.length).toBeGreaterThan(0);
    expect(rows[0].product.product_translations.length).toBeGreaterThan(0);
  });
});
