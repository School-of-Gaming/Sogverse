import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SubscriptionFrequencyV2 } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import {
  computeBundleCents,
  computeSubscriptionCents,
  SUBSCRIPTION_FREQUENCY_MONTHS,
} from "@/lib/constants/pricing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface ProductPrice {
  price_per_session: number;
  price_per_month: number;
}

async function loadBasePrice(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<ProductPrice | null> {
  const { data, error } = await admin
    .from("product_prices_v2")
    .select("price_per_session, price_per_month")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Bundle total in smallest currency unit (cents/pence).
 * The admin enters `price_per_session` per currency; `BUNDLE_DISCOUNTS`
 * applies. Returns `null` if the product has no row in the requested currency.
 */
export async function computeBundleAmount(
  admin: SupabaseClient<Database>,
  productId: string,
  bundleSize: number,
  currency: SupportedCurrency,
): Promise<number | null> {
  const base = await loadBasePrice(admin, productId, currency);
  if (!base) return null;
  return computeBundleCents(base.price_per_session, bundleSize);
}

/**
 * Single-payment total in smallest currency unit. Used for camps and paid
 * events — those store their total in `price_per_session` (the per-attendance
 * price column).
 */
export async function computeSinglePaymentAmount(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<number | null> {
  const base = await loadBasePrice(admin, productId, currency);
  if (!base) return null;
  return base.price_per_session;
}

interface SubscriptionPriceRow {
  product_id: string;
  frequency: SubscriptionFrequencyV2;
  currency: string;
  stripe_price_id: string;
  unit_amount_cents: number;
}

/**
 * Lazy-create the Stripe Price for a (product, frequency, currency) tuple.
 *
 * Cached in `product_subscription_prices_v2`. If `price_per_month` later
 * changes on the admin form, existing subscribers keep their old Price —
 * Stripe Prices are immutable. A future admin action could recreate them.
 */
export async function getOrCreateSubscriptionPrice(
  admin: SupabaseClient<Database>,
  productId: string,
  frequency: SubscriptionFrequencyV2,
  currency: SupportedCurrency,
): Promise<SubscriptionPriceRow | null> {
  const { data: existing } = await admin
    .from("product_subscription_prices_v2")
    .select("product_id, frequency, currency, stripe_price_id, unit_amount_cents")
    .eq("product_id", productId)
    .eq("frequency", frequency)
    .eq("currency", currency)
    .maybeSingle();

  if (existing) {
    return existing as SubscriptionPriceRow;
  }

  const base = await loadBasePrice(admin, productId, currency);
  if (!base) return null;

  // Ensure the product has a Stripe Product. Look up by metadata.
  const stripeProductId = await ensureStripeProductForProduct(admin, productId);

  const months = SUBSCRIPTION_FREQUENCY_MONTHS[frequency];
  const unitAmount = computeSubscriptionCents(base.price_per_month, frequency);

  // Use Stripe's `year` interval for yearly so the receipt and customer
  // portal read cleanly; monthly/quarterly stay on `month` × N.
  const recurring: Stripe.PriceCreateParams.Recurring =
    frequency === "yearly"
      ? { interval: "year", interval_count: 1 }
      : { interval: "month", interval_count: months };

  const stripePrice = await stripe.prices.create({
    product: stripeProductId,
    currency,
    unit_amount: unitAmount,
    recurring,
    metadata: {
      productId,
      frequency,
      currency,
    },
  });

  const { data: inserted, error: insertErr } = await admin
    .from("product_subscription_prices_v2")
    .insert({
      product_id: productId,
      frequency,
      currency,
      stripe_price_id: stripePrice.id,
      unit_amount_cents: unitAmount,
    })
    .select("product_id, frequency, currency, stripe_price_id, unit_amount_cents")
    .single();

  if (insertErr) {
    // Concurrent caller raced us — fetch the row they wrote.
    const { data: raced } = await admin
      .from("product_subscription_prices_v2")
      .select("product_id, frequency, currency, stripe_price_id, unit_amount_cents")
      .eq("product_id", productId)
      .eq("frequency", frequency)
      .eq("currency", currency)
      .maybeSingle();
    if (raced !== null) return raced;
    throw insertErr;
  }

  return inserted;
}

/**
 * Look up a Stripe Product matching a products_v2 row, creating one on
 * first use. We cache the Stripe ID on the product row's `image_path`-style
 * metadata… actually we don't have a column for it yet. To avoid another
 * migration we search Stripe by metadata.product_v2_id; lazy and idempotent.
 */
async function ensureStripeProductForProduct(
  admin: SupabaseClient<Database>,
  productV2Id: string,
): Promise<string> {
  // Look for an existing Stripe Product tagged with this product_v2 id.
  const search = await stripe.products.search({
    query: `metadata['product_v2_id']:'${productV2Id}'`,
    limit: 1,
  });
  if (search.data.length > 0) return search.data[0].id;

  const { data: product } = await admin
    .from("products_v2")
    .select("id, product_translations_v2(locale, name)")
    .eq("id", productV2Id)
    .single();

  const translations = product?.product_translations_v2 ?? null;
  const name = translations === null ? "School of Gaming product" : pickTranslationName(translations);

  const created = await stripe.products.create({
    name,
    metadata: { product_v2_id: productV2Id },
  });
  return created.id;
}

function pickTranslationName(
  translations: { locale: string; name: string }[],
): string {
  const en = translations.find((t) => t.locale === "en");
  if (en) return en.name;
  const fi = translations.find((t) => t.locale === "fi");
  if (fi) return fi.name;
  if (translations.length > 0) return translations[0].name;
  return "School of Gaming product";
}

/**
 * Find or create a Stripe Customer for a customer profile.
 *
 * Mirrors the existing token-checkout pattern (`customer_profiles.stripe_customer_id`).
 * Caches the new Stripe customer id back onto the profile so subsequent
 * checkouts reuse it.
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

/**
 * Bundle size encoded in the purchase shape. Throws if the shape is not a bundle.
 */
export function bundleSizeFromShape(shape: string): number {
  switch (shape) {
    case "bundle_1": return 1;
    case "bundle_4": return 4;
    case "bundle_10": return 10;
    default:
      throw new Error(`not a bundle shape: ${shape}`);
  }
}

/**
 * Subscription frequency encoded in the purchase shape. Throws if not a sub.
 */
export function frequencyFromShape(
  shape: string,
): "monthly" | "quarterly" | "yearly" {
  switch (shape) {
    case "subscription_monthly": return "monthly";
    case "subscription_quarterly": return "quarterly";
    case "subscription_yearly": return "yearly";
    default:
      throw new Error(`not a subscription shape: ${shape}`);
  }
}

export type { SubscriptionPriceRow };
