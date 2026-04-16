"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { LocaleProvider } from "./locale-provider";
import { CurrencyProvider } from "./currency-provider";
import { ThemeProvider } from "./theme-provider";
import { TokenRateProvider } from "./token-rate-provider";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
  initialLocale: string;
  messages: Record<string, unknown>;
  baseRates: Record<SupportedCurrency, number>;
  nonce?: string;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
  initialLocale,
  messages,
  baseRates,
  nonce,
}: ProvidersProps) {
  return (
    <ThemeProvider nonce={nonce}>
      <QueryProvider>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          <NextIntlClientProvider locale={initialLocale} messages={messages} timeZone={DEFAULT_TIMEZONE}>
            <LocaleProvider>
              <CurrencyProvider>
                <TokenRateProvider baseRates={baseRates}>
                  {children}
                </TokenRateProvider>
              </CurrencyProvider>
            </LocaleProvider>
          </NextIntlClientProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

export { useAuth, useRequiredAuth } from "./auth-provider";
export { QueryProvider } from "./query-provider";
export { ThemeProvider } from "./theme-provider";
export { AuthProvider } from "./auth-provider";
export { LocaleProvider, useLocaleControl } from "./locale-provider";
export { CurrencyProvider, useCurrency } from "./currency-provider";
export { TokenRateProvider, useTokenRates } from "./token-rate-provider";
