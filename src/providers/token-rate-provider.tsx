"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { tokensToCurrencyDisplay as convertTokens } from "@/lib/stripe/utils";
import type { SupportedCurrency } from "@/lib/constants/currency";

interface TokenRateContextValue {
  baseRates: Record<SupportedCurrency, number>;
  tokensToCurrencyDisplay: (tokens: number, currency: SupportedCurrency, locale: string) => string;
}

const TokenRateContext = createContext<TokenRateContextValue | null>(null);

interface TokenRateProviderProps {
  children: ReactNode;
  baseRates: Record<SupportedCurrency, number>;
}

export function TokenRateProvider({ children, baseRates }: TokenRateProviderProps) {
  const tokensToCurrencyDisplay = useCallback(
    (tokens: number, currency: SupportedCurrency, locale: string) =>
      convertTokens(tokens, baseRates[currency], currency, locale),
    [baseRates],
  );

  return (
    <TokenRateContext.Provider value={{ baseRates, tokensToCurrencyDisplay }}>
      {children}
    </TokenRateContext.Provider>
  );
}

export function useTokenRates(): TokenRateContextValue {
  const ctx = useContext(TokenRateContext);
  if (!ctx) {
    throw new Error("useTokenRates must be used within a TokenRateProvider");
  }
  return ctx;
}
