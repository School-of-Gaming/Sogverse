import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Behavior of get_my_payment_problem_participations (SECURITY DEFINER, 00085),
 * which powers the dashboard payment-problem badge. The contract the UI leans
 * on:
 *   * Returns only the caller's OWN participations — scoped to
 *     customer_id = auth.uid() OR gamer_id = auth.uid(). A parent and the
 *     gamer on the same enrollment both see it; another family does not.
 *   * Returns only `past_due` subscriptions. Healthy ('active') subs are
 *     excluded.
 *   * Returns participation ids only (no money) — the reason it's safe to grant
 *     to gamers, who have no SELECT access to family_subscriptions.
 *
 * Own UUID suffixes (5c3–5c5, registered in product-helpers.ts) so rows never
 * collide with another db test file when CI runs the suite in parallel.
 */

const PRODUCT_PAST_DUE = "00000000-0000-0000-0000-0000000005c3"; // ours, past_due
const PRODUCT_ACTIVE = "00000000-0000-0000-0000-0000000005c4"; // ours, healthy
const PRODUCT_OTHER_FAMILY = "00000000-0000-0000-0000-0000000005c5"; // CUSTOMER_2
const ALL_TEST_PRODUCTS = [
  PRODUCT_PAST_DUE,
  PRODUCT_ACTIVE,
  PRODUCT_OTHER_FAMILY,
];

describe("get_my_payment_problem_participations", () => {
  let admin: SupabaseClient<Database>;
  let pastDueParticipationId: string;

  async function seedParticipation(
    productId: string,
    gamerId: string,
    customerId: string,
    subStatus: string,
    stripeSuffix: string,
  ): Promise<string> {
    const { data: participation, error: pErr } = await admin
      .from("participations")
      .insert({
        product_id: productId,
        gamer_id: gamerId,
        customer_id: customerId,
        status: "active",
      })
      .select("id")
      .single();
    expect(pErr).toBeNull();

    const { error: subErr } = await admin.from("family_subscriptions").insert({
      customer_id: customerId,
      participation_id: participation!.id,
      stripe_subscription_id: `sub_pp_${stripeSuffix}`,
      stripe_customer_id: `cus_pp_${stripeSuffix}`,
      stripe_price_id: `price_pp_${stripeSuffix}`,
      currency: "eur",
      status: subStatus,
    });
    expect(subErr).toBeNull();

    return participation!.id;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
    await createTestProduct(admin, { id: PRODUCT_PAST_DUE, seatCount: 5 });
    await createTestProduct(admin, { id: PRODUCT_ACTIVE, seatCount: 5 });
    await createTestProduct(admin, { id: PRODUCT_OTHER_FAMILY, seatCount: 5 });

    // Ours, past_due — must surface for both CUSTOMER and GAMER.
    pastDueParticipationId = await seedParticipation(
      PRODUCT_PAST_DUE,
      TEST_IDS.GAMER,
      TEST_IDS.CUSTOMER,
      "past_due",
      "pastdue",
    );
    // Ours, but healthy — must be excluded (status filter).
    await seedParticipation(
      PRODUCT_ACTIVE,
      TEST_IDS.GAMER,
      TEST_IDS.CUSTOMER,
      "active",
      "active",
    );
    // Another family, past_due — must be excluded (ownership scoping).
    await seedParticipation(
      PRODUCT_OTHER_FAMILY,
      TEST_IDS.GAMER_2,
      TEST_IDS.CUSTOMER_2,
      "past_due",
      "otherfam",
    );
  });

  afterAll(async () => {
    // CASCADE clears participations + their linked family_subscriptions rows.
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  it("returns the parent's own past_due participation, and only that one", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    const { data, error } = await customer.rpc(
      "get_my_payment_problem_participations",
    );

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.participation_id);
    expect(ids).toContain(pastDueParticipationId);
    // Healthy sub and the other family's past_due sub must not appear.
    expect(ids).toHaveLength(1);
  });

  it("returns the same past_due participation for the gamer on that enrollment", async () => {
    const gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    const { data, error } = await gamer.rpc(
      "get_my_payment_problem_participations",
    );

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.participation_id);
    expect(ids).toEqual([pastDueParticipationId]);
  });

  it("never returns another family's past_due participation", async () => {
    const otherCustomer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    const { data, error } = await otherCustomer.rpc(
      "get_my_payment_problem_participations",
    );

    expect(error).toBeNull();
    // CUSTOMER_2 *does* own a past_due sub here, so they see their own — the
    // point is they never see CUSTOMER's. Assert ours is absent.
    const ids = (data ?? []).map((r) => r.participation_id);
    expect(ids).not.toContain(pastDueParticipationId);
  });
});
