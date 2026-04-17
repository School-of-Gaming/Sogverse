import { describe, it, expect, vi } from "vitest";

// Mock Stripe to prevent initialization error when importing from stripe/products
vi.mock("stripe", () => ({
  default: vi.fn(function () {
    return {
      products: { list: vi.fn() },
      prices: { list: vi.fn() },
    };
  }),
}));

import { getPackageSavings, tokensToCurrencyDisplay } from "@/lib/stripe/products";
import type { SupportedCurrency } from "@/lib/constants/currency";

const CURRENCIES: SupportedCurrency[] = ["usd", "gbp", "eur"];

describe("getPackageSavings", () => {
  it("returns 0 when price equals base rate (no discount)", () => {
    // 5 tokens × 300 cents/token = 1500 cents. Price = 1500 → 0 savings.
    expect(getPackageSavings(1500, 5, 300)).toBe(0);
  });

  it("calculates savings as (tokens × base rate) - price", () => {
    // 15 tokens × 300 cents/token = 4500 cents. Price = 4000 → 500 savings.
    expect(getPackageSavings(4000, 15, 300)).toBe(500);
  });

  it("never returns a negative value", () => {
    // Price exceeds base rate expectation → should clamp to 0, not negative.
    expect(getPackageSavings(5000, 5, 300)).toBe(0);
  });

  it("works for subscription packages with savings", () => {
    // 25 tokens × 300 = 7500. Price = 5000 → 2500 savings.
    expect(getPackageSavings(5000, 25, 300)).toBe(2500);
  });
});

describe("tokensToCurrencyDisplay", () => {
  it("converts tokens to USD display", () => {
    // 2 tokens × 300 cents = 600 cents = $6.00
    const result = tokensToCurrencyDisplay(2, 300, "usd", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("6");
  });

  it("converts tokens to GBP display", () => {
    // 2 tokens × 240 cents = 480 pence = £4.80
    const result = tokensToCurrencyDisplay(2, 240, "gbp", "en-US");
    expect(result).toContain("£");
    expect(result).toContain("4");
  });

  it("converts tokens to EUR display", () => {
    // 2 tokens × 280 cents = 560 cents = €5.60
    const result = tokensToCurrencyDisplay(2, 280, "eur", "en-US");
    expect(result).toContain("€");
    expect(result).toContain("5");
  });

  it("returns zero for 0 tokens", () => {
    const result = tokensToCurrencyDisplay(0, 300, "usd", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("0");
  });

  it("works across all supported currencies", () => {
    const rates: Record<SupportedCurrency, number> = { usd: 300, gbp: 240, eur: 280 };
    for (const currency of CURRENCIES) {
      const result = tokensToCurrencyDisplay(1, rates[currency], currency, "en-US");
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
