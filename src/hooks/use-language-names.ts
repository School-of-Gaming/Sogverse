"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";

/**
 * Resolve a language code to its name in the **viewer's UI locale** —
 * "fi" → Finnish / suomi / finska / finnois, depending on who is looking.
 *
 * This is the one sanctioned way to show a language's name, and it serves both
 * language systems: a spoken-language code and a UI locale are both BCP-47
 * tags, and `Intl.DisplayNames` names either in any locale for free — where a
 * hand-maintained map silently falls back to English for anything new.
 *
 * The optional `fallback` is returned when Intl cannot help, and it exists for
 * the **locale** side alone: `tlh` is not a language Intl has a name for, so
 * the locale surfaces pass `LOCALE_CONFIG.label` and get "Klingon" rather than
 * a raw tag. Every spoken-language code is named in every locale we ship, so
 * those callers pass no fallback at all. (For a viewer whose locale Intl has no
 * data for — Klingon again — `DisplayNames` resolves against its own
 * default-locale data, so tlh viewers read English language names; the easter
 * egg does not get its own.)
 */
export function useLanguageNames(): (code: string, fallback?: string) => string {
  const uiLocale = resolveLocale(useLocale());

  const displayNames = useMemo(() => {
    try {
      // fallback: "none" is load-bearing: the default ("code") makes `.of()`
      // return the code itself for any well-formed tag Intl has no data for,
      // so the `?? fallback` chain below would never fire and an unknown tag
      // would render raw instead of its configured English name.
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
