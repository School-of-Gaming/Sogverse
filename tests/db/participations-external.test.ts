import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";
import { createParticipationRpcResult } from "@/services/participations/participations.contracts";

/**
 * create_participation for municipality clubs (billing_mode =
 * 'external_contract'). These are invoiced off-platform, so registration is
 * instant — no reserving row, no Stripe — mirroring the 'free' branch but gated
 * on the external billing mode. See migration 00115.
 *
 * Product UUIDs in the 5b8–5b9 sub-range (see product-helpers allocation
 * registry). The muni product points at the seeded LOCATION_MUNICIPALITY to
 * satisfy chk_products_online_muni_has_location + validate_products_location.
 */

const PRODUCT_MUNI = "00000000-0000-0000-0000-0000000005b8";
const PRODUCT_PAID = "00000000-0000-0000-0000-0000000005b9";
const ALL_TEST_PRODUCTS = [PRODUCT_MUNI, PRODUCT_PAID];

// Far-future end date — non-consumer products need a non-null end_date once
// status != 'draft' (chk_products_non_consumer_has_end_date), and we need the
// product non-draft so the effective-status gate accepts signups.
const FAR_FUTURE = "2099-12-31";

describe("create_participation — external_contract (municipality) registration", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);

    await createTestProduct(admin, {
      id: PRODUCT_MUNI,
      productType: "municipality_club",
      billingMode: "external_contract",
      locationId: TEST_IDS.LOCATION_MUNICIPALITY,
      endDate: FAR_FUTURE,
      seatCount: 10,
    });

    // A paid consumer club, for the billing-mode guard test.
    await createTestProduct(admin, {
      id: PRODUCT_PAID,
      seatCount: 10,
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterEach(async () => {
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
    // Reset the muni product to the default open/10-seat state so tests that
    // mutate it (seat cap, registration window) don't leak into others.
    await admin
      .from("products")
      .update({
        seat_count: 10,
        registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq("id", PRODUCT_MUNI);
  });

  function register(productId: string, gamerId: string) {
    return admin.rpc("create_participation", {
      p_product_id: productId,
      p_gamer_id: gamerId,
      p_customer_id: TEST_IDS.CUSTOMER,
      p_purchase_shape: "external",
      p_currency: "eur",
    });
  }

  it("registers instantly as active — no reservation row, no Stripe", async () => {
    const res = await register(PRODUCT_MUNI, TEST_IDS.GAMER);
    expect(res.error).toBeNull();

    const parsed = createParticipationRpcResult.parse(res.data);
    expect(parsed.kind).toBe("external_active");
    expect(parsed.participation_id).toBeTruthy();

    const { data: row } = await admin
      .from("participations")
      .select("status, reserved_until, waitlist_position")
      .eq("id", parsed.participation_id!)
      .single();
    expect(row?.status).toBe("active");
    // External registrations hold the seat outright — never a timed reservation.
    expect(row?.reserved_until).toBeNull();
    expect(row?.waitlist_position).toBeNull();
  });

  it("honors the seat cap — a full muni club returns kind='full'", async () => {
    await admin
      .from("products")
      .update({ seat_count: 1 })
      .eq("id", PRODUCT_MUNI);

    const first = await register(PRODUCT_MUNI, TEST_IDS.GAMER);
    expect(createParticipationRpcResult.parse(first.data).kind).toBe(
      "external_active",
    );

    // Second child, no seat left → full (so the UI can offer the waitlist).
    const second = await register(PRODUCT_MUNI, TEST_IDS.GAMER_2);
    expect(second.error).toBeNull();
    expect(createParticipationRpcResult.parse(second.data).kind).toBe("full");
  });

  it("rejects registration before the registration window opens", async () => {
    await admin
      .from("products")
      .update({
        registration_opens_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .eq("id", PRODUCT_MUNI);

    const res = await register(PRODUCT_MUNI, TEST_IDS.GAMER);
    expect(res.error?.message).toContain("registration has not yet opened");
  });

  it("rejects the 'external' shape on a non-external (paid) product", async () => {
    const res = await register(PRODUCT_PAID, TEST_IDS.GAMER);
    expect(res.error?.message).toContain("product is not externally contracted");
  });

  it("is idempotent against a second registration for the same gamer", async () => {
    const first = await register(PRODUCT_MUNI, TEST_IDS.GAMER);
    expect(createParticipationRpcResult.parse(first.data).kind).toBe(
      "external_active",
    );

    // A gamer who already holds an active spot can't be registered again — the
    // existing-row guard raises a unique_violation (23505).
    const again = await register(PRODUCT_MUNI, TEST_IDS.GAMER);
    expect(again.error?.code).toBe("23505");
  });
});
