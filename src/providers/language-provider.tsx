"use client";

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
  detectLanguageFromLocale,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
  type SupportedLanguage,
} from "@/lib/constants/language-preference";

import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "language";

function resolveInitialLanguage(
  profileLanguage: string | null | undefined,
): SupportedLanguage {
  // 1. Profile preference
  if (profileLanguage && isSupportedLanguage(profileLanguage)) {
    return profileLanguage;
  }

  // 2. Cookie
  const cookieValue = getCookie(COOKIE_NAME);
  if (cookieValue && isSupportedLanguage(cookieValue)) {
    return cookieValue;
  }

  // 3. Browser locale detection
  if (typeof navigator !== "undefined" && navigator.language) {
    return detectLanguageFromLocale(navigator.language);
  }

  return DEFAULT_LANGUAGE;
}

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { profile, user, refreshProfile } = useAuth();
  const router = useRouter();
  // Start with DEFAULT_LANGUAGE to match SSR (cookies/navigator aren't
  // available server-side). Synced to the real value after hydration.
  const [language, setLanguageState] =
    useState<SupportedLanguage>(DEFAULT_LANGUAGE);

  // Track last synced profile language to detect when it changes
  const lastProfileLanguage = useRef(profile?.language_preference);

  // After hydration, resolve the real language from profile/cookie/locale
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      const resolved = resolveInitialLanguage(profile?.language_preference);
      // One-time hydration sync: cookies/navigator aren't available during
      // SSR so we must defer resolution to the client. Only fires once.
      if (resolved !== DEFAULT_LANGUAGE) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLanguageState(resolved);
      }
    }
  }, [profile?.language_preference]);

  // Derive language from profile on render rather than using setState in an
  // effect (which triggers a cascading re-render and violates the
  // react-hooks/set-state-in-effect lint rule). When the profile has a valid
  // language preference, it takes priority over local state.
  const profileLanguage = profile?.language_preference;
  const derivedLanguage =
    profileLanguage && isSupportedLanguage(profileLanguage)
      ? profileLanguage
      : language;

  // Keep cookie in sync when profile language changes
  useEffect(() => {
    if (
      profileLanguage &&
      isSupportedLanguage(profileLanguage) &&
      profileLanguage !== lastProfileLanguage.current
    ) {
      setCookie(COOKIE_NAME, profileLanguage);
      lastProfileLanguage.current = profileLanguage;
    }
  }, [profileLanguage]);

  const setLanguage = useCallback(
    (newLanguage: SupportedLanguage) => {
      setLanguageState(newLanguage);
      setCookie(COOKIE_NAME, newLanguage);
      lastProfileLanguage.current = newLanguage;

      // Persist to profile if logged in
      if (user) {
        fetch("/api/user/language-preference", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: newLanguage }),
        })
          .then(() => refreshProfile())
          .catch((err) => console.error("Failed to persist language preference:", err));
      }

      // Trigger server re-render to load new locale's messages
      router.refresh();
    },
    [user, refreshProfile, router],
  );

  return (
    <LanguageContext.Provider
      value={{ language: derivedLanguage, setLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguagePreference() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error(
      "useLanguagePreference must be used within a LanguageProvider",
    );
  }
  return context;
}
