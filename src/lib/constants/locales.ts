// =============================================================================
// UI LOCALE constants (next-intl)
// =============================================================================
//
// This file owns the **UI locale** system — which translation of the web app
// the user sees (English, Finnish, Swedish, Klingon, ...). It backs:
//   - profiles.locale           (DB column)
//   - the `locale` cookie       (set on every locale change for SSR)
//   - the LocalePicker dropdown in the header
//   - next-intl's getTranslations / useTranslations
//
// **Not the same as spoken languages.** "Spoken languages" are the human
// languages a user speaks / a club is delivered in (Finnish, English, Swedish,
// ...) — stored in the `spoken_languages` reference table and the
// `profiles.spoken_languages` array. For that, see
// src/components/ui/spoken-language-checkboxes.tsx.
//
// We use the word **locale** for UI translation (matches next-intl's
// `useLocale()` and Unicode/ICU terminology) and **spoken language** for human
// fluency. They are deliberately named differently — see CLAUDE.md and
// docs/i18n-architecture.md.
//
// When adding a new locale, also update LOCALE_CONFIG below, add a
// messages/<code>.json file, and update the CI check script.

export const SUPPORTED_LOCALES = ["en", "fi", "sv", "tlh"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

// Server-side default for next-intl's date/time formatters (useFormatter).
// Not auto-detected from the browser — HTTP headers don't carry timezone.
// Only affects next-intl formatters, not date-fns-tz which handles its own
// timezone logic. Helsinki chosen as most users are in Finland/Sweden (±1h).
// Used in both src/i18n/request.ts (server) and src/providers/index.tsx (client).
export const DEFAULT_TIMEZONE = "Europe/Helsinki";

export const LOCALE_CONFIG: Record<
  SupportedLocale,
  { label: string; nativeLabel: string; country: string }
> = {
  en: { label: "English", nativeLabel: "English", country: "GB" },
  fi: { label: "Finnish", nativeLabel: "Suomi", country: "FI" },
  sv: { label: "Swedish", nativeLabel: "Svenska", country: "SE" },
  tlh: { label: "Klingon", nativeLabel: "Klingon", country: "KLINGON" },
};

/**
 * Map a browser locale tag (e.g. "fi-FI", "sv-SE", "en-US") to a supported
 * locale. Extracts the language subtag and returns the matching supported
 * locale, falling back to DEFAULT_LOCALE for unrecognized tags.
 */
export function detectLocaleFromTag(tag: string): SupportedLocale {
  const lang = tag.split("-")[0]?.toLowerCase();
  if (isSupportedLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}

/**
 * Walk an Accept-Language header in priority order and return the first
 * supported locale. Falls back to DEFAULT_LOCALE when no match is found.
 *
 * Unlike detectLocaleFromTag (single tag), this handles the full ranked
 * header so users whose primary language is unsupported but who list a
 * supported language lower in the preference list still get a match.
 */
export function detectLocaleFromHeader(
  header: string | null,
): SupportedLocale {
  if (!header) return DEFAULT_LOCALE;

  // Parse into { tag, q } entries sorted by descending quality
  const entries: { tag: string; q: number }[] = [];
  for (const entry of header.split(",")) {
    const parts = entry.trim().split(";");
    const tag = parts[0].trim();
    if (!tag) continue;

    let q = 1;
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i].trim();
      if (param.startsWith("q=")) {
        q = parseFloat(param.slice(2));
        if (isNaN(q)) q = 0;
      }
    }
    entries.push({ tag, q });
  }

  entries.sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    const lang = tag.split("-")[0]?.toLowerCase();
    if (isSupportedLocale(lang)) return lang;
  }

  return DEFAULT_LOCALE;
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
