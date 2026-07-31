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
// `prices.update` is stubbed purely so a test can assert we never reach for it:
// a superseded Price must stay active, because live subscriptions still bill
// against it.

const {
  mockPricesCreate,
  mockPricesUpdate,
  mockProductsSearch,
  mockProductsCreate,
} = vi.hoisted(() => ({
  mockPricesCreate: vi.fn(),
  mockPricesUpdate: vi.fn(),
  mockProductsSearch: vi.fn(),
  mockProductsCreate: vi.fn(),
}));

vi.mock("stripe", () => {
  const StripeMock = vi.fn(function () {
    return {
      prices: { create: mockPricesCreate, update: mockPricesUpdate },
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

describe("getOrCreateSubscriptionPrice", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;
  /** Every row written to the cache table, in order. */
  let writes: CacheRow[];

  /**
   * Serves the cache table and the catalogue price, recording cache writes.
   *
   * The cache table enforces its primary key, so a plain insert over an
   * existing row fails the way real Postgres would. Without that, a regression
   * from upsert back to insert would pass here and only surface in production.
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

        // PostgREST signals an upsert via on_conflict + a merge-duplicates
        // Prefer header; a bare insert has neither and must collide.
        // The conflict target must name the real PK. `on_conflict=product_id`
        // alone would pass a presence check here and fail in Postgres with "no
        // unique or exclusion constraint matching the ON CONFLICT
        // specification" — i.e. every price change 500s while CI stays green.
        const headers = new Headers(init?.headers);
        const isUpsert =
          url.searchParams.get("on_conflict") === "product_id,currency" &&
          (headers.get("Prefer") ?? "").includes("resolution=merge-duplicates");
        if (state.cache !== null && !isUpsert) {
          return Promise.resolve(
            postgrestError(
              'duplicate key value violates unique constraint "product_subscription_prices_pkey"',
              409,
            ),
          );
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
    mockPricesCreate.mockImplementation(async () => ({ id: `price_new_${++n}` }));
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
  });

  it("leaves the superseded Price active so live subscriptions keep billing", async () => {
    mockBackend({ cache: cacheRow("price_old", 1000), basePriceCents: 2000 });

    await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur");

    expect(mockPricesUpdate).not.toHaveBeenCalled();
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

  it("returns null when the product is not sold in the currency at all", async () => {
    mockBackend({ cache: null, basePriceCents: null });

    expect(
      await getOrCreateSubscriptionPrice(supabase, PRODUCT_ID, "eur"),
    ).toBeNull();
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
