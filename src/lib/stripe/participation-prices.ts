import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

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
    .from("product_prices")
    .select("price_per_session, price_per_month")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();
  if (error || !data) return null;
  return data;
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
  currency: string;
  stripe_price_id: string;
  unit_amount_cents: number;
}

/**
 * Lazy-create the monthly Stripe Price for a (product, currency) pair.
 *
 * Cached in `product_subscription_prices`. If `price_per_month` later
 * changes on the admin form, existing subscribers keep their old Price —
 * Stripe Prices are immutable. A future admin action could recreate them.
 */
export async function getOrCreateSubscriptionPrice(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<SubscriptionPriceRow | null> {
  const { data: existing } = await admin
    .from("product_subscription_prices")
    .select("product_id, currency, stripe_price_id, unit_amount_cents")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();

  if (existing) {
    return existing as SubscriptionPriceRow;
  }

  const base = await loadBasePrice(admin, productId, currency);
  if (!base) return null;

  // Ensure the product has a Stripe Product. Look up by metadata.
  const stripeProductId = await ensureStripeProductForProduct(admin, productId);

  const unitAmount = base.price_per_month;

  const stripePrice = await stripe.prices.create({
    product: stripeProductId,
    currency,
    unit_amount: unitAmount,
    recurring: { interval: "month", interval_count: 1 },
    metadata: {
      productId,
      currency,
    },
  });

  const { data: inserted, error: insertErr } = await admin
    .from("product_subscription_prices")
    .insert({
      product_id: productId,
      currency,
      stripe_price_id: stripePrice.id,
      unit_amount_cents: unitAmount,
    })
    .select("product_id, currency, stripe_price_id, unit_amount_cents")
    .single();

  if (insertErr) {
    // Concurrent caller raced us — fetch the row they wrote.
    const { data: raced } = await admin
      .from("product_subscription_prices")
      .select("product_id, currency, stripe_price_id, unit_amount_cents")
      .eq("product_id", productId)
      .eq("currency", currency)
      .maybeSingle();
    if (raced !== null) return raced;
    throw insertErr;
  }

  return inserted;
}

/**
 * Look up a Stripe Product matching a products row, creating one on
 * first use. We cache the Stripe ID on the product row's `image_path`-style
 * metadata… actually we don't have a column for it yet. To avoid another
 * migration we search Stripe by metadata.product_id; lazy and idempotent.
 */
async function ensureStripeProductForProduct(
  admin: SupabaseClient<Database>,
  productId: string,
): Promise<string> {
  // Look for an existing Stripe Product tagged with this product id.
  const search = await stripe.products.search({
    query: `metadata['product_id']:'${productId}'`,
    limit: 1,
  });
  if (search.data.length > 0) return search.data[0].id;

  const { data: product } = await admin
    .from("products")
    .select("id, product_translations(locale, name)")
    .eq("id", productId)
    .single();

  const translations = product?.product_translations ?? null;
  const name = translations === null ? "School of Gaming product" : pickTranslationName(translations);

  const created = await stripe.products.create({
    name,
    metadata: { product_id: productId },
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

export type { SubscriptionPriceRow };
