import type { LocationType } from "@/types";
import { isSupportedLocale, type SupportedLocale } from "./locales";

interface LabelPair {
  label: string;
  pluralLabel: string;
}

export interface HierarchyLevel {
  type: LocationType;
  /** Default (English) label. */
  label: string;
  /** Default (English) plural label. */
  pluralLabel: string;
  /**
   * Locale-specific labels for the country's own language.
   * Only the country's native language needs an entry here — all others
   * fall back to the English label/pluralLabel above.
   * e.g. Finland's "region" has fi: { label: "Maakunta", pluralLabel: "Maakunnat" }
   */
  i18n?: Partial<Record<SupportedLocale, LabelPair>>;
}

export interface CountryConfig {
  code: string;
  name: string;
  /** Country name in supported languages (falls back to `name` for unlisted locales). */
  nameI18n?: Partial<Record<SupportedLocale, string>>;
  hierarchy: HierarchyLevel[];
}

/**
 * Defines the strict hierarchy for each supported country.
 * The UI only allows adding children in this order.
 * The DB can store any structure, but the admin UI enforces these.
 *
 * Location type labels are translated for the country's native language only.
 * A Finnish user sees Finland's hierarchy in Finnish but UK/US in English.
 * See docs/locations-architecture.md § Localised Labels for the rationale.
 */
export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  {
    code: "FI",
    name: "Finland",
    nameI18n: { fi: "Suomi" },
    hierarchy: [
      { type: "region", label: "Region", pluralLabel: "Regions", i18n: { fi: { label: "Maakunta", pluralLabel: "Maakunnat" } } },
      { type: "municipality", label: "Municipality", pluralLabel: "Municipalities", i18n: { fi: { label: "Kunta", pluralLabel: "Kunnat" } } },
      { type: "site", label: "Site", pluralLabel: "Sites", i18n: { fi: { label: "Toimipiste", pluralLabel: "Toimipisteet" } } },
    ],
  },
  {
    code: "US",
    name: "United States",
    hierarchy: [
      { type: "region", label: "State", pluralLabel: "States" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "district", label: "School District", pluralLabel: "School Districts" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    hierarchy: [
      { type: "region", label: "Nation", pluralLabel: "Nations" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "district", label: "Borough", pluralLabel: "Boroughs" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
  {
    code: "SE",
    name: "Sweden",
    nameI18n: { sv: "Sverige" },
    hierarchy: [
      { type: "region", label: "County", pluralLabel: "Counties", i18n: { sv: { label: "Län", pluralLabel: "Län" } } },
      { type: "municipality", label: "Municipality", pluralLabel: "Municipalities", i18n: { sv: { label: "Kommun", pluralLabel: "Kommuner" } } },
      { type: "site", label: "Site", pluralLabel: "Sites", i18n: { sv: { label: "Plats", pluralLabel: "Platser" } } },
    ],
  },
  {
    code: "ES",
    name: "Spain",
    hierarchy: [
      { type: "region", label: "Autonomous Community", pluralLabel: "Autonomous Communities" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
  {
    code: "JP",
    name: "Japan",
    hierarchy: [
      { type: "region", label: "Prefecture", pluralLabel: "Prefectures" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "district", label: "Ward", pluralLabel: "Wards" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
];

const countriesByCode = new Map(SUPPORTED_COUNTRIES.map((c) => [c.code, c]));

/** Get the country config for a country code, or null if unsupported. */
export function getCountryConfig(countryCode: string | null): CountryConfig | null {
  if (!countryCode) return null;
  return countriesByCode.get(countryCode) ?? null;
}

/** Resolve the label/pluralLabel for a hierarchy level, respecting locale. */
export function resolveLabels(level: HierarchyLevel, locale?: string): LabelPair {
  if (level.i18n && isSupportedLocale(locale)) {
    const localized = level.i18n[locale];
    if (localized) return localized;
  }
  return { label: level.label, pluralLabel: level.pluralLabel };
}

/**
 * Get the next child level for a given location type within a country's hierarchy.
 * Returns null if the type is at the bottom of the hierarchy (no children allowed).
 */
export function getChildLevel(
  countryCode: string | null,
  parentType: LocationType
): HierarchyLevel | null {
  const config = getCountryConfig(countryCode);
  if (!config) return null;

  if (parentType === "country") {
    return config.hierarchy[0] ?? null;
  }

  const idx = config.hierarchy.findIndex((h) => h.type === parentType);
  if (idx === -1 || idx >= config.hierarchy.length - 1) return null;
  return config.hierarchy[idx + 1];
}

/** Get the country display name, respecting locale. */
export function getCountryName(config: CountryConfig, locale?: string): string {
  if (config.nameI18n && isSupportedLocale(locale)) {
    const localized = config.nameI18n[locale];
    if (localized) return localized;
  }
  return config.name;
}
