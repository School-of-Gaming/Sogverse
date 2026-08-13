import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// --- Stripe mock ---
//
// The module creates Prices, and finds/creates/reconciles the Stripe Product
// that owns them.

const { stripeMock } = await vi.hoisted(async () => ({
  stripeMock: (await import("../../mocks/stripe")).createStripeMock(),
}));

vi.mock("stripe", async () =>
  (await import("../../mocks/stripe")).stripeModuleMock(stripeMock),
);

const mockPricesCreate = stripeMock.prices.create;
const mockProductsSearch = stripeMock.products.search;
const mockProductsCreate = stripeMock.products.create;
const mockProductsUpdate = stripeMock.products.update;

import {
  ensureStripeProductForProduct,
  getOrCreateSubscriptionPrice,
  type StripeProductSource,
} from "@/lib/stripe/participation-prices";

// These run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the genuine query builder issues each
// PostgREST request and the assertions read what actually went over the wire.

const PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const STRIPE_PRODUCT_ID = "prod_test";

const CACHE_PATH = "/rest/v1/product_subscription_prices";
const CATALOGUE_PATH = "/rest/v1/product_prices";

/**
 * The product row the caller hands over. The helpers never read `products`
 * themselves — the checkout route reads it once and passes it down, so the
 * Stripe Product and the purchase metadata describe the same row.
 */
const CLUB: StripeProductSource = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  spoken_language_code: "en",
  start_date: "2026-09-01",
  end_date: null,
  product_translations: [{ locale: "en", name: "Test Club" }],
};

const CAMP: StripeProductSource = {
  ...CLUB,
  product_type: "camp",
  spoken_language_code: "fi",
  start_date: "2026-08-03",
  end_date: "2026-08-07",
  product_translations: [{ locale: "en", name: "Summer Camp" }],
};

/** A Stripe Product as `products.search` hands it back. */
function stripeProduct(
  overrides: {
    name?: string;
    /** Expandable: Stripe hands back an id, or the object when expanded. */
    taxCode?: string | { id: string } | null;
    metadata?: Record<string, string>;
  } = {},
) {
  return {
    id: STRIPE_PRODUCT_ID,
    name: overrides.name ?? "Test Club",
    tax_code:
      overrides.taxCode === undefined ? "txcd_10000000" : overrides.taxCode,
    metadata: overrides.metadata ?? {
      product_id: PRODUCT_ID,
      spoken_language_code: "en",
      delivery_start: "2026-09-01",
    },
  };
}

interface CacheRow {
  product_id: string;
  currency: string;
  stripe_price_id: string;
  unit_amount_cents: number;
}

/**
 * Narrows a POSTed request body to a cache row. Validating rather than
 * asserting means a malformed write fails the test loudly instead of being
 * silently reshaped into the type the assertions expect.
 */
function toCacheRow(value: unknown): CacheRow {
  if (
    typeof value === "object" &&
    value !== null &&
    "product_id" in value &&
    typeof value.product_id === "string" &&
    "currency" in value &&
    typeof value.currency === "string" &&
    "stripe_price_id" in value &&
    typeof value.stripe_price_id === "string" &&
    "unit_amount_cents" in value &&
    typeof value.unit_amount_cents === "number"
  ) {
    return {
      product_id: value.product_id,
      currency: value.currency,
      stripe_price_id: value.stripe_price_id,
      unit_amount_cents: value.unit_amount_cents,
    };
  }
  throw new Error(`Unexpected cache write body: ${JSON.stringify(value)}`);
}

function cacheRow(stripePriceId: string, unitAmountCents: number): CacheRow {
  return {
    product_id: PRODUCT_ID,
    currency: "eur",
    stripe_price_id: stripePriceId,
    unit_amount_cents: unitAmountCents,
  };
}

/**
 * How the cache-table write actually went out. The db test proves Postgres
 * accepts this conflict target; only this proves the module *sends* it, so
 * a revert to a plain insert (which would collide on every price change)
 * cannot pass unnoticed.
 */
function cacheWriteRequest(fetchMock: FetchMock) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      requestedUrl(input).pathname === CACHE_PATH &&
      (init?.method ?? "GET") !== "GET",
  );
  if (!call) throw new Error("no cache write was issued");
  return {
    onConflict: requestedUrl(call[0]).searchParams.get("on_conflict"),
    prefer: new Headers(call[1]?.headers).get("Prefer") ?? "",
  };
}

describe("getOrCreateSubscriptionPrice", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;
  /** Every row written to the cache table, in order. */
  let writes: CacheRow[];

  /**
   * Serves the cache table and the catalogue price, recording cache writes.
   *
   * A dumb store on purpose: whether the write's conflict target is valid is a
   * question only Postgres can answer, and it is pinned in
   * tests/db/subscription-price-cache.test.ts. Reimplementing PostgREST's
   * upsert encoding here would fail on a supabase-js change rather than a bug.
   */
  function mockBackend(state: {
    cache: CacheRow | null;
    basePriceCents: number | null;
    /** Simulates the cache write failing outright (5xx, timeout, RLS). */
    writeFails?: boolean;
  }) {
    fetchMock.mockImplementation((input, init) => {
      const url = requestedUrl(input);
      const method = init?.method ?? "GET";

      if (url.pathname === CACHE_PATH) {
        // `.maybeSingle()` post-processes an array: [] becomes null.
        if (method === "GET") {
          return Promise.resolve(
            postgrestJson(state.cache === null ? [] : [state.cache]),
          );
        }

        if (state.writeFails === true) {
          return Promise.resolve(postgrestError("write failed", 500));
        }

        // The body may be a bare row or an array of them.
        const parsed: unknown = JSON.parse(String(init?.body));
        const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
        const written = toCacheRow(rows[0]);
        writes.push(written);
        state.cache = written;
        // `.single()` wants a bare object.
        return Promise.resolve(postgrestJson(written));
      }

      if (url.pathname === CATALOGUE_PATH && method === "GET") {
        return Promise.resolve(
          postgrestJson(
            state.basePriceCents === null
              ? []
              : [{ price_cents: state.basePriceCents }],
          ),
        );
      }

      return Promise.reject(
        new Error(`Unexpected fetch: ${method} ${url.pathname}`),
      );
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    fetchMock = vi.fn<typeof fetch>();
    supabase = createFetchStubbedClient(fetchMock);
    mockProductsSearch.mockResolvedValue({ data: [stripeProduct()] });
    let n = 0;
    mockPricesCreate.mockImplementation(async () => ({
      id: `price_new_${++n}`,
    }));
  });

  it("mints a replacement Price when the cached amount is stale", async () => {
    // The regression: an admin raised the club's price from EUR 10 to EUR 20.
    // The cache still points at the EUR 10 Price, so checkout kept billing
    // EUR 10 while the product page advertised EUR 20.
    mockBackend({ cache: cacheRow("price_old", 1000), basePriceCents: 2000 });

    const row = await getOrCreateSubscriptionPrice(supabase, CLUB, "eur");

    expect(mockPricesCreate).toHaveBeenCalledTimes(1);
    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      unit_amount: 2000,
    });
    expect(row?.stripe_price_id).toBe("price_new_1");
    expect(row?.unit_amount_cents).toBe(2000);
    // The cache row must be repointed, not left behind.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      stripe_price_id: "price_new_1",
      unit_amount_cents: 2000,
    });
    // ...and repointing only works as an upsert on the real primary key. A
    // plain insert collides with the row already there, so every price change
    // would fail in Postgres while a mocked transport happily accepted it.
    const write = cacheWriteRequest(fetchMock);
    expect(write.onConflict).toBe("product_id,currency");
    expect(write.prefer).toContain("resolution=merge-duplicates");
  });

  it("reuses the cached Price when it matches the catalogue amount", async () => {
    mockBackend({
      cache: cacheRow("price_current", 2000),
      basePriceCents: 2000,
    });

    const row = await getOrCreateSubscriptionPrice(supabase, CLUB, "eur");

    expect(row?.stripe_price_id).toBe("price_current");
    expect(mockPricesCreate).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("leaves the Stripe Product alone entirely when the cached Price still matches", async () => {
    // Deliberate, and the one place club behaviour differs from a camp's: the
    // Stripe-product call sits *below* the price-cache early return, so a club
    // reconciles only on its first sale and on a price change. Lifting it above
    // would put a Stripe round trip on every club checkout — the
    // customer-blocking path — to refresh cosmetic metadata. The tax code, the
    // only money-critical field, cannot drift because nothing changes it.
    mockBackend({
      cache: cacheRow("price_current", 2000),
      basePriceCents: 2000,
    });

    await getOrCreateSubscriptionPrice(supabase, CLUB, "eur");

    expect(mockProductsSearch).not.toHaveBeenCalled();
    expect(mockProductsUpdate).not.toHaveBeenCalled();
  });

  it("creates and caches a Price on first use", async () => {
    mockBackend({ cache: null, basePriceCents: 5900 });

    const row = await getOrCreateSubscriptionPrice(supabase, CLUB, "eur");

    expect(row?.unit_amount_cents).toBe(5900);
    expect(writes).toHaveLength(1);
  });

  it("creates Prices as VAT-inclusive monthly recurring, tagged for lookup", async () => {
    // tax_behavior is immutable once set: a Price minted as exclusive would add
    // VAT on top for every future subscriber and could only be replaced.
    mockBackend({ cache: null, basePriceCents: 5900 });

    await getOrCreateSubscriptionPrice(supabase, CLUB, "eur");

    expect(mockPricesCreate.mock.calls[0][0]).toMatchObject({
      product: STRIPE_PRODUCT_ID,
      currency: "eur",
      unit_amount: 5900,
      tax_behavior: "inclusive",
      recurring: { interval: "month", interval_count: 1 },
      metadata: { productId: PRODUCT_ID, currency: "eur" },
    });
  });

  it("refuses to sell on a cached Price once the catalogue price is gone", async () => {
    // De-listing a product in a currency removes its product_prices row. The
    // cached Price outlives it, but selling on it would keep taking money for
    // something the catalogue says is no longer for sale, at an amount nothing
    // confirms. The caller turns null into "Product is not sold in {currency}".
    mockBackend({
      cache: cacheRow("price_current", 2000),
      basePriceCents: null,
    });

    expect(
      await getOrCreateSubscriptionPrice(supabase, CLUB, "eur"),
    ).toBeNull();
    expect(mockPricesCreate).not.toHaveBeenCalled();
  });

  it("fails closed rather than billing the stale Price when the cache write fails", async () => {
    // The write is what repoints the row. If it fails, the only row on hand is
    // the superseded one — returning it would charge the old amount, which is
    // the very bug this function exists to prevent.
    mockBackend({
      cache: cacheRow("price_old", 1000),
      basePriceCents: 2000,
      writeFails: true,
    });

    await expect(
      getOrCreateSubscriptionPrice(supabase, CLUB, "eur"),
    ).rejects.toThrow();
  });

  it("fails closed when the catalogue price cannot be read", async () => {
    // A failed read must not be mistaken for "not sold in this currency" and
    // must not fall back to the cached amount.
    fetchMock.mockImplementation((input) => {
      const url = requestedUrl(input);
      if (url.pathname === CACHE_PATH) {
        return Promise.resolve(postgrestJson([cacheRow("price_old", 1000)]));
      }
      return Promise.resolve(postgrestError("catalogue read failed", 500));
    });

    await expect(
      getOrCreateSubscriptionPrice(supabase, CLUB, "eur"),
    ).rejects.toThrow();
  });
});

describe("ensureStripeProductForProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsCreate.mockResolvedValue({ id: "prod_created" });
  });

  it("creates a camp's Product under the reduced-rate tax code, with the delivery facts", async () => {
    // The bug this exists to fix: with no tax code, Stripe fell back to the
    // account default and charged camps Finland's standard 25.5% instead of the
    // reduced 13.5%. Prices are VAT-inclusive, so the difference came out of
    // margin rather than off the customer's bill.
    mockProductsSearch.mockResolvedValue({ data: [] });

    const id = await ensureStripeProductForProduct(CAMP);

    expect(id).toBe("prod_created");
    expect(mockProductsCreate.mock.calls[0][0]).toEqual({
      name: "Summer Camp",
      tax_code: "txcd_35010001",
      metadata: {
        product_id: PRODUCT_ID,
        spoken_language_code: "fi",
        delivery_start: "2026-08-03",
        delivery_end: "2026-08-07",
      },
    });
  });

  it("creates a club's Product under the standard tax code", async () => {
    mockProductsSearch.mockResolvedValue({ data: [] });

    await ensureStripeProductForProduct(CLUB);

    expect(mockProductsCreate.mock.calls[0][0]).toMatchObject({
      tax_code: "txcd_10000000",
    });
  });

  it("omits a delivery key entirely when its date is null", async () => {
    // `end_date` is nullable only for consumer clubs; a check constraint forces
    // it for camps and events. An empty string would be a *removal* instruction
    // on an update, so absence is spelled as absence on the create.
    mockProductsSearch.mockResolvedValue({ data: [] });

    await ensureStripeProductForProduct(CLUB);

    const metadata = mockProductsCreate.mock.calls[0][0].metadata;
    expect(metadata).not.toHaveProperty("delivery_end");
    expect(metadata).toMatchObject({ delivery_start: "2026-09-01" });
  });

  it("passes a deterministic idempotency key derived from the product id", async () => {
    // Stripe's product search is eventually consistent (roughly a minute), so
    // two first purchases seconds apart can both miss and both create. The key
    // is what makes Stripe answer the second with the first one's product. The
    // race itself is not reproducible by hand; the key is the verifiable proxy.
    mockProductsSearch.mockResolvedValue({ data: [] });

    await ensureStripeProductForProduct(CAMP);

    expect(mockProductsCreate.mock.calls[0][1]).toEqual({
      idempotencyKey: `stripe-product:${PRODUCT_ID}`,
    });
  });

  it("reuses the Product the search found, and issues no update when nothing differs", async () => {
    mockProductsSearch.mockResolvedValue({ data: [stripeProduct()] });

    const id = await ensureStripeProductForProduct(CLUB);

    expect(id).toBe(STRIPE_PRODUCT_ID);
    expect(mockProductsCreate).not.toHaveBeenCalled();
    expect(mockProductsUpdate).not.toHaveBeenCalled();
  });

  it("reconciles a renamed, retimed, relanguaged product in place", async () => {
    // The helper used to return early on a hit and never reconcile, so a
    // product renamed after its first sale kept its stale Stripe values
    // forever. Stripe Products are mutable in name, tax code and metadata
    // (unlike Price amounts), so this is an update rather than a replacement.
    mockProductsSearch.mockResolvedValue({
      data: [
        stripeProduct({
          name: "Old Name",
          metadata: {
            product_id: PRODUCT_ID,
            spoken_language_code: "sv",
            delivery_start: "2025-01-01",
          },
        }),
      ],
    });

    await ensureStripeProductForProduct(CLUB);

    expect(mockProductsUpdate).toHaveBeenCalledWith(STRIPE_PRODUCT_ID, {
      name: "Test Club",
      metadata: {
        spoken_language_code: "en",
        delivery_start: "2026-09-01",
      },
    });
  });

  it("corrects a Product carrying no tax code, or the wrong one", async () => {
    // What the backfill and the reconcile are both for: every club Product that
    // predates this change carries no tax code at all.
    mockProductsSearch.mockResolvedValue({
      data: [
        stripeProduct({
          name: "Summer Camp",
          taxCode: null,
          metadata: {
            product_id: PRODUCT_ID,
            spoken_language_code: "fi",
            delivery_start: "2026-08-03",
            delivery_end: "2026-08-07",
          },
        }),
      ],
    });

    await ensureStripeProductForProduct(CAMP);

    expect(mockProductsUpdate).toHaveBeenCalledWith(STRIPE_PRODUCT_ID, {
      tax_code: "txcd_35010001",
    });
  });

  it("reads an expanded tax code object as well as a bare id", async () => {
    // `tax_code` is expandable. Reading only the string form would see every
    // expanded product as untagged and rewrite the code it already carries.
    mockProductsSearch.mockResolvedValue({
      data: [stripeProduct({ taxCode: { id: "txcd_10000000" } })],
    });

    await ensureStripeProductForProduct(CLUB);

    expect(mockProductsUpdate).not.toHaveBeenCalled();
  });

  it("removes a metadata key it no longer sets, which Stripe spells as an empty string", async () => {
    // A club that loses its end date. Omitting the key from the update payload
    // means "leave it alone", so the stale value would survive forever.
    mockProductsSearch.mockResolvedValue({
      data: [
        stripeProduct({
          metadata: {
            product_id: PRODUCT_ID,
            spoken_language_code: "en",
            delivery_start: "2026-09-01",
            delivery_end: "2026-12-20",
          },
        }),
      ],
    });

    await ensureStripeProductForProduct(CLUB);

    expect(mockProductsUpdate).toHaveBeenCalledWith(STRIPE_PRODUCT_ID, {
      metadata: { delivery_end: "" },
    });
  });

  it("leaves metadata it does not own untouched", async () => {
    // Only the four managed keys are diffed, so a key set by hand in the
    // dashboard is not silently deleted by the next purchase.
    mockProductsSearch.mockResolvedValue({
      data: [
        stripeProduct({
          metadata: {
            product_id: PRODUCT_ID,
            spoken_language_code: "en",
            delivery_start: "2026-09-01",
            set_by_hand: "keep me",
          },
        }),
      ],
    });

    await ensureStripeProductForProduct(CLUB);

    expect(mockProductsUpdate).not.toHaveBeenCalled();
  });

  it("raises rather than naming a Product generically when translations are missing", async () => {
    // Fail closed. Every product is DB-guaranteed at least one translation, so
    // an empty array means the row was not read properly — and the same read
    // decides the tax code, where degrading quietly would mint a camp's Product
    // at the standard rate and leave it there permanently.
    mockProductsSearch.mockResolvedValue({ data: [] });

    await expect(
      ensureStripeProductForProduct({ ...CAMP, product_translations: [] }),
    ).rejects.toThrow(/no translation/);
    expect(mockProductsCreate).not.toHaveBeenCalled();
  });
});
