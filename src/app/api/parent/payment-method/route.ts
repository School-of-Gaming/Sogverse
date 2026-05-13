import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export type PaymentMethodSummary = {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  funding: string;
};

/**
 * Return a redacted view of the parent's default card on file, or null if
 * they don't have a Stripe Customer yet, or have one but no card attached.
 *
 * Why both lookups: subscription-mode Checkout saves the card to the Customer
 * and sets it as `invoice_settings.default_payment_method`. Payment-mode
 * Checkout (bundles, single-payment) does NOT attach the card. So a parent
 * who only ever bought a bundle has a Customer with no payment methods —
 * that's the expected null branch.
 */
export async function GET() {
  const auth = await requireRole("customer");
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("customer_profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ paymentMethod: null });
  }

  let card: Stripe.PaymentMethod.Card | null = null;

  try {
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (!customer.deleted) {
      const defaultPm = customer.invoice_settings.default_payment_method;
      if (defaultPm && typeof defaultPm !== "string" && defaultPm.card) {
        card = defaultPm.card;
      }
    }

    if (!card) {
      const pms = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: "card",
        limit: 1,
      });
      if (pms.data.length > 0 && pms.data[0].card) {
        card = pms.data[0].card;
      }
    }
  } catch (err) {
    console.error("[parent/payment-method] Stripe lookup failed", err);
    return NextResponse.json(
      { error: "Failed to fetch payment method" },
      { status: 502 },
    );
  }

  if (!card) {
    return NextResponse.json({ paymentMethod: null });
  }

  const summary: PaymentMethodSummary = {
    brand: card.brand,
    last4: card.last4,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    funding: card.funding,
  };
  return NextResponse.json({ paymentMethod: summary });
}
