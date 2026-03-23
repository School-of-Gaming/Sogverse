import { describe, it, expect } from "vitest";
import { getSubscriptionState } from "@/services/tokens/subscription-state";

describe("getSubscriptionState", () => {
  describe("no subscription", () => {
    it('returns "none" when subscription is undefined', () => {
      const result = getSubscriptionState(undefined);
      expect(result).toEqual({ status: "none", hasActiveSubscription: false, tier: null });
    });

    it('returns "none" when stripe_subscription_id is null', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: null, subscription_status: null, subscription_tier: null },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false, tier: null });
    });
  });

  describe("canceled subscription", () => {
    it('returns "canceled" with hasActiveSubscription false and tier null', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "canceled", subscription_tier: "prod_old" },
      );
      expect(result).toEqual({ status: "canceled", hasActiveSubscription: false, tier: null });
    });
  });

  describe("past_due subscription", () => {
    it('returns "past_due" with hasActiveSubscription true and tier preserved', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "past_due", subscription_tier: "prod_basic" },
      );
      expect(result).toEqual({ status: "past_due", hasActiveSubscription: true, tier: "prod_basic" });
    });
  });

  describe("canceling subscription", () => {
    it('returns "canceling" with hasActiveSubscription true and tier preserved', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "canceling", subscription_tier: "prod_basic" },
      );
      expect(result).toEqual({ status: "canceling", hasActiveSubscription: true, tier: "prod_basic" });
    });
  });

  describe("active subscription", () => {
    it('returns "active" with tier', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "active", subscription_tier: "prod_premium" },
      );
      expect(result).toEqual({ status: "active", hasActiveSubscription: true, tier: "prod_premium" });
    });

    it('returns "active" with null tier when tier not set', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "active", subscription_tier: null },
      );
      expect(result).toEqual({ status: "active", hasActiveSubscription: true, tier: null });
    });
  });

  describe("unknown status", () => {
    it('returns "none" for unrecognized subscription_status', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "trialing", subscription_tier: null },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false, tier: null });
    });

    it('returns "none" when subscription_status is null but ID exists', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: null, subscription_tier: null },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false, tier: null });
    });
  });
});
