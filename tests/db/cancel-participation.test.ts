import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";
import { TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Behavior of the cancel_participation RPC (SECURITY DEFINER), recreated in
 * migration 00084 for the per-participation subscription model.
 *
 * Not a concurrency file — this is about the RPC's contract, which the Stripe
 * webhook's customer.subscription.deleted handler leans on:
 *   * Hard-deleting the participation CASCADEs its linked family_subscriptions
 *     row away (the row's participation_id FK is ON DELETE CASCADE), and the RPC
 *     hands back the stripe_subscription_id it read *before* the delete (so an
 *     admin-initiated cancel could cancel the Stripe sub — the webhook path,
 *     where Stripe already cancelled, ignores it).
 *   * A missing participation returns kind='noop'. That's what turns a
 *     *replayed* deletion into a clean 200 instead of a null-deref 500 Stripe
 *     would retry forever.
 *
 * Own UUID suffix (…05c2, registered in product-helpers.ts) so rows never
 * collide with another db test file when CI runs the suite in parallel.
 */

const PRODUCT_CANCEL = "00000000-0000-0000-0000-0000000005c2";
const ALL_TEST_PRODUCTS = [PRODUCT_CANCEL];

describe("cancel_participation", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
    await createTestProduct(admin, { id: PRODUCT_CANCEL, seatCount: 5 });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, ALL_TEST_PRODUCTS);
  });

  afterEach(async () => {
    // Wipe participations between tests; CASCADE clears any family_subscriptions
    // rows still linked.
    await admin
      .from("participations")
      .delete()
      .in("product_id", ALL_TEST_PRODUCTS);
  });

  it("deletes the participation, CASCADEs its family_subscriptions row, and returns the stripe sub id", async () => {
    // Active participation with a linked per-participation sub row.
    const { data: participation, error: pErr } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_CANCEL,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();
    expect(pErr).toBeNull();

    const { error: subErr } = await admin.from("family_subscriptions").insert({
      customer_id: TEST_IDS.CUSTOMER,
      participation_id: participation!.id,
      stripe_subscription_id: "sub_cancel_test_1",
      stripe_customer_id: "cus_cancel_test_1",
      stripe_price_id: "price_cancel_test_1",
      currency: "eur",
      status: "active",
    });
    expect(subErr).toBeNull();

    const result = await admin.rpc("cancel_participation", {
      p_participation_id: participation!.id,
      p_reason: "subscription_cancelled",
    });
    const body = result.data as {
      kind: string;
      stripe_subscription_id?: string | null;
      previous_status?: string;
      reason?: string;
    };
    expect(body.kind).toBe("cancelled");
    expect(body.stripe_subscription_id).toBe("sub_cancel_test_1");
    expect(body.previous_status).toBe("active");
    expect(body.reason).toBe("subscription_cancelled");

    // Participation is gone…
    const { data: pRow } = await admin
      .from("participations")
      .select("id")
      .eq("id", participation!.id)
      .maybeSingle();
    expect(pRow).toBeNull();

    // …and the linked sub row went with it via ON DELETE CASCADE.
    const { data: subRow } = await admin
      .from("family_subscriptions")
      .select("id")
      .eq("stripe_subscription_id", "sub_cancel_test_1")
      .maybeSingle();
    expect(subRow).toBeNull();
  });

  it("returns kind='noop' when the participation does not exist (replayed deletion)", async () => {
    const result = await admin.rpc("cancel_participation", {
      p_participation_id: "00000000-0000-0000-0000-000000000ffe",
      p_reason: "subscription_cancelled",
    });
    expect((result.data as { kind: string }).kind).toBe("noop");
  });

  it("cancels a participation with no sub row and returns a null stripe sub id", async () => {
    // e.g. a single-payment camp participation an admin cancels — there's no
    // family_subscriptions row to read, so stripe_subscription_id comes back null.
    const { data: participation } = await admin
      .from("participations")
      .insert({
        product_id: PRODUCT_CANCEL,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      })
      .select("id")
      .single();

    const result = await admin.rpc("cancel_participation", {
      p_participation_id: participation!.id,
      p_reason: "admin_cancelled",
    });
    const body = result.data as {
      kind: string;
      stripe_subscription_id?: string | null;
    };
    expect(body.kind).toBe("cancelled");
    expect(body.stripe_subscription_id).toBeNull();
  });
});
