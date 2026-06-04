import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { getPortalConfigurationId } from "@/lib/stripe/portal-configuration";
import { getOrigin } from "@/lib/url";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Stripe's billing portal supports a fixed set of locale codes. Our `en`,
// `fi`, and `sv` map straight through; `tlh` (the Klingon easter egg) isn't
// a real Stripe locale, so fall back to `auto` (Stripe reads the browser).
const STRIPE_PORTAL_LOCALES: Record<
  string,
  Stripe.BillingPortal.SessionCreateParams.Locale
> = {
  en: "en",
  fi: "fi",
  sv: "sv",
};

/**
 * Create a Stripe Customer Portal session and hand back its URL. The parent's
 * billing card POSTs here, then does a full-page navigation to the returned
 * `url` so Stripe owns all payment-method / invoice / subscription management.
 *
 * We `getOrCreateStripeCustomer` rather than read-only lookup: the portal needs
 * a customer id, and a parent who's never purchased doesn't have one yet. This
 * lazily provisions it so the "Manage billing" link always works.
 */
export async function POST(request: Request) {
  const auth = await requireRole("customer");
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const admin = createAdminClient();

  let url: string;
  try {
    const customerId = await getOrCreateStripeCustomer(admin, user.id);
    const locale = await getLocale();

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      // Our own configuration (not Stripe's dashboard default), so the portal
      // never offers plan switching for tiers we don't sell. See
      // `getPortalConfigurationId`.
      configuration: await getPortalConfigurationId(),
      // Send them back to the Billing section they came from. `getOrigin`
      // only trusts known hosts, so a spoofed Host can't redirect elsewhere.
      return_url: `${getOrigin(request)}/parent#billing`,
      locale: STRIPE_PORTAL_LOCALES[locale] ?? "auto",
    });
    url = session.url;
  } catch (err) {
    console.error("[parent/billing-portal] Stripe portal session failed", err);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url });
}
