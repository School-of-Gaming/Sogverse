import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createV2TestProduct, deleteV2TestProducts } from "./v2-helpers";

/**
 * Regression gate for `gamer_read_enrolled_products_v2` (migration 00067).
 *
 * The bug it fixes: an admin hides a running product (`is_visible = false`).
 * The parent keeps access via `purchaser_read_products_v2` (00048) and the
 * gedu via `gedu_assigned_read_products_v2` (00056), but the *gamer* — the
 * child signed in to their own account — had no matching SELECT policy, so
 * the hidden product dropped out of the `products_v2!inner` join in
 * `getMyUpcomingSessions("gamer")` and the session vanished from their
 * dashboard.
 *
 * Mirrors `products-v2-purchaser-rls.test.ts`, keyed on `gamer_id` instead
 * of `customer_id`: active/waitlisted grant the gamer read of a hidden
 * product; reserving / no-participation do not.
 */

const HIDDEN_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e1";
const HIDDEN_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e2";
const HIDDEN_RESERVING_PRODUCT = "00000000-0000-0000-0000-0000000005e3";
const HIDDEN_UNENROLLED_PRODUCT = "00000000-0000-0000-0000-0000000005e4";
const ALL_PRODUCTS = [
  HIDDEN_ACTIVE_PRODUCT,
  HIDDEN_WAITLISTED_PRODUCT,
  HIDDEN_RESERVING_PRODUCT,
  HIDDEN_UNENROLLED_PRODUCT,
];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("products_v2 gamer-read RLS (00067)", () => {
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

    await deleteV2TestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createV2TestProduct(admin, { id, isVisible: false, seatCount: 10 });
    }

    // The active product gets a real group so the gamer's participation can
    // be placed — this lets the dashboard join-shape assertion (which
    // requires group_id NOT NULL) exercise the same query the dashboard runs.
    const created = await adminAuth.rpc("commit_group_changes_v2", {
      p_product_id: HIDDEN_ACTIVE_PRODUCT,
      p_added_groups: [{ tempId: "tA", name: "Cohort A", geduIds: [] }],
    });
    activeGroupId = (created.data as { tempMap: Record<string, string> })
      .tempMap.tA;

    // GAMER's participations, keyed on gamer_id (the child's own account).
    // Admin client bypasses RLS to stage the post-signup state directly.
    const seed = await admin.from("participations_v2").insert([
      {
        product_id: HIDDEN_ACTIVE_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: activeGroupId,
        credits_remaining: 0,
      },
      {
        product_id: HIDDEN_WAITLISTED_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlist_position: 1,
        credits_remaining: 0,
      },
      {
        product_id: HIDDEN_RESERVING_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "reserving",
        reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
        credits_remaining: 0,
      },
    ]);
    if (seed.error) throw seed.error;
  });

  afterAll(async () => {
    await deleteV2TestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Positive: active / waitlisted enrollment grants the gamer read access to
  // an otherwise-hidden product.
  // ---------------------------------------------------------------------------

  it("gamer with an active participation can SELECT the hidden product", async () => {
    const { data, error } = await gamerClient
      .from("products_v2")
      .select("id, is_visible")
      .eq("id", HIDDEN_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(HIDDEN_ACTIVE_PRODUCT);
    // Pin that the row really is hidden — otherwise the assertion would pass
    // via `public_read_published_products_v2` and the new policy wouldn't be
    // exercised at all.
    expect(data?.is_visible).toBe(false);
  });

  it("gamer with a waitlisted participation can SELECT the hidden product", async () => {
    const { data, error } = await gamerClient
      .from("products_v2")
      .select("id, is_visible")
      .eq("id", HIDDEN_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(HIDDEN_WAITLISTED_PRODUCT);
    expect(data?.is_visible).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Negative controls.
  // ---------------------------------------------------------------------------

  it("gamer with only a reserving row CANNOT SELECT the hidden product", async () => {
    const { data, error } = await gamerClient
      .from("products_v2")
      .select("id")
      .eq("id", HIDDEN_RESERVING_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("gamer with no participation CANNOT SELECT the hidden product", async () => {
    const { data, error } = await gamerClient
      .from("products_v2")
      .select("id")
      .eq("id", HIDDEN_UNENROLLED_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon CANNOT SELECT a hidden product", async () => {
    const { data, error } = await anonClient
      .from("products_v2")
      .select("id")
      .eq("id", HIDDEN_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Dashboard surface: the exact join `getMyUpcomingSessions("gamer")` runs.
  // Before 00067 the inner join dropped the hidden product and the session
  // disappeared; assert the embedded product now comes through for the gamer.
  // ---------------------------------------------------------------------------

  it("dashboard join: gamer's active+placed session carries the hidden product", async () => {
    type SessionRow = {
      gamer_id: string;
      group_id: string | null;
      product: { id: string; is_visible: boolean } | null;
    };

    const { data, error } = await gamerClient
      .from("participations_v2")
      .select("gamer_id, group_id, product:products_v2!inner(id, is_visible)")
      .eq("gamer_id", TEST_IDS.GAMER)
      .eq("status", "active")
      .not("group_id", "is", null)
      .eq("product_id", HIDDEN_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    const rows = (data ?? []) as unknown as SessionRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].product?.id).toBe(HIDDEN_ACTIVE_PRODUCT);
    expect(rows[0].product?.is_visible).toBe(false);
  });
});
