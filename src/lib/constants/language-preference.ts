// Single source of truth for supported UI languages.
// When adding a new language, also update LANGUAGE_CONFIG below,
// add a messages/<code>.json file, and update the CI check script.
export const SUPPORTED_LANGUAGES = ["en", "fi", "sv"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export const LANGUAGE_CONFIG: Record<
  SupportedLanguage,
  { label: string; nativeLabel: string; country: string }
> = {
  en: { label: "English", nativeLabel: "English", country: "GB" },
  fi: { label: "Finnish", nativeLabel: "Suomi", country: "FI" },
  sv: { label: "Swedish", nativeLabel: "Svenska", country: "SE" },
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

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}
