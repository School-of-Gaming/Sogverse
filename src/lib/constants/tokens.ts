export const TOKEN_BASE_RATE_CENTS = 300; // $3.00 per token

export type TokenPackageType = "one_time" | "subscription";

export interface TokenPackage {
  id: TokenPackageId;
  name: string;
  tokens: number;
  priceCents: number;
  type: TokenPackageType;
  savingsCents?: number;
  description: string;
}

export type TokenPackageId = "tokens_5" | "tokens_20" | "tokens_sub_25";

export const TOKEN_PACKAGES: TokenPackage[] = [
  {
    id: "tokens_5",
    name: "Starter Pack",
    tokens: 5,
    priceCents: 1500,
    type: "one_time",
    description: "5 Sorgs to get started",
  },
  {
    id: "tokens_20",
    name: "Value Pack",
    tokens: 20,
    priceCents: 5500,
    type: "one_time",
    savingsCents: 500,
    description: "20 Sorgs — save $5",
  },
  {
    id: "tokens_sub_25",
    name: "Monthly Pass",
    tokens: 25,
    priceCents: 5000,
    type: "subscription",
    savingsCents: 2500,
    description: "25 Sorgs every month — save $25/mo",
  },
];

export function getTokenPackage(id: string): TokenPackage | undefined {
  return TOKEN_PACKAGES.find((pkg) => pkg.id === id);
}
