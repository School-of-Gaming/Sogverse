"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";

/**
 * Resolve a language code to its name in the **viewer's UI locale** —
 * "fi" → Finnish / suomi / finska / finnois, depending on who is looking.
 *
 * This is the one sanctioned way to show a language's name. The
 * `spoken_languages` reference table carries a single English `name` (localizing
 * it there would need a translation table), and `LOCALE_CONFIG.label` is the
 * English label — both are *fallbacks*, not display strings.
 * `Intl.DisplayNames` names any language code in any locale for free and covers
 * every code either system may ever grow, where a hand-maintained map silently
 * falls back to English for anything new.
 *
 * The fallback is returned when Intl cannot help: a code it cannot name, or a
 * viewer locale it has no data for at all (Klingon — `DisplayNames` then
 * resolves against its own default-locale data, so tlh viewers see English
 * names; the easter egg does not get its own language names).
 */
export function useLanguageNames(): (code: string, fallback?: string) => string {
  const uiLocale = resolveLocale(useLocale());

  const displayNames = useMemo(() => {
    try {
      // fallback: "none" is load-bearing: the default ("code") makes `.of()`
      // return the code itself for any well-formed tag Intl has no data for,
      // so the `?? fallback` chain below would never fire and an unknown code
      // would render raw instead of its DB/config English name.
      // "en" second: for a locale Intl has no data for (Klingon), a bare
      // [uiLocale] falls back to the RUNTIME default locale — different on the
      // server and each visitor's machine, i.e. a hydration mismatch. The
      // explicit fallback makes the answer deterministic English everywhere.
      return new Intl.DisplayNames([uiLocale, "en"], {
        type: "language",
        fallback: "none",
      });
    } catch {
      return null;
    }
  }, [uiLocale]);

  return useMemo(
    () => (code: string, fallback?: string) => {
      try {
        return displayNames?.of(code) ?? fallback ?? code;
      } catch {
        // RangeError on a structurally invalid tag — the fallback is exactly
        // for a code Intl refuses.
        return fallback ?? code;
      }
    },
    [displayNames],
  );
}
