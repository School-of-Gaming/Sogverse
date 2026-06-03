import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Find or create a Stripe Customer for a customer profile.
 *
 * Caches the new Stripe customer id back onto `customer_profiles.stripe_customer_id`
 * so subsequent checkouts — and the billing portal — reuse it.
 *
 * Lives here (not in participation-prices) because it's a customer concern,
 * not a pricing one: both checkout (`api/checkout/products/create`) and the
 * billing portal (`api/parent/billing-portal`) depend on it.
 */
export async function getOrCreateStripeCustomer(
  admin: SupabaseClient<Database>,
  customerId: string,
): Promise<string> {
  const { data: profile } = await admin
    .from("customer_profiles")
    .select("stripe_customer_id")
    .eq("user_id", customerId)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const { data: userProfile } = await admin
    .from("profiles")
    .select("email, first_name, last_name")
    .eq("id", customerId)
    .single();

  // Stripe receipts/invoices want the full name, not just the first.
  const fullName = [userProfile?.first_name, userProfile?.last_name]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const created = await stripe.customers.create({
    email: userProfile?.email ?? undefined,
    name: fullName || undefined,
    metadata: { user_id: customerId },
  });

  await admin
    .from("customer_profiles")
    .update({ stripe_customer_id: created.id })
    .eq("user_id", customerId);

  return created.id;
}
