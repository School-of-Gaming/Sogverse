import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface ProductPrice {
  price_cents: number;
}

async function loadBasePrice(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<ProductPrice | null> {
  const { data, error } = await admin
    .from("product_prices")
    .select("price_cents")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Single-payment total in smallest currency unit. Used for camps and paid
 * events — those store their one upfront total in `price_cents`.
 */
export async function computeSinglePaymentAmount(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<number | null> {
  const base = await loadBasePrice(admin, productId, currency);
  if (!base) return null;
  return base.price_cents;
}

interface SubscriptionPriceRow {
  product_id: string;
  currency: string;
  stripe_price_id: string;
  unit_amount_cents: number;
}

/**
 * Resolve the monthly Stripe Price for a (product, currency) pair, creating
 * one when the cache is empty **or stale**.
 *
 * `product_subscription_prices` caches the Stripe Price backing a club's
 * catalogue price. Stripe Prices are immutable, so an admin raising
 * `price_cents` on the product form cannot edit the cached Price — it has to be
 * replaced. We therefore compare the cached amount against the catalogue amount
 * on every call and mint a replacement Price whenever they diverge.
 *
 * Skipping that comparison is what made an admin price change apply to the
 * displayed price but not the charged one: the club advertised the new amount
 * while checkout silently kept billing the old cached Price forever.
 *
 * Existing subscribers are unaffected — a Stripe Subscription holds its own
 * Price reference, so replacing the cached Price only governs *future*
 * checkouts. That is why the superseded Price must stay active in Stripe: live
 * subscriptions still bill against it.
 */
export async function getOrCreateSubscriptionPrice(
  admin: SupabaseClient<Database>,
  productId: string,
  currency: SupportedCurrency,
): Promise<SubscriptionPriceRow | null> {
  const { data: cached } = await admin
    .from("product_subscription_prices")
    .select("product_id, currency, stripe_price_id, unit_amount_cents")
    .eq("product_id", productId)
    .eq("currency", currency)
    .maybeSingle();

  const base = await loadBasePrice(admin, productId, currency);

  // No catalogue price to compare against (product not sold in this currency).
  // A cached Price is then the best answer available; without one there is
  // nothing to charge.
  if (!base) return cached ? (cached as SubscriptionPriceRow) : null;

  // Cache agrees with the catalogue — reuse it.
  if (cached && cached.unit_amount_cents === base.price_cents) {
    return cached as SubscriptionPriceRow;
  }

  // Ensure the product has a Stripe Product. Look up by metadata.
  const stripeProductId = await ensureStripeProductForProduct(admin, productId);

  const unitAmount = base.price_cents;

  const stripePrice = await stripe.prices.create({
    product: stripeProductId,
    currency,
    unit_amount: unitAmount,
    // Our prices are the full amount the customer pays with VAT *inside* them
    // (same as Chargebee). With Stripe Tax on, a price with unspecified
    // tax_behavior resolves to exclusive and would add VAT on top — so mark it
    // inclusive. tax_behavior is immutable once a price is created, so this only
    // governs prices created from here on; existing prices rely on the account
    // default tax behavior (set to Inclusive in the Stripe Dashboard).
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1 },
    metadata: {
      productId,
      currency,
    },
  });

  // Upsert, not insert: on a price change the row already exists and has to be
  // repointed at the replacement Price. The PK is (product_id, currency).
  const { data: upserted, error: upsertErr } = await admin
    .from("product_subscription_prices")
    .upsert(
      {
        product_id: productId,
        currency,
        stripe_price_id: stripePrice.id,
        unit_amount_cents: unitAmount,
      },
      { onConflict: "product_id,currency" },
    )
    .select("product_id, currency, stripe_price_id, unit_amount_cents")
    .single();

  if (upsertErr) {
    // Concurrent caller raced us — fetch the row they wrote. Both callers
    // resolved the same catalogue amount, so either row is correct; the loser's
    // Stripe Price is simply left unused (harmless, and never billed).
    const { data: raced } = await admin
      .from("product_subscription_prices")
      .select("product_id, currency, stripe_price_id, unit_amount_cents")
      .eq("product_id", productId)
      .eq("currency", currency)
      .maybeSingle();
    if (raced !== null) return raced;
    throw upsertErr;
  }

  return upserted;
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

  // The cached Stripe Product is shared across all locales (one per club, named
  // once at first subscription), so there's no viewer locale to prefer — resolve
  // at the default locale and walk the shared fallback chain (en → first).
  const name =
    resolveTranslation(product?.product_translations, DEFAULT_LOCALE)?.name ??
    "School of Gaming product";

  const created = await stripe.products.create({
    name,
    metadata: { product_id: productId },
  });
  return created.id;
}

export type { SubscriptionPriceRow };
