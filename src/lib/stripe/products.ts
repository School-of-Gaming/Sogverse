import Stripe from "stripe";
import { unstable_cache } from "next/cache";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { StripePackage } from "@/types";

// Re-export pure utilities so server-side consumers can import from one place
export { getPackageSavings, tokensToCurrencyDisplay } from "./utils";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface StripeProducts {
  oneTimePackages: StripePackage[];
  subscriptionPackages: StripePackage[];
  baseRates: Record<SupportedCurrency, number>;
}

/**
 * Fetch active Stripe Products with `tokenAmount` metadata.
 * Returns one-time and subscription packages sorted by price (cheapest first),
 * plus base rates computed from the cheapest one-off package.
 *
 * Cached via Next.js data cache (persists across serverless cold starts).
 * Revalidates every 5 minutes with stale-while-revalidate.
 */
export const getStripeProducts = unstable_cache(
  async (): Promise<StripeProducts> => {
    const start = Date.now();
    const products = await stripe.products.list({
      active: true,
      limit: 100,
    });

    // Filter to Sogverse token products (those with tokenAmount metadata)
    const tokenProducts = products.data.filter(
      (p) => Number(p.metadata.tokenAmount) > 0,
    );

    // Fetch prices for all token products in parallel (one call per product,
    // but concurrent instead of sequential)
    const priceResults = await Promise.all(
      tokenProducts.map((p) =>
        stripe.prices.list({ product: p.id, active: true, limit: 100 }),
      ),
    );

    const packages: StripePackage[] = [];

    for (let i = 0; i < tokenProducts.length; i++) {
      const product = tokenProducts[i];
      const prices = priceResults[i];
      const tokenAmount = Number(product.metadata.tokenAmount);

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

    console.log(
      `[Stripe] Cache miss — fetched ${oneTimePackages.length} one-time + ${subscriptionPackages.length} subscription packages in ${Date.now() - start}ms`,
    );

    return { oneTimePackages, subscriptionPackages, baseRates };
  },
  ["stripe-products"],
  { revalidate: 300 }, // 5 minutes
);

function computeBaseRates(
  oneTimePackages: StripePackage[],
): Record<SupportedCurrency, number> {
  if (oneTimePackages.length === 0) {
    throw new Error("No one-time packages found in Stripe — cannot compute base rates");
  }

  const cheapest = oneTimePackages[0]; // already sorted cheapest first
  if (cheapest.tokenAmount <= 0) {
    throw new Error("Cheapest one-time package has invalid tokenAmount");
  }

  const rates = {} as Record<SupportedCurrency, number>;
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
