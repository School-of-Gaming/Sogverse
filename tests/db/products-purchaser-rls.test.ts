import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createClient,
  type QueryData,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Pins the purchaser carve-out: a product the public can no longer read stays
 * readable for the customer who bought a place on it, so it keeps its spot in
 * their "My Clubs / Camps / Events" rail and its detail page keeps opening.
 *
 * The predicate under test is the purchaser branch of `can_read_product`. It
 * complements the public branch — which returns rows whose status is `pending`
 * or `running`, and since 00168 asks nothing about `is_visible` — by adding a
 * per-customer carve-out: any product the viewer has an `active` or
 * `waitlisted` participation on becomes readable whatever its status.
 *
 * **The fixtures are `cancelled`, and that is load-bearing.** Status is now the
 * only thing that closes the public branch: an unlisted product is publicly
 * readable by design (an ad campaign's landing page has to work), so a
 * `is_visible = false` fixture would be readable by everyone and every negative
 * assertion below would be exercising nothing.
 *
 * The carve-out is exactly those two participation statuses and nothing else.
 * This file pins that with a positive control (active/waitlisted DO grant
 * access) and a negative one: a row in any other status does NOT. `reserving`
 * plays the negative role — it is a retired status now (paid seats are created
 * at payment confirmation, so nothing writes it), which makes it the cleanest
 * stand-in for "some status the policy has no opinion about".
 */

const CLOSED_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e5";
const CLOSED_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e6";
const CLOSED_RESERVING_PRODUCT = "00000000-0000-0000-0000-0000000005e7";
const CLOSED_UNPURCHASED_PRODUCT = "00000000-0000-0000-0000-0000000005e8";
const ALL_PRODUCTS = [
  CLOSED_ACTIVE_PRODUCT,
  CLOSED_WAITLISTED_PRODUCT,
  CLOSED_RESERVING_PRODUCT,
  CLOSED_UNPURCHASED_PRODUCT,
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

    // Four products, all cancelled — i.e. all past the public branch. The
    // participation kind is the only axis that varies between them, so what
    // discriminates access is the carve-out's participation-status filter and
    // nothing else.
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, status: "cancelled", seatCount: 10 });
    }

    // CUSTOMER's participations on three of the four products.
    // RLS would block these inserts for a customer client; admin client
    // bypasses RLS so we can stage rows that mirror the post-purchase
    // state without going through the SECURITY DEFINER signup RPC.
    const seed = await admin.from("participations").insert([
      {
        product_id: CLOSED_ACTIVE_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
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

    // The parent dashboard's `getMyUpcomingSessions("customer")` embeds the
    // product's schedule slots and translations under the product. Seed both
    // on the active product so the detail-join assertion can prove the
    // purchaser reaches the *children*, not just the product row. The child
    // tables carry their own RLS and were never extended to purchasers — so
    // the product survives while its slots (→ dropped session) and
    // translations (→ blank name) come back empty.
    await createScheduleSlot(admin, CLOSED_ACTIVE_PRODUCT, {
      weekday: 1,
      startTime: "10:00",
    });
    const trans = await admin.from("product_translations").insert({
      product_id: CLOSED_ACTIVE_PRODUCT,
      locale: "en",
      name: "Cancelled Active Camp",
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
  // access to a product the public can no longer read.
  // ---------------------------------------------------------------------------

  it("customer with an active participation can SELECT the closed product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, status")
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    // Pin that the row really is outside the published statuses — otherwise
    // the assertion would pass via the public branch and we would not be
    // exercising the carve-out at all.
    expect(data?.status).toBe("cancelled");
  });

  it("customer with a waitlisted participation can SELECT the closed product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, status")
      .eq("id", CLOSED_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_WAITLISTED_PRODUCT);
    expect(data?.status).toBe("cancelled");
  });

  // ---------------------------------------------------------------------------
  // Negative: reserving / no participation / wrong customer / anon all
  // hit the baseline "outside the published statuses ⇒ no read" path.
  // ---------------------------------------------------------------------------

  it("customer with only a reserving row CANNOT SELECT the closed product", async () => {
    // The carve-out names active and waitlisted; a row in any other status is
    // a row it has nothing to say about, so the product's status decides.
    const { data, error } = await customerClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_RESERVING_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("customer with no participation CANNOT SELECT the closed product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_UNPURCHASED_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a different customer's active participation does NOT grant access", async () => {
    // CUSTOMER_2 has no participation on CLOSED_ACTIVE_PRODUCT — only
    // CUSTOMER does. The carve-out keys on `customer_id = auth.uid()`, so
    // a customer can only piggyback on their own participations.
    const { data, error } = await customer2Client
      .from("products")
      .select("id")
      .eq("id", CLOSED_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("anon CANNOT SELECT a closed product (no session = no participation)", async () => {
    const { data, error } = await anonClient
      .from("products")
      .select("id")
      .eq("id", CLOSED_ACTIVE_PRODUCT);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Purchaser product-read RLS: assert the embedded product join comes through
  // for a customer's active/waitlisted participations and is nulled out for
  // reserving rows. This is the carve-out that lets a customer view a product
  // they bought a place on even after it leaves the published statuses.
  // ---------------------------------------------------------------------------

  it("rail join: active + waitlisted rows carry the product; reserving's product is filtered", async () => {
    // A customer reads their own participations with the product embedded
    // (just the columns the assertion needs). RLS nulls the embedded product
    // for rows the viewer isn't allowed to see; this asserts that shape.
    //
    // The embedded `product` is typed non-null by PostgREST because
    // `participations.product_id` is NOT NULL — but RLS can still
    // null it out for rows the viewer isn't allowed to see (the whole
    // point of this assertion). Widen the QueryData row to admit null
    // at compile time so the runtime check on the reserving row works —
    // a widening annotation, not a narrowing cast.
    const query = customerClient
      .from("participations")
      .select("product_id, status, product:products(id, status)")
      .in("product_id", [
        CLOSED_ACTIVE_PRODUCT,
        CLOSED_WAITLISTED_PRODUCT,
        CLOSED_RESERVING_PRODUCT,
      ]);

    const { data, error } = await query;

    type QueryRow = QueryData<typeof query>[number];
    type RailRow = Omit<QueryRow, "product"> & {
      product: QueryRow["product"] | null;
    };

    expect(error).toBeNull();
    const rows: RailRow[] = data ?? [];
    const byProduct = new Map(rows.map((row) => [row.product_id, row]));

    expect(byProduct.get(CLOSED_ACTIVE_PRODUCT)?.product?.id).toBe(
      CLOSED_ACTIVE_PRODUCT,
    );
    expect(byProduct.get(CLOSED_WAITLISTED_PRODUCT)?.product?.id).toBe(
      CLOSED_WAITLISTED_PRODUCT,
    );
    // Reserving row exists, but the product join is RLS-nulled.
    expect(byProduct.get(CLOSED_RESERVING_PRODUCT)?.status).toBe("reserving");
    expect(byProduct.get(CLOSED_RESERVING_PRODUCT)?.product).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Dashboard surface: `getMyUpcomingSessions("customer")` embeds the product's
  // schedule slots and translations. The purchaser carve-out lets the product
  // row through, but the child tables need their own matching policy. Without
  // it the embedded slots array is empty (the dashboard drops the session —
  // Kyle's reported empty-Sessions bug) and the translations array is empty
  // (blank product name). Assert the purchaser reaches both children.
  // ---------------------------------------------------------------------------

  it("detail join: purchaser reads the closed product's slots and translations", async () => {
    const { data: row, error } = await customerClient
      .from("products")
      .select(
        "id, status, schedule_slots(weekday), product_translations(locale, name)",
      )
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(row?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    // Pin that the row really is outside the published statuses, so the
    // assertion exercises the purchaser carve-out rather than the public path.
    expect(row?.status).toBe("cancelled");
    expect(row?.schedule_slots.length).toBeGreaterThan(0);
    expect(row?.product_translations.length).toBeGreaterThan(0);
  });
});
