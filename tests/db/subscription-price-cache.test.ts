import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminTestClient } from "./helpers";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * `product_subscription_prices` caches one Stripe Price per (product, currency).
 * When an admin changes a club's price the cached row is *repointed* at a
 * replacement Price, because Stripe Prices are immutable.
 *
 * That repoint is written as an upsert with `onConflict: "product_id,currency"`.
 * Whether that conflict target is valid is a question only Postgres can answer:
 * it has to name a real unique constraint, or the write fails with "no unique or
 * exclusion constraint matching the ON CONFLICT specification" — which a mocked
 * PostgREST cannot reproduce, and which would mean every price change 500s in
 * production. These tests pin it against the real schema.
 */

const PRODUCT_PRICE_CACHE = "00000000-0000-0000-0000-0000000005d1";
const admin = createAdminTestClient();

async function readCache() {
  const { data, error } = await admin
    .from("product_subscription_prices")
    .select("stripe_price_id, unit_amount_cents")
    .eq("product_id", PRODUCT_PRICE_CACHE)
    .eq("currency", "eur");
  if (error) throw error;
  return data;
}

describe("product_subscription_prices — Stripe Price cache", () => {
  beforeAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_PRICE_CACHE]);
    await createTestProduct(admin, {
      id: PRODUCT_PRICE_CACHE,
      productType: "consumer_club",
      billingMode: "paid",
    });
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT_PRICE_CACHE]);
  });

  it("repoints the cached Price in place when the amount changes", async () => {
    const insert = await admin.from("product_subscription_prices").upsert(
      {
        product_id: PRODUCT_PRICE_CACHE,
        currency: "eur",
        stripe_price_id: "price_first",
        unit_amount_cents: 1000,
      },
      { onConflict: "product_id,currency" },
    );
    expect(insert.error).toBeNull();

    // The price change: same (product, currency), new Price and amount. A plain
    // insert would fail here on the primary key; the upsert must update.
    const repoint = await admin.from("product_subscription_prices").upsert(
      {
        product_id: PRODUCT_PRICE_CACHE,
        currency: "eur",
        stripe_price_id: "price_second",
        unit_amount_cents: 2000,
      },
      { onConflict: "product_id,currency" },
    );
    expect(repoint.error).toBeNull();

    // Exactly one row, carrying the new Price — not two rows, and not the old
    // amount that checkout would have gone on billing.
    expect(await readCache()).toEqual([
      { stripe_price_id: "price_second", unit_amount_cents: 2000 },
    ]);
  });

  it("rejects a conflict target that is not a real unique constraint", async () => {
    // Guards against narrowing the target to `product_id`, which looks correct
    // and passes any mock, but has no matching constraint in Postgres.
    const { error } = await admin.from("product_subscription_prices").upsert(
      {
        product_id: PRODUCT_PRICE_CACHE,
        currency: "eur",
        stripe_price_id: "price_third",
        unit_amount_cents: 3000,
      },
      { onConflict: "product_id" },
    );
    // Assert the specific code: a bare "some error happened" would also pass on
    // a grant problem or a check violation, and this test now carries the whole
    // conflict-target guarantee on the database side.
    expect(error?.code).toBe("42P10");
  });
});
