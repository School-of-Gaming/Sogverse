"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import {
  languageDisplayName,
  languageDisplayNames,
} from "@/lib/i18n/language-name";

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
 * the **locale** side alone: the locale surfaces pass `LOCALE_CONFIG.label` so
 * `tlh` reads "Klingon" rather than a raw tag. Every spoken-language code is
 * named in every locale we ship, so those callers pass no fallback at all. (For
 * a viewer whose locale Intl has no data for — Klingon again — `DisplayNames`
 * resolves against its own default-locale data, so tlh viewers read English
 * language names; the easter egg does not get its own.)
 *
 * **Klingon is never asked of Intl at all.** Whether CLDR has a name for it
 * depends on the ICU build: the Node this renders on names it in French,
 * Finnish and Swedish ("klingon", "klingonska"), and the browser hydrating that
 * markup does not and falls back to English "Klingon" — a hydration mismatch
 * on every locale picker for any viewer whose browser and our server disagree,
 * and one that flips as either side updates its ICU. So the answer for `tlh`
 * is the caller's fallback, deterministically, on both sides. That also
 * matches the house rule for the easter egg: "Klingon" is a mark, like
 * "Sogverse", and is not translated.
 */
export function useLanguageNames(): (code: string, fallback?: string) => string {
  const uiLocale = resolveLocale(useLocale());

  // The instance and the lookup both live in `@/lib/i18n/language-name`, with
  // the reasoning above spelled out beside them — the signup confirmation email
  // names a product's spoken language the same way and cannot call a hook, so
  // the rule has one home and this is its React wrapper. All the hook adds is
  // memoisation of the instance across renders.
  const displayNames = useMemo(() => languageDisplayNames(uiLocale), [uiLocale]);

  return useMemo(
    () => (code: string, fallback?: string) =>
      languageDisplayName(displayNames, code, fallback),
    [displayNames],
  );
}
