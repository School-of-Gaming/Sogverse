import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getLocale } from "next-intl/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { getPortalConfigurationId } from "@/lib/stripe/portal-configuration";
import { getOrigin } from "@/lib/url";
import { stripeLocaleOrAuto } from "@/lib/constants/locales";
import {
  billingPortalBody,
  billingPortalResponse,
  type BillingPortalBody,
} from "@/services/billing/billing.contracts";
import {
  ownsStripeCustomer,
  resolveParticipationStripeCustomerId,
} from "@/services/billing/billing.server";
import type { AppSupabaseClient } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Which Stripe customer this session opens, and whether to land the parent on
 * a task flow rather than the portal's front page.
 */
interface PortalTarget {
  customerId: string;
  flowData?: Stripe.BillingPortal.SessionCreateParams.FlowData;
}

/**
 * Turn the caller's requested target into a Stripe customer id, authorizing it
 * on the way.
 *
 * The two named forms are caller-supplied and untrusted, so each is resolved
 * through the parent's own RLS-scoped client and refused with a 404 when it
 * isn't theirs — accepting either at face value would open another family's
 * billing portal. A request naming nothing keeps the original behaviour: the
 * parent's own customer, created on the spot if they have never purchased.
 */
async function resolvePortalTarget(
  supabase: AppSupabaseClient,
  userId: string,
  body: BillingPortalBody,
): Promise<PortalTarget> {
  if (body.participationId) {
    const customerId = await resolveParticipationStripeCustomerId(
      supabase,
      userId,
      body.participationId,
    );
    if (!customerId) {
      throw new ApiError(
        `participation ${body.participationId} is not the caller's, or has no subscription`,
        404,
      );
    }
    // Only the payment-problem badge names a participation, and it only renders
    // for a `past_due` subscription — the intent is already "this card failed",
    // so skip the portal's front page and open the card form directly.
    return { customerId, flowData: { type: "payment_method_update" } };
  }

  if (body.stripeCustomerId) {
    if (!(await ownsStripeCustomer(supabase, userId, body.stripeCustomerId))) {
      throw new ApiError(
        `stripe customer ${body.stripeCustomerId} is not the caller's`,
        404,
      );
    }
    return { customerId: body.stripeCustomerId };
  }

  // We get-or-create rather than doing a read-only lookup: the portal needs a
  // customer id, and a parent who's never purchased doesn't have one yet. This
  // lazily provisions it so "Manage billing" always works.
  return { customerId: await getOrCreateStripeCustomer(createAdminClient(), userId) };
}

/**
 * Create a Stripe Customer Portal session and hand back its URL. The parent's
 * billing card (and the payment-problem badge) POST here, then do a full-page
 * navigation to the returned `url` so Stripe owns all payment-method / invoice
 * / subscription management.
 *
 * A portal session is scoped to exactly one Stripe customer, and a parent
 * migrated from the old platform can own several — so the body names which one,
 * and `resolvePortalTarget` authorizes the choice. See `billing.contracts.ts`.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  body: billingPortalBody,
  response: billingPortalResponse,

  handler: async ({ request, body, user, supabase }) => {
    // Resolved OUTSIDE the try below, which exists solely to turn a Stripe
    // failure into a 502. A refused target throws `ApiError`, and a failed
    // ownership read throws a Postgres error the wrapper's code table already
    // knows how to answer — swallowing either into "Stripe is down" would send
    // the next investigation to Stripe's status page for a database problem.
    const target = await resolvePortalTarget(supabase, user.id, body);

    try {
      const locale = await getLocale();

      const session = await stripe.billingPortal.sessions.create({
        customer: target.customerId,
        // Our own configuration (not Stripe's dashboard default), so the portal
        // never offers plan switching for tiers we don't sell.
        configuration: await getPortalConfigurationId(),
        // Send them back to the Billing section they came from. `getOrigin`
        // only trusts known hosts, so a spoofed Host can't redirect elsewhere.
        return_url: `${getOrigin(request)}/parent#billing`,
        // The portal's chrome in the parent's app locale, or Stripe's own
        // browser detection for one it can't render (the Klingon easter egg).
        locale: stripeLocaleOrAuto(locale),
        ...(target.flowData ? { flow_data: target.flowData } : {}),
      });

      return { url: session.url };
    } catch (err) {
      // 502 rather than the shared table's 500: the failure is upstream at
      // Stripe, and the parent's retry is worth prompting. Kept as an explicit
      // response because the wrapper has no bad-gateway default.
      console.error("[parent/billing-portal] Stripe portal session failed", err);
      return NextResponse.json(
        { error: "Failed to open billing portal" },
        { status: 502 },
      );
    }
  },
});
