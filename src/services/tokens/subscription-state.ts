export type SubscriptionStatus = "none" | "active" | "canceling" | "past_due" | "canceled";

export interface SubscriptionState {
  /** Discriminated subscription status */
  status: SubscriptionStatus;
  /** Whether the subscription should block new subscription purchases (active or past_due with a valid subscription ID) */
  hasActiveSubscription: boolean;
}

interface SubscriptionData {
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

interface SubscriptionDetails {
  cancelAtPeriodEnd: boolean;
}

/**
 * Derives a single subscription state from the DB profile and Stripe details.
 * Used by both TokenPurchaseSection (to gate the Subscribe button) and
 * SubscriptionStatusCard (to render the correct UI state).
 */
export function getSubscriptionState(
  subscription: SubscriptionData | undefined,
  details: SubscriptionDetails | null | undefined,
): SubscriptionState {
  if (!subscription?.stripe_subscription_id) {
    return { status: "none", hasActiveSubscription: false };
  }

  const dbStatus = subscription.subscription_status;

  if (dbStatus === "canceled") {
    return { status: "canceled", hasActiveSubscription: false };
  }

  if (dbStatus === "past_due") {
    return { status: "past_due", hasActiveSubscription: true };
  }

  if (dbStatus === "active") {
    const isCanceling = details?.cancelAtPeriodEnd === true;
    return {
      status: isCanceling ? "canceling" : "active",
      hasActiveSubscription: true,
    };
  }

  // Unknown/null status with a subscription ID
  return { status: "none", hasActiveSubscription: false };
}
