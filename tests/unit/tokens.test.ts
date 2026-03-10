import { describe, it, expect } from "vitest";
import {
  getPackageSavings,
  getPackagePrice,
  getTokenPackage,
  tokensToCurrencyDisplay,
  TOKEN_BASE_RATE,
  TOKEN_PACKAGES,
} from "@/lib/constants/tokens";
import type { SupportedCurrency } from "@/lib/constants/currency";

const CURRENCIES: SupportedCurrency[] = ["usd", "gbp", "eur"];

describe("getPackageSavings", () => {
  it("returns 0 when price equals base rate (no discount)", () => {
    const starter = getTokenPackage("tokens_5")!;
    for (const currency of CURRENCIES) {
      expect(getPackageSavings(starter, currency)).toBe(0);
    }
  });

  it("calculates savings as (tokens × base rate) - price", () => {
    const value = getTokenPackage("tokens_20")!;
    for (const currency of CURRENCIES) {
      const expected = value.tokens * TOKEN_BASE_RATE[currency] - value.prices[currency];
      expect(getPackageSavings(value, currency)).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it("returns positive savings for subscription package", () => {
    const monthly = getTokenPackage("tokens_sub_25")!;
    for (const currency of CURRENCIES) {
      const expected = monthly.tokens * TOKEN_BASE_RATE[currency] - monthly.prices[currency];
      expect(getPackageSavings(monthly, currency)).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });

  it("never returns a negative value", () => {
    for (const pkg of TOKEN_PACKAGES) {
      for (const currency of CURRENCIES) {
        expect(getPackageSavings(pkg, currency)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("getPackagePrice", () => {
  it("returns the correct price for each currency", () => {
    const starter = getTokenPackage("tokens_5")!;
    expect(getPackagePrice(starter, "usd")).toBe(1500);
    expect(getPackagePrice(starter, "gbp")).toBe(1200);
    expect(getPackagePrice(starter, "eur")).toBe(1400);
  });
});

describe("tokensToCurrencyDisplay", () => {
  it("converts tokens to USD display", () => {
    // 2 tokens × 300 cents = 600 cents = $6.00
    const result = tokensToCurrencyDisplay(2, "usd", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("6");
  });

  it("converts tokens to GBP display", () => {
    // 2 tokens × 240 cents = 480 pence = £4.80
    const result = tokensToCurrencyDisplay(2, "gbp", "en-US");
    expect(result).toContain("£");
    expect(result).toContain("4");
  });

  it("converts tokens to EUR display", () => {
    // 2 tokens × 280 cents = 560 cents = €5.60
    const result = tokensToCurrencyDisplay(2, "eur", "en-US");
    expect(result).toContain("€");
    expect(result).toContain("5");
  });

  it("returns zero for 0 tokens", () => {
    const result = tokensToCurrencyDisplay(0, "usd", "en-US");
    expect(result).toContain("$");
    expect(result).toContain("0");
  });
});
