// Single source of truth for supported currencies.
// When adding a new currency, also update CURRENCY_CONFIG below and
// ensure Stripe Products have prices in the new currency.
export const SUPPORTED_CURRENCIES = ["usd", "gbp", "eur"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SupportedCurrency = "eur";

export const CURRENCY_CONFIG: Record<
  SupportedCurrency,
  { symbol: string; label: string; locale: string }
> = {
  usd: { symbol: "$", label: "USD", locale: "en-US" },
  gbp: { symbol: "\u00A3", label: "GBP", locale: "en-GB" },
  eur: { symbol: "\u20AC", label: "EUR", locale: "en-IE" },
};

/**
 * Map a browser locale (e.g. "en-US", "de-DE", "fr") to a supported currency.
 * Falls back to DEFAULT_CURRENCY for unrecognized locales.
 */
export function detectCurrencyFromLocale(locale: string): SupportedCurrency {
  const region = locale.split("-")[1]?.toUpperCase();
  if (region === "US") return "usd";
  if (region === "GB") return "gbp";

  // European countries that use EUR
  const eurRegions = new Set([
    "DE", "FR", "ES", "IT", "NL", "PT", "AT", "BE", "FI", "IE", "GR",
    "LU", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR",
  ]);
  if (region && eurRegions.has(region)) return "eur";

  // Language-only codes (no region): map common European languages to EUR
  const lang = locale.split("-")[0]?.toLowerCase();
  const eurLanguages = new Set([
    "de", "fr", "es", "it", "nl", "pt", "fi", "el", "sk", "sl", "et",
    "lv", "lt", "mt", "hr",
  ]);
  if (eurLanguages.has(lang)) return "eur";

  return DEFAULT_CURRENCY;
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}
