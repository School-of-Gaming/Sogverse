"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { CurrencyProvider } from "./currency-provider";
import { ThemeProvider } from "./theme-provider";
import { TokenRateProvider } from "./token-rate-provider";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
  initialLocale: string;
  baseRates: Record<SupportedCurrency, number>;
  nonce?: string;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
  initialLocale,
  baseRates,
  nonce,
}: ProvidersProps) {
  return (
    <ThemeProvider nonce={nonce}>
      <QueryProvider>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          <CurrencyProvider initialLocale={initialLocale}>
            <TokenRateProvider baseRates={baseRates}>
              {children}
            </TokenRateProvider>
          </CurrencyProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { useAuth, useRequiredAuth } from "./auth-provider";
export { QueryProvider } from "./query-provider";
export { ThemeProvider } from "./theme-provider";
export { AuthProvider } from "./auth-provider";
export { CurrencyProvider, useCurrency } from "./currency-provider";
export { TokenRateProvider, useTokenRates } from "./token-rate-provider";
