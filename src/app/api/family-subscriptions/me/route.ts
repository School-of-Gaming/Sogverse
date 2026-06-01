import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireRole } from "@/lib/auth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * The customer's family subscriptions, enriched with Stripe-side pricing.
 *
 * Why this is a route (and not a direct supabase read in the service): the
 * authoritative price for a subscription lives in Stripe — if we change a
 * product's local price, existing subs continue to be billed at their
 * locked-in Stripe price, so the local `product_subscription_prices`
 * cache can drift from what Stripe is actually charging. This route hits
 * Stripe's `subscriptions.retrieve` (with `items.data.price` expanded) so
 * the pricing rendered to the customer matches what they're actually paying.
 *
 * Auth: customer-only. We use the caller's RLS-restricted supabase client
 * (NOT the admin client) for the DB read, so the policy on
 * `family_subscriptions` already enforces "customer can only see their
 * own subs". Belt-and-braces: we filter by `customer_id = user.id` anyway.
 *
 * Per-sub error handling: if Stripe `retrieve` throws for one sub (the
 * Stripe subscription was cancelled or deleted while our row is still
 * around), we log and return that sub *without* pricing rather than failing
 * the whole response. The placeholder UI degrades gracefully.
 */
export async function GET() {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can view family subscriptions",
  });
  if (result instanceof NextResponse) return result;
  const { user, supabase } = result;

  const { data: subs, error } = await supabase
    .from("family_subscriptions")
    .select(
      `
        id, status, frequency, currency, current_period_end,
        stripe_subscription_id, stripe_customer_id, created_at,
        family_subscription_items(
          id, participation_id, stripe_subscription_item_id, stripe_price_id
        )
      `,
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    subs.map(async (sub) => {
      const itemPricing = await fetchItemPricing(sub.stripe_subscription_id);
      const items = sub.family_subscription_items.map((item) => {
        const pricing = itemPricing.get(item.stripe_subscription_item_id);
        return {
          ...item,
          unit_amount_cents: pricing?.unitAmount ?? null,
          stripe_price_currency: pricing?.currency ?? null,
          recurring_interval: pricing?.interval ?? null,
        };
      });
      const totalCents = items.reduce(
        (sum, it) =>
          it.unit_amount_cents === null ? sum : sum + it.unit_amount_cents,
        0,
      );
      const allItemsPriced = items.every((it) => it.unit_amount_cents !== null);
      return {
        ...sub,
        family_subscription_items: items,
        total_cents: allItemsPriced ? totalCents : null,
      };
    }),
  );

  return NextResponse.json(enriched);
}

interface ItemPricing {
  unitAmount: number;
  currency: string;
  interval: string;
}

/**
 * Look up each Stripe item's price for one subscription. Returns a map
 * keyed by `stripe_subscription_item_id` so callers can splat the pricing
 * onto our local item rows. Returns an empty map and logs if Stripe fails.
 */
async function fetchItemPricing(
  stripeSubscriptionId: string,
): Promise<Map<string, ItemPricing>> {
  const out = new Map<string, ItemPricing>();
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
    for (const item of sub.items.data) {
      const price = item.price;
      if (typeof price.unit_amount !== "number") continue;
      out.set(item.id, {
        unitAmount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring?.interval ?? "(unknown)",
      });
    }
  } catch (err) {
    console.error(
      "[family-subscriptions/me] Stripe retrieve failed — falling back to no pricing",
      { stripeSubscriptionId, err: err instanceof Error ? err.message : err },
    );
  }
  return out;
}
