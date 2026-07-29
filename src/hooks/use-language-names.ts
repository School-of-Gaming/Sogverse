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
      return new Intl.DisplayNames([uiLocale], { type: "language" });
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
