import type { LocationType } from "@/types";

export interface HierarchyLevel {
  type: LocationType;
  label: string;
}

export interface CountryConfig {
  code: string;
  name: string;
  hierarchy: HierarchyLevel[];
}

/**
 * Defines the strict hierarchy for each supported country.
 * The UI only allows adding children in this order.
 * The DB can store any structure, but the admin UI enforces these.
 */
export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  {
    code: "FI",
    name: "Finland",
    hierarchy: [
      { type: "region", label: "Region" },
      { type: "municipality", label: "Municipality" },
      { type: "site", label: "Site" },
    ],
  },
  {
    code: "US",
    name: "United States",
    hierarchy: [
      { type: "region", label: "State" },
      { type: "municipality", label: "City" },
      { type: "district", label: "School District" },
      { type: "site", label: "Site" },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    hierarchy: [
      { type: "region", label: "Nation" },
      { type: "municipality", label: "City" },
      { type: "district", label: "Borough" },
      { type: "site", label: "Site" },
    ],
  },
];

const countriesByCode = new Map(SUPPORTED_COUNTRIES.map((c) => [c.code, c]));

/** Get the country config for a country code, or null if unsupported. */
export function getCountryConfig(countryCode: string | null): CountryConfig | null {
  if (!countryCode) return null;
  return countriesByCode.get(countryCode) ?? null;
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

/**
 * Get the display label for a location type within a specific country.
 * Falls back to the generic type name if the country is unknown.
 */
export function getTypeLabel(
  countryCode: string | null,
  type: LocationType
): string {
  if (type === "country") return "Country";

  const config = getCountryConfig(countryCode);
  if (config) {
    const level = config.hierarchy.find((h) => h.type === type);
    if (level) return level.label;
  }

  // Fallback: capitalize the type
  return type.charAt(0).toUpperCase() + type.slice(1);
}
