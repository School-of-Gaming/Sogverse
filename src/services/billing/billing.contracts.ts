import { z } from "zod";

/**
 * Body of POST /api/parent/billing-portal — which of the caller's Stripe
 * customers the portal session should be created for.
 *
 * A Stripe portal session is scoped to exactly one customer, and a parent
 * migrated from the old platform can own several (one per enrolment, an
 * artifact of how the old billing system modelled customers). So the caller
 * names its target, and the route authorizes that the target is theirs:
 *
 *  - `participationId` — "the subscription behind this club, for this child".
 *    Sent by the payment-problem badge, which knows which enrolment is failing
 *    but nothing about Stripe. The route resolves the subscription's customer,
 *    and reads the intent as "this card failed", so it lands the parent on the
 *    portal's payment-method-update flow.
 *  - `stripeCustomerId` — "this billing account", sent by the billing card when
 *    it renders one button per customer.
 *  - Neither — "whichever customer is mine", the standard case. Get-or-create,
 *    so a parent who has never purchased still reaches a working portal.
 *
 * Both identifiers are caller-supplied and therefore untrusted: the route must
 * confirm ownership before opening a session, or it is an IDOR onto another
 * family's billing data.
 */
export const billingPortalBody = z.object({
  participationId: z.string().uuid().optional(),
  stripeCustomerId: z.string().min(1).optional(),
});

export type BillingPortalBody = z.infer<typeof billingPortalBody>;

/** Response of POST /api/parent/billing-portal. */
export const billingPortalResponse = z.object({ url: z.string() });
