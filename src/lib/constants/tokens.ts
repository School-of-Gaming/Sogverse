import type { SupportedCurrency } from "./currency";

/** Per-currency base rate in cents (used for admin monetary value display) */
export const TOKEN_BASE_RATE: Record<SupportedCurrency, number> = {
  usd: 300,
  gbp: 240,
  eur: 280,
};

export type TokenPackageType = "one_time" | "subscription";

export interface TokenPackage {
  id: TokenPackageId;
  name: string;
  tokens: number;
  prices: Record<SupportedCurrency, number>;
  type: TokenPackageType;
  savings?: Record<SupportedCurrency, number>;
  description: string;
}

export const TOKEN_PACKAGES: TokenPackage[] = [
  {
    id: "tokens_5",
    name: "Starter Pack",
    tokens: 5,
    prices: { usd: 1500, gbp: 1200, eur: 1400 },
    type: "one_time",
    description: "5 Sorgs to get started",
  },
  {
    id: "tokens_20",
    name: "Value Pack",
    tokens: 20,
    prices: { usd: 5500, gbp: 4400, eur: 5100 },
    type: "one_time",
    savings: { usd: 500, gbp: 400, eur: 500 },
    description: "20 Sorgs at a discount",
  },
  {
    id: "tokens_sub_25",
    name: "Monthly Pass",
    tokens: 25,
    prices: { usd: 5000, gbp: 4000, eur: 4600 },
    type: "subscription",
    savings: { usd: 2500, gbp: 2000, eur: 2400 },
    description: "25 Sorgs every month at the best rate",
  },
];

export type TokenPackageId = "tokens_5" | "tokens_20" | "tokens_sub_25";

export function getTokenPackage(id: string): TokenPackage | undefined {
  return TOKEN_PACKAGES.find((pkg) => pkg.id === id);
}

export function getPackagePrice(pkg: TokenPackage, currency: SupportedCurrency): number {
  return pkg.prices[currency];
}

export function getPackageSavings(pkg: TokenPackage, currency: SupportedCurrency): number {
  return pkg.savings?.[currency] ?? 0;
}
