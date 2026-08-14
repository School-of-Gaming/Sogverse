"use client";

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { QueryProvider } from "./query-provider";
import { AuthProvider } from "./auth-provider";
import { LocaleProvider } from "./locale-provider";
import { TimezoneProvider } from "./timezone-provider";
import { NowProvider } from "./now-provider";
import { ReferralProvider } from "./referral-provider";
import type { AuthenticatedUser, Profile } from "@/types";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";

interface ProvidersProps {
  children: ReactNode;
  initialUser?: AuthenticatedUser | null;
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
  /**
   * The sanitised `?ref=` code from this request's `x-referral-code` header, or
   * null. Seeds `ReferralProvider` once and is never re-synced — the root layout
   * re-runs mid-session (a locale change calls `router.refresh()`) against a URL
   * that no longer carries the param. See `src/providers/referral-provider.tsx`.
   */
  initialReferralCode: string | null;
  messages: Record<string, unknown>;
}

export function Providers({
  children,
  initialUser,
  initialProfile,
  initialLocale,
  initialTimezone,
  initialNow,
  initialReferralCode,
  messages,
}: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
        {/* `NextIntlClientProvider` keeps `DEFAULT_TIMEZONE` for now — once
            enough call sites consume `useTimezone()` directly, flip this
            to the viewer's actual zone. Tracked in TODO.md. */}
        <NextIntlClientProvider locale={initialLocale} messages={messages} timeZone={DEFAULT_TIMEZONE}>
          <LocaleProvider>
            <TimezoneProvider initialTimezone={initialTimezone}>
              <NowProvider initialNow={initialNow}>
                <ReferralProvider initialReferralCode={initialReferralCode}>
                  {children}
                </ReferralProvider>
              </NowProvider>
            </TimezoneProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
      </AuthProvider>
    </QueryProvider>
  );
}

export { useAuth, useRequiredAuth } from "./auth-provider";
export { QueryProvider } from "./query-provider";
export { AuthProvider } from "./auth-provider";
export { LocaleProvider, useLocaleControl } from "./locale-provider";
export { TimezoneProvider, useTimezone } from "./timezone-provider";
export { NowProvider, useNow } from "./now-provider";
export { ReferralProvider, useReferralCode } from "./referral-provider";
