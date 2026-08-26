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
 * src/i18n/CLAUDE.md for the convention split.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "./auth-provider";
import {
  isSupportedLocale,
  DEFAULT_LOCALE,
  type SupportedLocale,
  type DetectedLocale,
} from "@/lib/constants/locales";

import { getCookie, setCookie } from "@/lib/cookies";
import { trackLocaleChange } from "@/lib/analytics";

const COOKIE_NAME = "locale";

interface LocaleContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  /**
   * What the browser's Accept-Language negotiated to on this request, or
   * `"none"` when it asked only for languages we don't ship. Exposed so the
   * picker can report it alongside its own events; the client cannot derive it
   * (navigator.language disagrees with the sent header on iOS Safari — see the
   * seeding comment below), so it only ever arrives from the server.
   */
  detectedLocale: DetectedLocale;
}

const LocaleContext = createContext<LocaleContextType | undefined>(
  undefined,
);

export function LocaleProvider({
  children,
  detectedLocale,
}: {
  children: ReactNode;
  detectedLocale: DetectedLocale;
}) {
  const { profile, user, refreshProfile } = useAuth();
  const router = useRouter();
  // Seed from the server-resolved locale so SSR and the first client paint
  // agree. The server already ran the priority chain (cookie >
  // Accept-Language > default) in src/i18n/request.ts and exposed the result
  // via NextIntlClientProvider, so useLocale() returns the same value both
  // sides see. Re-deriving on the client from navigator.language used to
  // miss on iOS Safari, where that value can disagree with what the browser
  // actually sent in Accept-Language (e.g. system language Finnish but
  // navigator.language reports "en-US") — the page rendered in Finnish but
  // the LocalePicker showed the EN flag until the user clicked it.
  const intlLocale = useLocale();
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    isSupportedLocale(intlLocale) ? intlLocale : DEFAULT_LOCALE,
  );

  // Derive locale from profile on render rather than using setState in an
  // effect (which triggers a cascading re-render and violates the
  // react-hooks/set-state-in-effect lint rule). When the profile has a valid
  // locale, it takes priority over local state.
  const profileLocale = profile?.locale;
  const derivedLocale =
    profileLocale && isSupportedLocale(profileLocale)
      ? profileLocale
      : locale;

  // Reconcile the cookie with profile.locale whenever the profile changes.
  // Handles the "signed in on a new device" case: the browser has an
  // Accept-Language cookie (e.g. "en") but the profile says "fi". Without
  // this, next-intl's getRequestConfig keeps loading the wrong messages
  // bundle on every SSR render and the user is stuck in the wrong language.
  //
  // When the cookie is out of sync, the SSR-rendered messages bundle is
  // also out of sync (next-intl reads the cookie), so we always refresh
  // after writing. Early-returns when already in sync, so steady state is
  // a no-op.
  useEffect(() => {
    if (!profileLocale || !isSupportedLocale(profileLocale)) return;
    if (getCookie(COOKIE_NAME) === profileLocale) return;
    setCookie(COOKIE_NAME, profileLocale);
    router.refresh();
  }, [profileLocale, router]);

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      // `derivedLocale`, not the raw `locale` state: it's the locale actually
      // on screen (a profile locale outranks local state), which is what the
      // user was reading when they reached for the picker. Skipped entirely
      // when it matches — the picker lets you click the entry that is already
      // active, and a from === to row would be a no-op cluttering the matrix.
      // Everything below still runs in that case: this change adds an event, it
      // does not change what the picker does.
      if (newLocale !== derivedLocale) {
        trackLocaleChange({
          detected: detectedLocale,
          from: derivedLocale,
          to: newLocale,
        });
      }

      setLocaleState(newLocale);
      setCookie(COOKIE_NAME, newLocale);

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
    [user, refreshProfile, router, derivedLocale, detectedLocale],
  );

  return (
    <LocaleContext.Provider
      value={{ locale: derivedLocale, setLocale, detectedLocale }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocaleControl() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error(
      "useLocaleControl must be used within a LocaleProvider",
    );
  }
  return context;
}
