import "server-only";

import type { AppSupabaseClient } from "@/types";
import type { BillingAccount } from "./billing.service";

/**
 * Server-side reads that answer one question: **which Stripe customers belong
 * to this parent?**
 *
 * Every function here goes through the caller's own RLS-scoped client, never
 * the service-role admin client. The two policies that apply — a customer may
 * read their own `customer_profiles` row and their own `family_subscriptions`
 * rows — make Postgres the access gate, so the answer is scoped even before the
 * explicit `customer_id` filters below. That matters most for the authorization
 * helpers: they decide whether a caller-supplied identifier may be turned into
 * a billing-portal session, and a portal session opened for someone else's
 * customer is a full billing-data leak.
 *
 * A parent normally owns exactly one Stripe customer. Parents migrated from the
 * old platform can own several, because it created a customer record per
 * enrolment; Stripe can neither move a subscription between customers nor merge
 * them, so those families stay split. Only customers whose subscriptions have
 * been adopted into `family_subscriptions` are visible here — a legacy
 * subscription that was never adopted stays unknown until its child is
 * enrolled.
 */

/**
 * The parent's Stripe customers, each with the subscriptions billed to it.
 *
 * The set is the distinct `stripe_customer_id` values across their
 * `family_subscriptions` rows, plus the one bound to their customer profile.
 * The profile's customer comes first (it is the one checkout and the
 * get-or-create path use) and can legitimately carry no subscriptions — it
 * still holds their saved cards and invoice history.
 *
 * Returns `[]` on any failure, so a dashboard prefetch degrades to the plain
 * single-button billing card rather than failing the page.
 */
export async function resolveBillingAccountsViaRls(
  supabase: AppSupabaseClient,
): Promise<BillingAccount[]> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return [];

  const [{ data: profile }, { data: subs, error }] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle(),
    // `!inner` on both embeds mirrors the schema (`participation_id` and
    // `gamer_id` are NOT-NULL FKs), so the inferred row treats them as
    // non-null. Ordered so the button order is stable across renders.
    supabase
      .from("family_subscriptions")
      .select(
        `
          stripe_customer_id,
          participation:participations!inner(
            gamer:profiles!participations_gamer_id_fkey!inner(first_name),
            product:products!inner(product_translations(*))
          )
        `,
      )
      .eq("customer_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (error) {
    console.error("resolveBillingAccountsViaRls: subscription lookup failed", error);
    return [];
  }

  const accounts = new Map<string, BillingAccount>();
  if (profile?.stripe_customer_id) {
    accounts.set(profile.stripe_customer_id, {
      stripeCustomerId: profile.stripe_customer_id,
      covers: [],
    });
  }

  for (const row of subs) {
    let account = accounts.get(row.stripe_customer_id);
    if (!account) {
      account = { stripeCustomerId: row.stripe_customer_id, covers: [] };
      accounts.set(row.stripe_customer_id, account);
    }
    account.covers.push({
      gamerFirstName: row.participation.gamer.first_name,
      productTranslations: row.participation.product.product_translations,
    });
  }

  return [...accounts.values()];
}

/**
 * The Stripe customer billing one of the caller's participations, or `null`
 * when the participation is not theirs or carries no subscription.
 *
 * This IS the authorization for the payment-problem badge's request: the id
 * arrives from the browser, and RLS plus the explicit `customer_id` filter are
 * what stop it naming another family's enrolment. `null` must be answered with
 * a refusal, never with a fallback to the caller's own customer — the badge
 * promised a specific failing subscription, and silently opening a different
 * portal is the exact confusion this whole feature exists to remove.
 */
export async function resolveParticipationStripeCustomerId(
  supabase: AppSupabaseClient,
  userId: string,
  participationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("family_subscriptions")
    .select("stripe_customer_id")
    .eq("participation_id", participationId)
    .eq("customer_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.stripe_customer_id ?? null;
}

/**
 * Whether a Stripe customer id is one of the caller's own — their profile's
 * bound customer, or one carrying a subscription they pay for.
 *
 * The billing card's per-customer buttons send an id the browser was given, so
 * this is the check that keeps a tampered id from opening another family's
 * portal.
 */
export async function ownsStripeCustomer(
  supabase: AppSupabaseClient,
  userId: string,
  stripeCustomerId: string,
): Promise<boolean> {
  const [{ data: profile }, { data: subscription, error }] = await Promise.all([
    supabase
      .from("customer_profiles")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("family_subscriptions")
      .select("id")
      .eq("customer_id", userId)
      .eq("stripe_customer_id", stripeCustomerId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (error) throw error;
  return profile?.stripe_customer_id === stripeCustomerId || subscription !== null;
}
