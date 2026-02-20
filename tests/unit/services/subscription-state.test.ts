import { describe, it, expect } from "vitest";
import { getSubscriptionState } from "@/services/tokens/subscription-state";

describe("getSubscriptionState", () => {
  describe("no subscription", () => {
    it('returns "none" when subscription is undefined', () => {
      const result = getSubscriptionState(undefined);
      expect(result).toEqual({ status: "none", hasActiveSubscription: false });
    });

    it('returns "none" when stripe_subscription_id is null', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: null, subscription_status: null },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false });
    });
  });

  describe("canceled subscription", () => {
    it('returns "canceled" with hasActiveSubscription false', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "canceled" },
      );
      expect(result).toEqual({ status: "canceled", hasActiveSubscription: false });
    });
  });

  describe("past_due subscription", () => {
    it('returns "past_due" with hasActiveSubscription true', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "past_due" },
      );
      expect(result).toEqual({ status: "past_due", hasActiveSubscription: true });
    });
  });

  describe("canceling subscription", () => {
    it('returns "canceling" with hasActiveSubscription true', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "canceling" },
      );
      expect(result).toEqual({ status: "canceling", hasActiveSubscription: true });
    });
  });

  describe("active subscription", () => {
    it('returns "active" when status is active', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "active" },
      );
      expect(result).toEqual({ status: "active", hasActiveSubscription: true });
    });
  });

  describe("unknown status", () => {
    it('returns "none" for unrecognized subscription_status', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: "trialing" },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false });
    });

    it('returns "none" when subscription_status is null but ID exists', () => {
      const result = getSubscriptionState(
        { stripe_subscription_id: "sub_123", subscription_status: null },
      );
      expect(result).toEqual({ status: "none", hasActiveSubscription: false });
    });
  });
});
