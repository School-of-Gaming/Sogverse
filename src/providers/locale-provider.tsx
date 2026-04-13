"use client";

/**
 * LocaleProvider owns the user's UI locale — which translation of the web app
 * they see (English, Finnish, Swedish, ...). It syncs `profiles.locale` with a
 * `locale` cookie so SSR picks up the right translation on the next request.
 *
 * **Not the same as spoken languages.** "Spoken languages" are the human
 * languages a user speaks / a club is delivered in (`profiles.spoken_languages`),
 * managed separately via the SpokenLanguageCheckboxes component in settings
 * and used for matching gamers to gedus. See
 * src/components/ui/spoken-language-checkboxes.tsx and
 * docs/i18n-architecture.md for the convention split.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import {
  detectLocaleFromTag,
  isSupportedLocale,
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "@/lib/constants/locales";

import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "locale";

function resolveInitialLocale(
  profileLocale: string | null | undefined,
): SupportedLocale {
  // 1. Profile preference
  if (profileLocale && isSupportedLocale(profileLocale)) {
    return profileLocale;
  }

  // 2. Cookie
  const cookieValue = getCookie(COOKIE_NAME);
  if (cookieValue && isSupportedLocale(cookieValue)) {
    return cookieValue;
  }

  // 3. Browser locale detection
  if (typeof navigator !== "undefined" && navigator.language) {
    return detectLocaleFromTag(navigator.language);
  }

  return DEFAULT_LOCALE;
}

interface LocaleContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextType | undefined>(
  undefined,
);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { profile, user, refreshProfile } = useAuth();
  const router = useRouter();
  // Start with DEFAULT_LOCALE to match SSR (cookies/navigator aren't
  // available server-side). Synced to the real value after hydration.
  const [locale, setLocaleState] =
    useState<SupportedLocale>(DEFAULT_LOCALE);

  // Track last synced profile locale to detect when it changes
  const lastProfileLocale = useRef(profile?.locale);

  // After hydration, resolve the real locale from profile/cookie/browser
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      const resolved = resolveInitialLocale(profile?.locale);
      // One-time hydration sync: cookies/navigator aren't available during
      // SSR so we must defer resolution to the client. Only fires once.
      if (resolved !== DEFAULT_LOCALE) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocaleState(resolved);
      }
    }
  }, [profile?.locale]);

  // Derive locale from profile on render rather than using setState in an
  // effect (which triggers a cascading re-render and violates the
  // react-hooks/set-state-in-effect lint rule). When the profile has a valid
  // locale, it takes priority over local state.
  const profileLocale = profile?.locale;
  const derivedLocale =
    profileLocale && isSupportedLocale(profileLocale)
      ? profileLocale
      : locale;

  // Keep cookie in sync when profile locale changes
  useEffect(() => {
    if (
      profileLocale &&
      isSupportedLocale(profileLocale) &&
      profileLocale !== lastProfileLocale.current
    ) {
      setCookie(COOKIE_NAME, profileLocale);
      lastProfileLocale.current = profileLocale;
    }
  }, [profileLocale]);

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      setLocaleState(newLocale);
      setCookie(COOKIE_NAME, newLocale);
      lastProfileLocale.current = newLocale;

      // Persist to profile if logged in
      if (user) {
        fetch("/api/user/locale", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: newLocale }),
        })
          .then(() => refreshProfile())
          .catch((err) => console.error("Failed to persist locale:", err));
      }

      // Trigger server re-render to load new locale's messages
      router.refresh();
    },
    [user, refreshProfile, router],
  );

  return (
    <LocaleContext.Provider
      value={{ locale: derivedLocale, setLocale }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocalePreference() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error(
      "useLocalePreference must be used within a LocaleProvider",
    );
  }
  return context;
}
