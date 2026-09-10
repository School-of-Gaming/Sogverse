import type Stripe from "stripe";

/**
 * When the subscription's current period ends, as a unix instant.
 *
 * Stripe moved `current_period_end` from the subscription onto each
 * subscription *item* in the 2025-03-31 API version, and our integration
 * straddles that change: a subscription created before it still answers with
 * the field on the subscription, one created after it only on the item. So both
 * are read, item first, and a subscription carrying neither answers null rather
 * than a guess.
 *
 * Shared by the products webhook (which stores it) and the club switch's check
 * (which states when a cancelling subscription runs out), so the two cannot
 * drift into disagreeing about the same subscription.
 */
export function currentPeriodEndOf(sub: Stripe.Subscription): number | null {
  const item = sub.items.data[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number })
    | undefined;
  if (item && typeof item.current_period_end === "number") {
    return item.current_period_end;
  }
  const subAny = sub as Stripe.Subscription & { current_period_end?: number };
  if (typeof subAny.current_period_end === "number") {
    return subAny.current_period_end;
  }
  return null;
}
