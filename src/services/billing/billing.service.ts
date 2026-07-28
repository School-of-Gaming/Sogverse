import type { ProductTranslation } from "@/types";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import {
  billingPortalResponse,
  type BillingPortalBody,
} from "./billing.contracts";

export type { BillingPortalBody } from "./billing.contracts";

/** One subscription sitting under a billing account: whose club it pays for. */
export interface BillingAccountSubscription {
  /** The child's first name. Empty when the profile has no name set. */
  gamerFirstName: string;
  /**
   * Raw product translation rows. The name is resolved to the viewer's UI
   * locale at render time, the same way the session cards do it, so switching
   * locale doesn't need this data refetched.
   */
  productTranslations: ProductTranslation[];
}

/**
 * One Stripe customer belonging to a parent, and the subscriptions under it.
 *
 * Almost every parent has exactly one of these. Parents migrated from the old
 * platform can have several, because that platform created a customer record
 * per enrolment — and Stripe can neither move a subscription between customers
 * nor merge them, so the split is permanent for those families.
 */
export interface BillingAccount {
  /** The Stripe customer whose portal this account's button opens. */
  stripeCustomerId: string;
  /**
   * The subscriptions billed to this customer. Empty is possible and normal:
   * the customer bound to the parent's profile holds their saved cards and
   * invoice history even before (or after) it carries any subscription.
   */
  covers: BillingAccountSubscription[];
}

export class BillingService {
  /**
   * Open a Stripe Customer Portal session and hand back its URL.
   *
   * `target` names which of the parent's Stripe customers to open; the route
   * authorizes it. Omit it for the standard single-customer case — see
   * `billing.contracts.ts` for what each field means.
   */
  async createPortalSession(target: BillingPortalBody = {}): Promise<string> {
    const response = await fetch("/api/parent/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to open billing portal"),
      );
    }
    const { url } = await parseJsonResponse(response, billingPortalResponse);
    return url;
  }
}
