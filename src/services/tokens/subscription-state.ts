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

/**
 * Derives a single subscription state from the DB profile.
 * The webhook writes "canceling" to the DB when cancel_at_period_end is true,
 * so the DB alone reflects the full subscription lifecycle.
 */
export function getSubscriptionState(
  subscription: SubscriptionData | undefined,
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

  if (dbStatus === "canceling") {
    return { status: "canceling", hasActiveSubscription: true };
  }

  if (dbStatus === "active") {
    return { status: "active", hasActiveSubscription: true };
  }

  // Unknown/null status with a subscription ID
  return { status: "none", hasActiveSubscription: false };
}
