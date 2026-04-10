// Single source of truth for supported UI languages.
// When adding a new language, also update LANGUAGE_CONFIG below,
// add a messages/<code>.json file, and update the CI check script.
export const SUPPORTED_LANGUAGES = ["en", "fi", "sv", "tlh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

// Server-side default for next-intl's date/time formatters (useFormatter).
// Not auto-detected from the browser — HTTP headers don't carry timezone.
// Only affects next-intl formatters, not date-fns-tz which handles its own
// timezone logic. Helsinki chosen as most users are in Finland/Sweden (±1h).
// Used in both src/i18n/request.ts (server) and src/providers/index.tsx (client).
export const DEFAULT_TIMEZONE = "Europe/Helsinki";

export const LANGUAGE_CONFIG: Record<
  SupportedLanguage,
  { label: string; nativeLabel: string; country: string }
> = {
  en: { label: "English", nativeLabel: "English", country: "GB" },
  fi: { label: "Finnish", nativeLabel: "Suomi", country: "FI" },
  sv: { label: "Swedish", nativeLabel: "Svenska", country: "SE" },
  tlh: { label: "Klingon", nativeLabel: "Klingon", country: "KLINGON" },
};

/**
 * Map a browser locale (e.g. "fi-FI", "sv-SE", "en-US") to a supported language.
 * Extracts the language subtag and returns the matching supported language,
 * falling back to DEFAULT_LANGUAGE for unrecognized locales.
 */
export function detectLanguageFromLocale(locale: string): SupportedLanguage {
  const lang = locale.split("-")[0]?.toLowerCase();
  if (isSupportedLanguage(lang)) return lang;
  return DEFAULT_LANGUAGE;
}

/**
 * Walk an Accept-Language header in priority order and return the first
 * supported language. Falls back to DEFAULT_LANGUAGE when no match is found.
 *
 * Unlike detectLanguageFromLocale (single locale), this handles the full
 * ranked header so users whose primary language is unsupported but who list
 * a supported language lower in the preference list still get a match.
 */
export function detectLanguageFromHeader(
  header: string | null,
): SupportedLanguage {
  if (!header) return DEFAULT_LANGUAGE;

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
    if (isSupportedLanguage(lang)) return lang;
  }

  return DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}
