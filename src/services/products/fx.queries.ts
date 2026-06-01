"use client";

import { useQuery } from "@tanstack/react-query";
import type { SupportedCurrency } from "@/lib/constants";

export type FxRates = Record<SupportedCurrency, number>;

export const fxKeys = {
  ratesFromEur: ["products", "fx", "eur-base"] as const,
};

/**
 * Latest EUR→GBP and EUR→USD rates via our own /api/admin/fx-rates
 * proxy (which talks to frankfurter.dev server-side). Cached 6h —
 * reference rates shift slowly and the admin only needs an approximate
 * suggestion.
 */
export function useFxRatesFromEur(enabled: boolean) {
  return useQuery<FxRates>({
    queryKey: fxKeys.ratesFromEur,
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/admin/fx-rates");
      if (!res.ok) throw new Error(`FX rates HTTP ${res.status}`);
      return (await res.json()) as FxRates;
    },
  });
}
