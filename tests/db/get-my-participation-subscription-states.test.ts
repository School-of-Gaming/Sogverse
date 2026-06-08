import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Behavior of get_my_participation_subscription_states (SECURITY DEFINER,
 * 00093 — supersedes get_my_payment_problem_participations). It powers both
 * dashboard subscription badges (payment-problem and access-until). The
 * contract the UI leans on:
 *   * Returns only the caller's OWN participations — scoped to
 *     customer_id = auth.uid() OR gamer_id = auth.uid(). A parent and the
 *     gamer on the same enrollment both see it; another family does not.
 *   * Returns only `past_due` and `canceling` subscriptions. Healthy
 *     ('active') subs are excluded.
 *   * Returns participation id + status + current_period_end only (no money) —
 *     the reason it's safe to grant to gamers, who have no SELECT access to
 *     family_subscriptions.
 *
 * Own UUID suffixes (5c3–5c6, registered in product-helpers.ts) so rows never
 * collide with another db test file when CI runs the suite in parallel.
 */

const PRODUCT_PAST_DUE = "00000000-0000-0000-0000-0000000005c3"; // ours, past_due
const PRODUCT_ACTIVE = "00000000-0000-0000-0000-0000000005c4"; // ours, healthy
const PRODUCT_OTHER_FAMILY = "00000000-0000-0000-0000-0000000005c5"; // CUSTOMER_2
const PRODUCT_CANCELING = "00000000-0000-0000-0000-0000000005c6"; // ours, canceling
const ALL_TEST_PRODUCTS = [
  PRODUCT_PAST_DUE,
  PRODUCT_ACTIVE,
  PRODUCT_OTHER_FAMILY,
  PRODUCT_CANCELING,
];

const CANCEL_PERIOD_END = "2026-06-30T20:59:59.999Z";

describe("get_my_participation_subscription_states", () => {
  let admin: SupabaseClient<Database>;
  let pastDueParticipationId: string;
  let cancelingParticipationId: string;

  async function seedParticipation(
    productId: string,
    gamerId: string,
    customerId: string,
    subStatus: string,
    stripeSuffix: string,
    currentPeriodEnd: string | null = null,
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
      stripe_subscription_id: `sub_ss_${stripeSuffix}`,
      stripe_customer_id: `cus_ss_${stripeSuffix}`,
      stripe_price_id: `price_ss_${stripeSuffix}`,
      currency: "eur",
      status: subStatus,
      current_period_end: currentPeriodEnd,
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
    await createTestProduct(admin, { id: PRODUCT_CANCELING, seatCount: 5 });

    // Ours, past_due — must surface for both CUSTOMER and GAMER.
    pastDueParticipationId = await seedParticipation(
      PRODUCT_PAST_DUE,
      TEST_IDS.GAMER,
      TEST_IDS.CUSTOMER,
      "past_due",
      "pastdue",
    );
    // Ours, canceling — must surface with its current_period_end.
    cancelingParticipationId = await seedParticipation(
      PRODUCT_CANCELING,
      TEST_IDS.GAMER,
      TEST_IDS.CUSTOMER,
      "canceling",
      "canceling",
      CANCEL_PERIOD_END,
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

  it("returns the parent's own past_due and canceling subs, and only those", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    const { data, error } = await customer.rpc(
      "get_my_participation_subscription_states",
    );

    expect(error).toBeNull();
    const byId = new Map((data ?? []).map((r) => [r.participation_id, r]));
    // Past_due and canceling appear; the healthy sub and the other family's
    // past_due sub do not.
    expect(byId.size).toBe(2);
    expect(byId.get(pastDueParticipationId)?.status).toBe("past_due");
    expect(byId.get(cancelingParticipationId)?.status).toBe("canceling");
  });

  it("returns current_period_end on the canceling row so the UI can clamp access", async () => {
    const customer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    const { data, error } = await customer.rpc(
      "get_my_participation_subscription_states",
    );

    expect(error).toBeNull();
    const canceling = (data ?? []).find(
      (r) => r.participation_id === cancelingParticipationId,
    );
    expect(new Date(canceling!.current_period_end).toISOString()).toBe(
      CANCEL_PERIOD_END,
    );
  });

  it("returns the same rows for the gamer on those enrollments", async () => {
    const gamer = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    const { data, error } = await gamer.rpc(
      "get_my_participation_subscription_states",
    );

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.participation_id).sort();
    expect(ids).toEqual(
      [pastDueParticipationId, cancelingParticipationId].sort(),
    );
  });

  it("never returns another family's subscriptions", async () => {
    const otherCustomer = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    const { data, error } = await otherCustomer.rpc(
      "get_my_participation_subscription_states",
    );

    expect(error).toBeNull();
    // CUSTOMER_2 *does* own a past_due sub here, so they see their own — the
    // point is they never see CUSTOMER's. Assert ours are absent.
    const ids = (data ?? []).map((r) => r.participation_id);
    expect(ids).not.toContain(pastDueParticipationId);
    expect(ids).not.toContain(cancelingParticipationId);
  });
});
