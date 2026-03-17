import Stripe from "stripe";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { StripePackage } from "@/types";

// Re-export pure utilities so server-side consumers can import from one place
export { getPackageSavings, tokensToCurrencyDisplay } from "./utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedProducts {
  oneTimePackages: StripePackage[];
  subscriptionPackages: StripePackage[];
  baseRates: Record<SupportedCurrency, number>;
  fetchedAt: number;
}

let cache: CachedProducts | null = null;

/**
 * Fetch active Stripe Products with `tokenAmount` metadata.
 * Returns one-time and subscription packages sorted by price (cheapest first),
 * plus base rates computed from the cheapest one-off package.
 *
 * Results are cached in-memory for 5 minutes.
 */
export async function getStripeProducts(): Promise<Omit<CachedProducts, "fetchedAt">> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    const { fetchedAt: _, ...rest } = cache;
    return rest;
  }

  const products = await stripe.products.list({
    active: true,
    limit: 100,
    expand: ["data.default_price"],
  });

  // Fetch all prices for each product (products can have multiple currency prices)
  const packages: StripePackage[] = [];

  for (const product of products.data) {
    const tokenAmount = Number(product.metadata.tokenAmount);
    if (!tokenAmount) continue;

    // Fetch all active prices for this product
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });

    const priceMap: Partial<Record<SupportedCurrency, { priceId: string; unitAmount: number }>> = {};
    let type: "one_time" | "subscription" | null = null;

    for (const price of prices.data) {
      const currency = price.currency as SupportedCurrency;
      if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) continue;
      if (price.unit_amount == null) continue;

      priceMap[currency] = {
        priceId: price.id,
        unitAmount: price.unit_amount,
      };

      // All prices for a product should be the same type
      type = price.type === "recurring" ? "subscription" : "one_time";
    }

    if (!type || Object.keys(priceMap).length === 0) continue;

    packages.push({
      stripeProductId: product.id,
      name: product.name,
      description: product.description,
      tokenAmount,
      prices: priceMap as Record<SupportedCurrency, { priceId: string; unitAmount: number }>,
      type,
    });
  }

  const oneTimePackages = packages
    .filter((p) => p.type === "one_time")
    .sort((a, b) => a.prices.usd.unitAmount - b.prices.usd.unitAmount);

  const subscriptionPackages = packages
    .filter((p) => p.type === "subscription")
    .sort((a, b) => a.prices.usd.unitAmount - b.prices.usd.unitAmount);

  // Compute base rates from the cheapest one-off package (price per token)
  const baseRates = computeBaseRates(oneTimePackages);

  cache = { oneTimePackages, subscriptionPackages, baseRates, fetchedAt: Date.now() };

  return { oneTimePackages, subscriptionPackages, baseRates };
}

function computeBaseRates(
  oneTimePackages: StripePackage[],
): Record<SupportedCurrency, number> {
  // Default fallback rates if no one-off packages exist
  const rates: Record<SupportedCurrency, number> = { usd: 300, gbp: 240, eur: 280 };

  if (oneTimePackages.length === 0) return rates;

  const cheapest = oneTimePackages[0]; // already sorted cheapest first
  if (cheapest.tokenAmount <= 0) return rates;
  for (const currency of SUPPORTED_CURRENCIES) {
    rates[currency] = Math.round(cheapest.prices[currency].unitAmount / cheapest.tokenAmount);
  }

  return rates;
}

/**
 * Look up a Stripe Price ID and return its associated product metadata.
 * Used by the checkout route to validate client-submitted priceIds.
 */
export async function getProductByPriceId(priceId: string): Promise<{
  stripeProductId: string;
  tokenAmount: number;
  type: "one_time" | "subscription";
  currency: string;
} | null> {
  const { oneTimePackages, subscriptionPackages } = await getStripeProducts();
  const allPackages = [...oneTimePackages, ...subscriptionPackages];

  for (const pkg of allPackages) {
    for (const [currency, priceInfo] of Object.entries(pkg.prices)) {
      if (priceInfo.priceId === priceId) {
        return {
          stripeProductId: pkg.stripeProductId,
          tokenAmount: pkg.tokenAmount,
          type: pkg.type,
          currency,
        };
      }
    }
  }

  return null;
}

/** Invalidate the in-memory cache (e.g., for testing). */
export function invalidateProductCache(): void {
  cache = null;
}
