import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createClient,
  type QueryData,
  type SupabaseClient,
} from "@supabase/supabase-js";
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
 * Regression gate for the enrolled-gamer read (migration 00067).
 *
 * The bug it fixes: a product passes the last day the public can read it. The
 * parent keeps access through the purchaser carve-out and the gedu through the
 * assignment one, but the *gamer* — the child signed in to their own account —
 * had no matching branch, so the product dropped out of the `products!inner`
 * join in `getMyUpcomingSessions("gamer")` and the session vanished from their
 * dashboard. A finished club a family is still owed the history of is exactly
 * that case.
 *
 * Mirrors `products-purchaser-rls.test.ts`, keyed on `participant_id` instead of
 * `customer_id`: active/waitlisted grant the gamer read of a product the public
 * branch has let go; any other participation status / no participation do not.
 * (`reserving` stands in for "any other status" — it is a retired value nothing
 * writes any more.)
 *
 * **The fixtures ended in the past, and that is load-bearing** — since 00168 an
 * unlisted product is publicly readable by design, so `is_visible = false`
 * fixtures would make every negative assertion here vacuous.
 */

/**
 * A term that ended long ago, in a zone that cannot argue about it: the
 * fixtures' timezone is UTC and the date is years back, so "the end date has
 * passed" is true wherever and whenever this suite runs. That is what closes
 * the public read branch, and it is the only thing that does.
 */
const CLOSED_END = "2020-01-31";

const CLOSED_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e1";
const CLOSED_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e2";
const CLOSED_RESERVING_PRODUCT = "00000000-0000-0000-0000-0000000005e3";
const CLOSED_UNENROLLED_PRODUCT = "00000000-0000-0000-0000-0000000005e4";
const ALL_PRODUCTS = [
  CLOSED_ACTIVE_PRODUCT,
  CLOSED_WAITLISTED_PRODUCT,
  CLOSED_RESERVING_PRODUCT,
  CLOSED_UNENROLLED_PRODUCT,
];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("products gamer-read RLS (00067)", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let gamerClient: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;

  let activeGroupId: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anonClient = createAnonClient();
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
      {
        product_id: CLOSED_RESERVING_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "reserving",
      },
    ]);
    if (seed.error) throw seed.error;

    // The dashboard query (`getMyUpcomingSessions`) embeds the product's
    // schedule slots and translations *under* the product. Seed both on the
    // active product so the join assertion below can prove the *children*
    // survive RLS — not just the product row. 00067 fixed products; the
    // child tables need the matching enrolled-read policy or the dashboard
    // sees an empty slots array (→ dropped row, the empty-Sessions bug) and
    // an empty translations array (→ blank product name).
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

  // ---------------------------------------------------------------------------
  // Positive: active / waitlisted enrollment grants the gamer read access to a
  // product the public can no longer read.
  // ---------------------------------------------------------------------------

  it("gamer with an active participation can SELECT the closed product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    // Pin that the row really is past the public branch — otherwise the
    // assertion would pass via that branch and the enrolled-gamer one would not
    // be exercised at all.
    expect(data?.end_date).toBe(CLOSED_END);
  });

  it("gamer with a waitlisted participation can SELECT the closed product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_WAITLISTED_PRODUCT);
    expect(data?.end_date).toBe(CLOSED_END);
  });

  // ---------------------------------------------------------------------------
  // Negative controls.
  // ---------------------------------------------------------------------------

  it("gamer with only a reserving row CANNOT SELECT the closed product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_RESERVING_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("gamer with no participation CANNOT SELECT the closed product", async () => {
    const { data, error } = await gamerClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_UNENROLLED_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon CANNOT SELECT a closed product", async () => {
    const { data, error } = await anonClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Dashboard surface: the exact join `getMyUpcomingSessions("gamer")` runs,
  // including the embedded child tables it actually projects. Before 00067 the
  // inner join dropped the unreadable product entirely; the product-row fix landed,
  // but the *children* (slots, translations) have their own RLS and were never
  // extended to enrolled gamers — so the product survives while its slots and
  // translations come back empty. Assert all three layers arrive.
  // ---------------------------------------------------------------------------

  it("dashboard join: gamer's active+placed session carries the closed product with its slots and translations", async () => {
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
    // tables need the enrolled-read policy, so assert both actually arrive.
    expect(rows[0].product.schedule_slots.length).toBeGreaterThan(0);
    expect(rows[0].product.product_translations.length).toBeGreaterThan(0);
  });
});
