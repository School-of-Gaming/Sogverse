"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { LocaleProvider } from "./locale-provider";
import { CurrencyProvider } from "./currency-provider";
import { ThemeProvider } from "./theme-provider";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
  initialLocale: string;
  messages: Record<string, unknown>;
  nonce?: string;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
  initialLocale,
  messages,
  nonce,
}: ProvidersProps) {
  return (
    <ThemeProvider nonce={nonce}>
      <QueryProvider>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          <NextIntlClientProvider locale={initialLocale} messages={messages} timeZone={DEFAULT_TIMEZONE}>
            <LocaleProvider>
              <CurrencyProvider>
                {children}
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
