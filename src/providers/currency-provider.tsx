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
import { useAuth } from "./auth-provider";
import {
  detectCurrencyFromLocale,
  isSupportedCurrency,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";

import { getCookie, setCookie } from "@/lib/cookies";

const COOKIE_NAME = "currency";

function resolveInitialCurrency(profileCurrency: string | null | undefined): SupportedCurrency {
  // 1. Profile preference
  if (profileCurrency && isSupportedCurrency(profileCurrency)) {
    return profileCurrency;
  }

  // 2. Cookie
  const cookieValue = getCookie(COOKIE_NAME);
  if (cookieValue && isSupportedCurrency(cookieValue)) {
    return cookieValue;
  }

  // 3. Browser locale detection
  if (typeof navigator !== "undefined" && navigator.language) {
    return detectCurrencyFromLocale(navigator.language);
  }

  return DEFAULT_CURRENCY;
}

interface CurrencyContextType {
  currency: SupportedCurrency;
  setCurrency: (currency: SupportedCurrency) => void;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { profile, user, refreshProfile } = useAuth();
  // Start with DEFAULT_CURRENCY to match SSR (cookies/navigator aren't
  // available server-side). Synced to the real value after hydration.
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY);

  // Track last synced profile currency to detect when it changes
  const lastProfileCurrency = useRef(profile?.currency);

  // After hydration, resolve the real currency from profile/cookie/locale
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      const resolved = resolveInitialCurrency(profile?.currency);
      if (resolved !== DEFAULT_CURRENCY) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration sync; cookies/navigator aren't available during SSR so we must defer resolution to the client. Guarded by hasMounted.current so it only fires once.
        setCurrencyState(resolved);
      }
    }
  }, [profile?.currency]);

  // Derive currency from profile on render rather than using setState in an
  // effect (which triggers a cascading re-render and violates the
  // react-hooks/set-state-in-effect lint rule). When the profile has a valid
  // currency, it takes priority over local state.
  const profileCurrency = profile?.currency;
  const derivedCurrency =
    profileCurrency && isSupportedCurrency(profileCurrency)
      ? profileCurrency
      : currency;

  // Keep cookie in sync when profile currency changes
  useEffect(() => {
    if (
      profileCurrency &&
      isSupportedCurrency(profileCurrency) &&
      profileCurrency !== lastProfileCurrency.current
    ) {
      setCookie(COOKIE_NAME, profileCurrency);
      lastProfileCurrency.current = profileCurrency;
    }
  }, [profileCurrency]);

  const setCurrency = useCallback(
    (newCurrency: SupportedCurrency) => {
      setCurrencyState(newCurrency);
      setCookie(COOKIE_NAME, newCurrency);
      lastProfileCurrency.current = newCurrency;

      // Persist to profile if logged in
      if (user) {
        fetch("/api/user/currency", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currency: newCurrency }),
        })
          .then(() => refreshProfile())
          .catch((err) => console.error("Failed to persist currency preference:", err));
      }
    },
    [user, refreshProfile]
  );

  return (
    <CurrencyContext.Provider value={{ currency: derivedCurrency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
