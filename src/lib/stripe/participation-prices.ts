import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProductType, SpokenLanguageCode } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { stripe } from "@/lib/stripe/client";
import { vatForProductType } from "@/lib/stripe/vat";

interface ProductPrice {
  price_cents: number;
}

/**
 * The product facts a Stripe Product is built from.
 *
 * Callers hand over the row they have already read rather than having this
 * module read it again: the checkout route needs the very same fields for the
 * purchase metadata it writes onto the payment intent, the invoice and the
 * subscription, and reading once is what stops the catalogue entry and the
 * purchase snapshot from disagreeing. It also puts the fail-closed guarantee
 * where it belongs — a caller whose read fails or comes back empty must not
 * reach this module at all, because the tax code is derived from
 * `product_type` and a defaulted one is a permanently wrong-rated product.
 */
export interface StripeProductSource {
  id: string;
  product_type: ProductType;
  spoken_language_code: SpokenLanguageCode;
  /**
   * Bare `date` columns, already `YYYY-MM-DD` and UTC-pinned. They travel to
   * Stripe verbatim — re-anchoring a zoneless date to anyone's timezone shifts
   * it off by a day.
   */
  start_date: string | null;
  end_date: string | null;
  product_translations: { locale: string; name: string }[] | null;
}

/**
 * The catalogue price for a (product, currency), or null when the product is
 * genuinely not sold in that currency. Errors propagate: callers read a missing
 * price as "not for sale" and decide what to charge from it, so a failed query
 * must not present as an absent one.
 */
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
  if (error) throw error;
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
 * Resolve the monthly Stripe Price for a (product, currency) pair, creating one
 * when the cache is empty **or stale**.
 *
 * Two things here are load-bearing. **Keep the amount comparison** — Stripe
 * Prices are immutable, so an admin raising `price_cents` cannot edit the
 * cached Price and it has to be replaced; without the comparison the club
 * advertises the new amount while checkout bills the old one forever. And
 * **never deactivate the superseded Price** — live subscriptions hold their own
 * Price reference and still bill against it, which is also why existing
 * subscribers keep their original amount.
 */
export async function getOrCreateSubscriptionPrice(
  admin: SupabaseClient<Database>,
  product: StripeProductSource,
  currency: SupportedCurrency,
): Promise<SubscriptionPriceRow | null> {
  const productId = product.id;
  const [{ data: cached, error: cachedErr }, base] = await Promise.all([
    admin
      .from("product_subscription_prices")
      .select("product_id, currency, stripe_price_id, unit_amount_cents")
      .eq("product_id", productId)
      .eq("currency", currency)
      .maybeSingle(),
    loadBasePrice(admin, productId, currency),
  ]);
  if (cachedErr) throw cachedErr;

  // No catalogue price: fail closed rather than sell on a cached Price the
  // catalogue no longer confirms. The caller renders this as a 400.
  if (!base) return null;

  if (cached && cached.unit_amount_cents === base.price_cents) {
    return cached;
  }

  // Below the early return above on purpose: a club that reaches here is on its
  // first sale or a price change, so its Stripe Product is reconciled only
  // then. Lifting this above the cache check would put a Stripe round trip on
  // every club checkout — the customer-blocking path — to refresh cosmetic
  // metadata. The tax code cannot drift; nothing changes it after creation.
  const stripeProductId = await ensureStripeProductForProduct(product);

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
  // repointed at the replacement Price.
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
  if (upsertErr) throw upsertErr;

  return upserted;
}

/**
 * The Stripe Product metadata keys this module owns. The reconcile writes only
 * these, so anything set by hand in the dashboard survives untouched.
 */
const MANAGED_PRODUCT_METADATA_KEYS = [
  "product_id",
  "spoken_language_code",
  "delivery_start",
  "delivery_end",
] as const;

/**
 * One managed key's value, or `""` when it is absent — which is also how Stripe
 * spells "remove this key" on an update, so the two sides of the diff below can
 * be compared as plain strings.
 *
 * Presence is tested with `in` rather than by defaulting a lookup: without
 * `noUncheckedIndexedAccess` — which this project does not set — an index
 * lookup on a record is typed `string`, so `?? ""` reads to the compiler (and
 * to lint) as dead code even though it is exactly the case being handled.
 */
function managedMetadataValue(
  metadata: Record<string, string>,
  key: (typeof MANAGED_PRODUCT_METADATA_KEYS)[number],
): string {
  return key in metadata ? metadata[key] : "";
}

interface DesiredStripeProduct {
  name: string;
  tax_code: string;
  metadata: Record<string, string>;
}

/**
 * What the Stripe Product should say, given the Sogverse row. The same shape
 * is passed to a create and diffed against an existing product, so the two can
 * never describe different things.
 */
function desiredStripeProduct(
  product: StripeProductSource,
): DesiredStripeProduct {
  // One Stripe Product per Sogverse product, shared across every locale, so
  // there is no viewer locale to prefer — resolve at the default locale and
  // walk the shared fallback chain (en → first). The embedded translations are
  // ordered by locale at the query, which is what makes that last step
  // deterministic; an arbitrary one would make the name flap, and a flapping
  // name reconciles on every purchase and breaks the idempotency key below.
  const name = resolveTranslation(
    product.product_translations,
    DEFAULT_LOCALE,
  )?.name;
  // Fail closed. Every product is guaranteed at least one translation, so an
  // empty array means the row was not read properly — and the same read decides
  // the tax code, where degrading quietly would mint a camp's Stripe Product at
  // the standard rate and keep it there.
  if (!name) {
    throw new Error(
      `Product ${product.id} has no translation to name its Stripe Product with`,
    );
  }

  const metadata: Record<string, string> = {
    product_id: product.id,
    spoken_language_code: product.spoken_language_code,
  };
  // A null date is an absent key rather than an empty one — see the reconcile
  // below for how an absent key is expressed on an update.
  if (product.start_date) metadata.delivery_start = product.start_date;
  if (product.end_date) metadata.delivery_end = product.end_date;

  return {
    name,
    tax_code: vatForProductType(product.product_type).taxCode,
    metadata,
  };
}

/** `tax_code` is expandable, so it arrives as an id or as the object. */
function taxCodeOf(product: Stripe.Product): string | null {
  const taxCode = product.tax_code;
  if (typeof taxCode === "string") return taxCode;
  return taxCode?.id ?? null;
}

/**
 * Bring an existing Stripe Product back in line with the Sogverse row.
 *
 * Stripe Products are mutable in name, tax code and metadata (unlike Price
 * amounts), so this is an update in place. It issues no request at all when
 * nothing differs.
 */
async function reconcileStripeProduct(
  existing: Stripe.Product,
  desired: DesiredStripeProduct,
): Promise<void> {
  const update: Stripe.ProductUpdateParams = {};
  if (existing.name !== desired.name) update.name = desired.name;
  if (taxCodeOf(existing) !== desired.tax_code) {
    update.tax_code = desired.tax_code;
  }

  const metadata: Record<string, string> = {};
  for (const key of MANAGED_PRODUCT_METADATA_KEYS) {
    // Stripe expresses metadata *removal* as writing an empty string; omitting
    // a key from the payload means "leave it alone". So a product that loses
    // its end date has to send `delivery_end: ""`, not nothing.
    const want = managedMetadataValue(desired.metadata, key);
    const have = managedMetadataValue(existing.metadata, key);
    if (have !== want) metadata[key] = want;
  }
  if (Object.keys(metadata).length > 0) update.metadata = metadata;

  if (Object.keys(update).length === 0) return;
  await stripe.products.update(existing.id, update);
}

/**
 * The Stripe Product for a Sogverse product — created on first use, reconciled
 * on every later call.
 *
 * Every product that reaches Stripe gets one, so the tax code that decides its
 * VAT rate is an explicit, auditable field on a catalogue entry rather than an
 * account-wide default applied to whatever forgot to say. `metadata.product_id`
 * is the link back, found by Stripe's product search.
 *
 * That search is eventually consistent (roughly a minute), so two first
 * purchases seconds apart can both miss it and both create. The deterministic
 * idempotency key closes that window: Stripe answers a repeat within 24 hours
 * with the product the first call made, and after 24 hours the search has long
 * since caught up. One residual is accepted — the create's parameters include
 * the mutable name, so a create attempted under the same key within 24 hours of
 * a rename answers `idempotency_error` instead of deduping. That window is
 * sub-minute in practice and only on a product that has never sold.
 *
 * Two *genuinely simultaneous* first purchases are the case the key exists for:
 * Stripe answers a request whose key is still in flight with a 409, so one of
 * the two checkouts fails and its retry finds the product. That is deliberate —
 * fail closed rather than mint a duplicate — but it reads as an unexplained 409
 * in the logs, hence this sentence.
 */
export async function ensureStripeProductForProduct(
  product: StripeProductSource,
): Promise<string> {
  const desired = desiredStripeProduct(product);

  const search = await stripe.products.search({
    query: `metadata['product_id']:'${product.id}'`,
    limit: 1,
  });
  if (search.data.length > 0) {
    const existing = search.data[0];
    await reconcileStripeProduct(existing, desired);
    return existing.id;
  }

  const created = await stripe.products.create(desired, {
    idempotencyKey: `stripe-product:${product.id}`,
  });
  return created.id;
}

export type { SubscriptionPriceRow };
