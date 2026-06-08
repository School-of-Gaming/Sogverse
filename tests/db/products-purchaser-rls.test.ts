import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Pins the "soft-deprecate" use case: an admin can flip `is_visible` to
 * `false` to remove a product from the parent-facing browse grids, but
 * customers who already purchased it keep seeing the product in their
 * "My Clubs / Camps / Events" rail and can still open its detail page.
 *
 * The policy under test is `purchaser_read_products` from migration
 * 00047. It complements `public_read_published_products` (which only
 * returns `is_visible = true AND status IN ('pending','running')` rows)
 * by adding a per-customer carve-out: any product the viewer has an
 * `active` or `waitlisted` participation on becomes readable, regardless
 * of `is_visible` / status.
 *
 * `reserving` rows are intentionally excluded — pre-payment Stripe
 * holds shouldn't grant a 30-min peek at a hidden product. This file
 * pins that with a positive control (active/waitlisted DO grant access)
 * and a negative one (reserving does NOT).
 */

const HIDDEN_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e5";
const HIDDEN_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e6";
const HIDDEN_RESERVING_PRODUCT = "00000000-0000-0000-0000-0000000005e7";
const HIDDEN_UNPURCHASED_PRODUCT = "00000000-0000-0000-0000-0000000005e8";
const ALL_PRODUCTS = [
  HIDDEN_ACTIVE_PRODUCT,
  HIDDEN_WAITLISTED_PRODUCT,
  HIDDEN_RESERVING_PRODUCT,
  HIDDEN_UNPURCHASED_PRODUCT,
];

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("products purchaser-read RLS (00047)", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;
  let customer2Client: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    anonClient = createAnonClient();
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Client = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    // Four products, all hidden. The participation kind is the only
    // axis that varies between them — we want to assert that just the
    // policy's status-filter discriminates active/waitlisted access
    // from reserving/none.
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, isVisible: false, seatCount: 10 });
    }

    // CUSTOMER's participations on three of the four products.
    // RLS would block these inserts for a customer client; admin client
    // bypasses RLS so we can stage rows that mirror the post-purchase
    // state without going through the SECURITY DEFINER signup RPC.
    const seed = await admin.from("participations").insert([
      {
        product_id: HIDDEN_ACTIVE_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: HIDDEN_WAITLISTED_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlist_position: 1,
      },
      {
        product_id: HIDDEN_RESERVING_PRODUCT,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "reserving",
        reserved_until: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    ]);
    if (seed.error) throw seed.error;

    // The parent dashboard's `getMyUpcomingSessions("customer")` embeds the
    // product's schedule slots and translations under the product. Seed both
    // on the active product so the detail-join assertion can prove the
    // purchaser reaches the *children*, not just the product row. The child
    // tables carry their own RLS and were never extended to purchasers — so
    // the product survives while its slots (→ dropped session) and
    // translations (→ blank name) come back empty.
    await createScheduleSlot(admin, HIDDEN_ACTIVE_PRODUCT, {
      weekday: 1,
      startTime: "10:00",
    });
    const trans = await admin.from("product_translations").insert({
      product_id: HIDDEN_ACTIVE_PRODUCT,
      locale: "en",
      name: "Hidden Active Camp",
      short_description: "Seeded for the detail-join RLS assertion.",
    });
    if (trans.error) throw trans.error;
  });

  afterAll(async () => {
    // Products cascade to participations.
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // ---------------------------------------------------------------------------
  // Positive: active / waitlisted participation grants the purchaser read
  // access to an otherwise-hidden product.
  // ---------------------------------------------------------------------------

  it("customer with an active participation can SELECT the hidden product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, is_visible")
      .eq("id", HIDDEN_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(HIDDEN_ACTIVE_PRODUCT);
    // Pin that the row really is hidden — otherwise the assertion
    // would pass via `public_read_published_products` and we
    // wouldn't be exercising the new policy at all.
    expect(data?.is_visible).toBe(false);
  });

  it("customer with a waitlisted participation can SELECT the hidden product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, is_visible")
      .eq("id", HIDDEN_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(HIDDEN_WAITLISTED_PRODUCT);
    expect(data?.is_visible).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Negative: reserving / no participation / wrong customer / anon all
  // hit the baseline "hidden ⇒ no read" path.
  // ---------------------------------------------------------------------------

  it("customer with only a reserving row CANNOT SELECT the hidden product", async () => {
    // Reserving = pre-payment Stripe Checkout hold. Anyone can create
    // one by clicking Sign Up, so admitting it would trade the privacy
    // benefit of `is_visible = false` for a 30-min observation window
    // against any logged-in customer.
    const { data, error } = await customerClient
      .from("products")
      .select("id")
      .eq("id", HIDDEN_RESERVING_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("customer with no participation CANNOT SELECT the hidden product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id")
      .eq("id", HIDDEN_UNPURCHASED_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a different customer's active participation does NOT grant access", async () => {
    // CUSTOMER_2 has no participation on HIDDEN_ACTIVE_PRODUCT — only
    // CUSTOMER does. The policy keys on `customer_id = auth.uid()`, so
    // a customer can only piggyback on their own participations.
    const { data, error } = await customer2Client
      .from("products")
      .select("id")
      .eq("id", HIDDEN_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon CANNOT SELECT a hidden product (no session = no participation)", async () => {
    const { data, error } = await anonClient
      .from("products")
      .select("id")
      .eq("id", HIDDEN_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Purchaser product-read RLS: assert the embedded product join comes through
  // for a customer's active/waitlisted participations and is nulled out for
  // reserving rows. This is the `purchaser_read_products_v2` policy that lets a
  // customer view a product they own even after an admin hides it.
  // ---------------------------------------------------------------------------

  it("rail join: active + waitlisted rows carry the product; reserving's product is filtered", async () => {
    // A customer reads their own participations with the product embedded
    // (just the columns the assertion needs). RLS nulls the embedded product
    // for rows the viewer isn't allowed to see; this asserts that shape.
    //
    // The embedded `product` is typed non-null by PostgREST because
    // `participations.product_id` is NOT NULL — but RLS can still
    // null it out for rows the viewer isn't allowed to see (the whole
    // point of this assertion). Cast through `RailRow` to admit null
    // at compile time so the runtime check on the reserving row works.
    type RailRow = {
      product_id: string;
      status: string;
      product: { id: string; is_visible: boolean } | null;
    };

    const { data, error } = await customerClient
      .from("participations")
      .select("product_id, status, product:products(id, is_visible)")
      .in("product_id", [
        HIDDEN_ACTIVE_PRODUCT,
        HIDDEN_WAITLISTED_PRODUCT,
        HIDDEN_RESERVING_PRODUCT,
      ]);

    expect(error).toBeNull();
    const rows = (data ?? []) as unknown as RailRow[];
    const byProduct = new Map(rows.map((row) => [row.product_id, row]));

    expect(byProduct.get(HIDDEN_ACTIVE_PRODUCT)?.product?.id).toBe(
      HIDDEN_ACTIVE_PRODUCT,
    );
    expect(byProduct.get(HIDDEN_WAITLISTED_PRODUCT)?.product?.id).toBe(
      HIDDEN_WAITLISTED_PRODUCT,
    );
    // Reserving row exists, but the product join is RLS-nulled.
    expect(byProduct.get(HIDDEN_RESERVING_PRODUCT)?.status).toBe("reserving");
    expect(byProduct.get(HIDDEN_RESERVING_PRODUCT)?.product).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Dashboard surface: `getMyUpcomingSessions("customer")` embeds the product's
  // schedule slots and translations. `purchaser_read_products` lets the
  // product row through, but the child tables need their own matching policy.
  // Without it the embedded slots array is empty (the dashboard drops the
  // session — Kyle's reported empty-Sessions bug) and the translations array
  // is empty (blank product name). Assert the purchaser reaches both children.
  // ---------------------------------------------------------------------------

  it("detail join: purchaser reads the hidden product's slots and translations", async () => {
    type DetailRow = {
      id: string;
      is_visible: boolean;
      schedule_slots: { weekday: number }[];
      product_translations: { locale: string; name: string }[];
    };

    const { data, error } = await customerClient
      .from("products")
      .select(
        "id, is_visible, schedule_slots(weekday), product_translations(locale, name)",
      )
      .eq("id", HIDDEN_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    const row = data as unknown as DetailRow | null;
    expect(row?.id).toBe(HIDDEN_ACTIVE_PRODUCT);
    // Pin that the row really is hidden, so the assertion exercises the
    // purchaser carve-out rather than the public-read path.
    expect(row?.is_visible).toBe(false);
    expect(row?.schedule_slots.length).toBeGreaterThan(0);
    expect(row?.product_translations.length).toBeGreaterThan(0);
  });
});
