import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stripe — must use vi.hoisted because `new Stripe()` runs at module load
const { mockProductsList, mockPricesList } = vi.hoisted(() => ({
  mockProductsList: vi.fn(),
  mockPricesList: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({
    products: { list: mockProductsList },
    prices: { list: mockPricesList },
  })),
}));

// Mock unstable_cache to pass through to the inner function (no caching in tests)
vi.mock("next/cache", () => ({
  unstable_cache: (fn: Function) => fn,
}));

// Import after mocks are set up
import { getStripeProducts, getProductByPriceId, getPackageSavings, tokensToCurrencyDisplay } from "@/lib/stripe/products";

function makeProduct(id: string, name: string, tokenAmount: number) {
  return {
    id,
    name,
    description: `${name} description`,
    metadata: { tokenAmount: String(tokenAmount) },
    default_price: null,
  };
}

function makePrice(id: string, productId: string, currency: string, unitAmount: number, type: "one_time" | "recurring") {
  return {
    id,
    product: productId,
    currency,
    unit_amount: unitAmount,
    active: true,
    type,
    ...(type === "recurring" ? { recurring: { interval: "month" } } : {}),
  };
}

describe("getStripeProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and categorizes products correctly", async () => {
    mockProductsList.mockResolvedValue({
      data: [
        makeProduct("prod_starter", "Starter Pack", 5),
        makeProduct("prod_basic", "Basic Sub", 10),
      ],
    });

    mockPricesList.mockImplementation(({ product }: { product: string }) => {
      if (product === "prod_starter") {
        return Promise.resolve({
          data: [
            makePrice("price_starter_usd", "prod_starter", "usd", 1500, "one_time"),
            makePrice("price_starter_gbp", "prod_starter", "gbp", 1200, "one_time"),
            makePrice("price_starter_eur", "prod_starter", "eur", 1400, "one_time"),
          ],
        });
      }
      return Promise.resolve({
        data: [
          makePrice("price_basic_usd", "prod_basic", "usd", 2500, "recurring"),
          makePrice("price_basic_gbp", "prod_basic", "gbp", 2000, "recurring"),
          makePrice("price_basic_eur", "prod_basic", "eur", 2300, "recurring"),
        ],
      });
    });

    const result = await getStripeProducts();

    expect(result.oneTimePackages).toHaveLength(1);
    expect(result.subscriptionPackages).toHaveLength(1);
    expect(result.oneTimePackages[0].name).toBe("Starter Pack");
    expect(result.oneTimePackages[0].tokenAmount).toBe(5);
    expect(result.oneTimePackages[0].type).toBe("one_time");
    expect(result.subscriptionPackages[0].name).toBe("Basic Sub");
    expect(result.subscriptionPackages[0].type).toBe("subscription");
  });

  it("sorts packages by price ascending", async () => {
    mockProductsList.mockResolvedValue({
      data: [
        makeProduct("prod_mega", "Mega Pack", 40),
        makeProduct("prod_starter", "Starter Pack", 5),
        makeProduct("prod_value", "Value Pack", 15),
      ],
    });

    mockPricesList.mockImplementation(({ product }: { product: string }) => {
      const priceMap: Record<string, number> = {
        prod_starter: 1500,
        prod_value: 4000,
        prod_mega: 10000,
      };
      return Promise.resolve({
        data: [
          makePrice(`price_${product}_usd`, product, "usd", priceMap[product], "one_time"),
          makePrice(`price_${product}_gbp`, product, "gbp", Math.round(priceMap[product] * 0.8), "one_time"),
          makePrice(`price_${product}_eur`, product, "eur", Math.round(priceMap[product] * 0.93), "one_time"),
        ],
      });
    });

    const result = await getStripeProducts();

    expect(result.oneTimePackages[0].name).toBe("Starter Pack");
    expect(result.oneTimePackages[1].name).toBe("Value Pack");
    expect(result.oneTimePackages[2].name).toBe("Mega Pack");
  });

  it("skips products without tokenAmount metadata", async () => {
    mockProductsList.mockResolvedValue({
      data: [
        { id: "prod_no_meta", name: "No Meta", description: "", metadata: {}, default_price: null },
        makeProduct("prod_starter", "Starter Pack", 5),
      ],
    });

    mockPricesList.mockResolvedValue({
      data: [
        makePrice("price_usd", "prod_starter", "usd", 1500, "one_time"),
        makePrice("price_gbp", "prod_starter", "gbp", 1200, "one_time"),
        makePrice("price_eur", "prod_starter", "eur", 1400, "one_time"),
      ],
    });

    const result = await getStripeProducts();

    expect(result.oneTimePackages).toHaveLength(1);
    expect(result.oneTimePackages[0].name).toBe("Starter Pack");
  });

  it("computes base rates from cheapest one-off package", async () => {
    mockProductsList.mockResolvedValue({
      data: [
        makeProduct("prod_starter", "Starter Pack", 5),
      ],
    });

    mockPricesList.mockResolvedValue({
      data: [
        makePrice("price_usd", "prod_starter", "usd", 1500, "one_time"),
        makePrice("price_gbp", "prod_starter", "gbp", 1200, "one_time"),
        makePrice("price_eur", "prod_starter", "eur", 1400, "one_time"),
      ],
    });

    const result = await getStripeProducts();

    // 1500 / 5 = 300, 1200 / 5 = 240, 1400 / 5 = 280
    expect(result.baseRates.usd).toBe(300);
    expect(result.baseRates.gbp).toBe(240);
    expect(result.baseRates.eur).toBe(280);
  });

  it("throws when no one-time packages exist", async () => {
    mockProductsList.mockResolvedValue({ data: [] });

    await expect(getStripeProducts()).rejects.toThrow(
      "No one-time packages found in Stripe"
    );
  });
});

describe("getProductByPriceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns product info for a valid priceId", async () => {
    mockProductsList.mockResolvedValue({
      data: [makeProduct("prod_starter", "Starter Pack", 5)],
    });

    mockPricesList.mockResolvedValue({
      data: [
        makePrice("price_starter_usd", "prod_starter", "usd", 1500, "one_time"),
        makePrice("price_starter_gbp", "prod_starter", "gbp", 1200, "one_time"),
        makePrice("price_starter_eur", "prod_starter", "eur", 1400, "one_time"),
      ],
    });

    const result = await getProductByPriceId("price_starter_usd");

    expect(result).toEqual({
      stripeProductId: "prod_starter",
      tokenAmount: 5,
      type: "one_time",
      currency: "usd",
    });
  });

  it("returns null for an unknown priceId", async () => {
    mockProductsList.mockResolvedValue({
      data: [makeProduct("prod_starter", "Starter Pack", 5)],
    });
    mockPricesList.mockResolvedValue({
      data: [
        makePrice("price_starter_usd", "prod_starter", "usd", 1500, "one_time"),
        makePrice("price_starter_gbp", "prod_starter", "gbp", 1200, "one_time"),
        makePrice("price_starter_eur", "prod_starter", "eur", 1400, "one_time"),
      ],
    });

    const result = await getProductByPriceId("price_nonexistent");

    expect(result).toBeNull();
  });
});

describe("getPackageSavings", () => {
  it("returns positive savings when price is below base rate", () => {
    expect(getPackageSavings(4000, 15, 300)).toBe(500);
  });

  it("returns 0 when price equals base rate", () => {
    expect(getPackageSavings(1500, 5, 300)).toBe(0);
  });

  it("returns 0 when price exceeds base rate", () => {
    expect(getPackageSavings(2000, 5, 300)).toBe(0);
  });
});

describe("tokensToCurrencyDisplay", () => {
  it("formats correctly", () => {
    const result = tokensToCurrencyDisplay(10, 300, "usd", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("30");
  });
});
