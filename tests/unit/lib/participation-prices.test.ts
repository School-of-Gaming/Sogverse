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
// The module creates Prices and looks up the Stripe Product that owns them.

const { mockPricesCreate, mockProductsSearch, mockProductsCreate } = vi.hoisted(
  () => ({
    mockPricesCreate: vi.fn(),
    mockProductsSearch: vi.fn(),
    mockProductsCreate: vi.fn(),
  }),
);

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      prices: { create: mockPricesCreate },
      products: { search: mockProductsSearch, create: mockProductsCreate },
    };
  });
  return { default: StripeMock };
});

import { getOrCreateSubscriptionPrice } from "@/lib/stripe/participation-prices";

// These run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the genuine query builder issues each
// PostgREST request and the assertions read what actually went over the wire.

const PRODUCT_ID = "33333333-3333-3333-3333-333333333333";
const STRIPE_PRODUCT_ID = "prod_test";

const CACHE_PATH = "/rest/v1/product_subscription_prices";
const CATALOGUE_PATH = "/rest/v1/product_prices";

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
    mockProductsSearch.mockResolvedValue({ data: [{ id: STRIPE_PRODUCT_ID }] });
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

    const row = await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur");

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

    const row = await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur");

    expect(row?.stripe_price_id).toBe("price_current");
    expect(mockPricesCreate).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("creates and caches a Price on first use", async () => {
    mockBackend({ cache: null, basePriceCents: 5900 });

    const row = await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur");

    expect(row?.unit_amount_cents).toBe(5900);
    expect(writes).toHaveLength(1);
  });

  it("creates Prices as VAT-inclusive monthly recurring, tagged for lookup", async () => {
    // tax_behavior is immutable once set: a Price minted as exclusive would add
    // VAT on top for every future subscriber and could only be replaced.
    mockBackend({ cache: null, basePriceCents: 5900 });

    await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur");

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
      await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur"),
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
      getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur"),
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
      getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur"),
    ).rejects.toThrow();
  });
});
