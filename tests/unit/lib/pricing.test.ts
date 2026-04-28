import { describe, it, expect } from "vitest";
import {
  BUNDLE_DISCOUNTS,
  SUBSCRIPTION_DISCOUNTS,
  computeBundleCents,
  computeSubscriptionCents,
} from "@/lib/constants/pricing";

// These functions back every parent-facing price the platform shows: bundle
// purchases, subscription tiers, and downstream Stripe Price creation.
// A silent regression here is a real-money pricing bug — these tests pin
// the formulas + rounding behavior.

describe("computeBundleCents", () => {
  it("returns the per-session price for size 1 (no discount)", () => {
    expect(computeBundleCents(1000, 1)).toBe(1000);
  });

  it("applies the 5% discount to bundles of 4", () => {
    // 1000 * 4 * 0.95 = 3800
    expect(computeBundleCents(1000, 4)).toBe(3800);
  });

  it("applies the 12% discount to bundles of 10", () => {
    // 1000 * 10 * 0.88 = 8800
    expect(computeBundleCents(1000, 10)).toBe(8800);
  });

  it("rounds half-cents away from zero (Math.round)", () => {
    // 1234 cents * 4 * 0.95 = 4689.2 → 4689
    expect(computeBundleCents(1234, 4)).toBe(4689);
    // 1234 cents * 10 * 0.88 = 10859.2 → 10859
    expect(computeBundleCents(1234, 10)).toBe(10859);
  });

  it("returns the raw price for unknown bundle sizes (treated as 0% off)", () => {
    expect(computeBundleCents(1000, 7)).toBe(7000);
  });

  it("matches the documented discount rates", () => {
    // Lock the table so renaming a key (or adding a new tier) trips the test.
    expect(BUNDLE_DISCOUNTS[1]).toBe(0);
    expect(BUNDLE_DISCOUNTS[4]).toBe(0.05);
    expect(BUNDLE_DISCOUNTS[10]).toBe(0.12);
  });
});

describe("computeSubscriptionCents", () => {
  it("monthly: pays exactly the entered monthly price", () => {
    expect(computeSubscriptionCents(3000, "monthly")).toBe(3000);
  });

  it("quarterly: 3 months × 20% off", () => {
    // 3000 * 3 * 0.80 = 7200
    expect(computeSubscriptionCents(3000, "quarterly")).toBe(7200);
  });

  it("yearly: 12 months × 30% off", () => {
    // 3000 * 12 * 0.70 = 25200
    expect(computeSubscriptionCents(3000, "yearly")).toBe(25200);
  });

  it("rounds half-cents away from zero", () => {
    // 1234 * 3 * 0.80 = 2961.6 → 2962
    expect(computeSubscriptionCents(1234, "quarterly")).toBe(2962);
    // 1234 * 12 * 0.70 = 10365.6 → 10366
    expect(computeSubscriptionCents(1234, "yearly")).toBe(10366);
  });

  it("matches the documented discount rates", () => {
    expect(SUBSCRIPTION_DISCOUNTS.monthly).toBe(0);
    expect(SUBSCRIPTION_DISCOUNTS.quarterly).toBe(0.20);
    expect(SUBSCRIPTION_DISCOUNTS.yearly).toBe(0.30);
  });

  it("preserves the commitment ladder — yearly per-month < quarterly < monthly", () => {
    // Per-month effective price must decrease as commitment increases,
    // otherwise the ladder is broken (a parent could pay less for a shorter
    // commitment, which makes the longer tier pointless).
    const base = 1000;
    const monthly = computeSubscriptionCents(base, "monthly") / 1;
    const quarterly = computeSubscriptionCents(base, "quarterly") / 3;
    const yearly = computeSubscriptionCents(base, "yearly") / 12;
    expect(quarterly).toBeLessThan(monthly);
    expect(yearly).toBeLessThan(quarterly);
  });
});
