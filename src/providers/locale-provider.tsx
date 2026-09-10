"use client";

/**
 * LocaleProvider carries the UI locale the reader is currently on — which
 * translation of the web app they see (English, Finnish, Swedish, ...) — and
 * the one action that changes it.
 *
 * **It reads the locale, it does not decide it.** The URL decides, and this is
 * a consumer of next-intl's context. What the provider owns is persistence in
 * the other direction: the picker's choice, written to the `locale` cookie and
 * to `profiles.locale`, which is what the bare-path ladder reads on the
 * reader's next cold entry.
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
  useCallback,
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

import { setCookie } from "@/lib/cookies";
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
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  // **The URL is the authority, and this provider is its consumer.** The
  // locale on screen is the one in the address bar, which next-intl resolves
  // from the `[locale]` segment and exposes here — so a signed-in `fi`-profile
  // reader following a shared `/fr/…` link sees FR in the picker, and the visit
  // rewrites nothing.
  //
  // This used to derive the locale with `profiles.locale` taking priority, and
  // to run an effect reconciling the cookie to it (plus a refresh) whenever the
  // profile loaded. Both contradict URL routing: the first would show the
  // picker a language the page is not in, and the second would let one click on
  // somebody else's link silently rewrite the reader's stored preference.
  // Persistence now flows one way only — picker → cookie + profile — with the
  // sign-in flows as the single deliberate exception (they seed the cookie from
  // the profile so the post-login bare path lands prefixed).
  const intlLocale = useLocale();
  const locale = isSupportedLocale(intlLocale) ? intlLocale : DEFAULT_LOCALE;

  const setLocale = useCallback(
    (newLocale: SupportedLocale) => {
      // Skipped entirely when it matches — the picker lets you click the entry
      // that is already active, and a from === to row would be a no-op
      // cluttering the matrix. Everything below still runs in that case: this
      // change adds an event, it does not change what the picker does.
      if (newLocale !== locale) {
        trackLocaleChange({
          detected: detectedLocale,
          from: locale,
          to: newLocale,
        });
      }

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

      // Re-render the server tree so anything outside the URL's own locale —
      // and the cookie fallback the contexts with no URL locale read — picks
      // the new value up. Step 6 adds the navigation to the new prefix beside
      // it; until then this is what the picker does.
      router.refresh();
    },
    [user, refreshProfile, router, locale, detectedLocale],
  );

  return (
    <LocaleContext.Provider
      value={{ locale, setLocale, detectedLocale }}
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
