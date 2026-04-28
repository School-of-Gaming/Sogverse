// Platform-wide pricing discounts per docs/products-redesign.md §4.5.
//
// The admin only ever enters the base price_per_session and price_per_month
// on a product. The derived prices (bundles, quarterly/yearly subs, family
// sub coupons) are computed from these constants downstream — parent
// checkout UI, Stripe Price creation, and the Stripe coupon for family
// subscriptions.
//
// Changing a value here affects every future purchase. Existing Stripe
// subscriptions keep their current price until manually migrated.

/**
 * One-off bundle sizes offered to parents and their discount vs. buying
 * sessions individually. Bundle 1 is effectively "single session".
 *
 * Discounts sit *below* the comparable subscription tier so that any sub
 * beats any bundle of the same duration — see the commitment ladder in
 * docs/products-redesign.md §4.5a and `SUBSCRIPTION_DISCOUNTS` below.
 */
export const BUNDLE_DISCOUNTS: Record<number, number> = {
  1: 0,
  4: 0.05,
  10: 0.12,
};

/**
 * Ordered for display (UI iterates this, not Object.keys).
 */
export const BUNDLE_SIZES: readonly number[] = [1, 4, 10];

/**
 * Subscription frequency discounts off the base monthly price the admin
 * enters. Monthly is the base rate (no further discount); longer-commitment
 * tiers (quarterly, yearly) get a percent off the equivalent number of
 * months at that base rate.
 *
 *   monthly   → 0  (parents pay exactly what the admin entered)
 *   quarterly → 20% off (3 × monthly × 0.80)
 *   yearly    → 30% off (12 × monthly × 0.70)
 */
export const SUBSCRIPTION_DISCOUNTS: Record<SubscriptionFrequency, number> = {
  monthly: 0,
  quarterly: 0.20,
  yearly: 0.30,
};

export const SUBSCRIPTION_FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number];

export const SUBSCRIPTION_FREQUENCY_MONTHS: Record<SubscriptionFrequency, number> =
  {
    monthly: 1,
    quarterly: 3,
    yearly: 12,
  };

/**
 * Flat multi-child discount applied to a family subscription when ≥ 2
 * distinct gamers have items on the sub. Attached as a platform-wide
 * Stripe coupon.
 */
export const FAMILY_DISCOUNT_PERCENT = 0.10;

/**
 * Bundle total price in cents. Rounds to the nearest cent so Stripe doesn't
 * see fractional amounts.
 */
export function computeBundleCents(
  pricePerSessionCents: number,
  bundleSize: number
): number {
  const discount = BUNDLE_DISCOUNTS[bundleSize] ?? 0;
  return Math.round(pricePerSessionCents * bundleSize * (1 - discount));
}

/**
 * Subscription period total price in cents.
 */
export function computeSubscriptionCents(
  pricePerMonthCents: number,
  frequency: SubscriptionFrequency
): number {
  const discount = SUBSCRIPTION_DISCOUNTS[frequency];
  const months = SUBSCRIPTION_FREQUENCY_MONTHS[frequency];
  return Math.round(pricePerMonthCents * months * (1 - discount));
}
