"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { LocaleProvider } from "./locale-provider";
import { CurrencyProvider } from "./currency-provider";
import { TimezoneProvider } from "./timezone-provider";
import { NowProvider } from "./now-provider";
import { ThemeProvider } from "./theme-provider";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/types";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
  initialLocale: string;
  /**
   * Server-resolved timezone for the viewer (validated `timezone` cookie or
   * `DEFAULT_TIMEZONE` fallback). Seeds `TimezoneProvider` so the first
   * client render matches SSR; the provider's post-mount detection
   * replaces it if the browser disagrees. See `src/providers/timezone-provider.tsx`.
   */
  initialTimezone: string;
  /**
   * Server's `new Date()` at request time. Seeds `NowProvider` so the first
   * client render matches SSR; the 30s tick takes over after mount.
   */
  initialNow: Date;
  messages: Record<string, unknown>;
  nonce?: string;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
  initialLocale,
  initialTimezone,
  initialNow,
  messages,
  nonce,
}: ProvidersProps) {
  return (
    <ThemeProvider nonce={nonce}>
      <QueryProvider>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          {/* `NextIntlClientProvider` keeps `DEFAULT_TIMEZONE` for now — once
              enough call sites consume `useTimezone()` directly, flip this
              to the viewer's actual zone. Tracked in TODO.md. */}
          <NextIntlClientProvider locale={initialLocale} messages={messages} timeZone={DEFAULT_TIMEZONE}>
            <LocaleProvider>
              <CurrencyProvider>
                <TimezoneProvider initialTimezone={initialTimezone}>
                  <NowProvider initialNow={initialNow}>
                    {children}
                  </NowProvider>
                </TimezoneProvider>
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
export { TimezoneProvider, useTimezone } from "./timezone-provider";
export { NowProvider, useNow } from "./now-provider";
