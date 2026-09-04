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
  hierarchy: HierarchyLevel[];
  /**
   * The level a parent identifies with, and the level a `site` is parented
   * under. **One field for both roles, because the architecture requires them
   * to be the same level**: a site is created directly beneath the row an
   * admin confirmed in the picker, and a family's own location is the level
   * directly above a site. Splitting them would invite a config where a site's
   * parent is not the level a parent picks, which nothing downstream could
   * reconcile.
   *
   * It is therefore always the level immediately above `site` in this country's
   * own `hierarchy` — a unit test pins that structurally, for every country
   * here. It is `municipality` for every country whose rows are seeded today,
   * which a second assertion pins separately, because the two facts are not the
   * same fact: the speculative US/GB/JP entries below honestly declare
   * `district` *below* municipality, so their anchor is `district`. They just
   * have no rows.
   *
   * The day one of those is seeded is the day the pickers' hardcoded
   * `municipality` pickable types have to generalize to anchor-driven, and the
   * seeded-country assertion is the tripwire that forces that work then. Until
   * then the pickers keep their current types with no new machinery.
   */
  anchor: LocationType;
  /**
   * The IANA zones this country's sessions can be scheduled in, primary first.
   *
   * Required, and that is the whole mechanism: a new country entry that forgets
   * its zones does not compile, so the admin product form's timezone dropdown
   * cannot silently go on offering the old set after the platform gains a
   * country. A country spanning several zones lists all of them — the field is
   * a non-empty tuple, not one string, because country↔timezone is not 1:1 —
   * and the first entry is the one an admin should read as the country's
   * ordinary answer.
   */
  timezones: readonly [string, ...string[]];
  /**
   * Whether this country's region/municipality/district rows exist in the
   * `locations` table.
   *
   * A declared flag rather than a query: it is what the anchor tripwire above
   * reads, and a tripwire that fired only after a seed migration reached a
   * database would fire too late to be useful. Seeding a country is adding its
   * rows *and* flipping this — and if flipping it fails the assertion, that
   * failure is the whole point.
   */
  seeded: boolean;
}

/**
 * Defines the strict hierarchy for each supported country.
 * The UI only allows adding children in this order.
 * The DB can store any structure, but the admin UI enforces these.
 *
 * Location type labels are translated for the country's native language only.
 * A Finnish user sees Finland's hierarchy in Finnish but UK/US in English.
 * See src/services/locations/CLAUDE.md for the rationale.
 */
export const SUPPORTED_COUNTRIES: CountryConfig[] = [
  {
    code: "FI",
    name: "Finland",
    anchor: "municipality",
    timezones: ["Europe/Helsinki"],
    seeded: true,
    hierarchy: [
      { type: "region", label: "Region", pluralLabel: "Regions", i18n: { fi: { label: "Maakunta", pluralLabel: "Maakunnat" } } },
      { type: "municipality", label: "Municipality", pluralLabel: "Municipalities", i18n: { fi: { label: "Kunta", pluralLabel: "Kunnat" } } },
      { type: "site", label: "Site", pluralLabel: "Sites", i18n: { fi: { label: "Toimipiste", pluralLabel: "Toimipisteet" } } },
    ],
  },
  {
    code: "FR",
    name: "France",
    anchor: "municipality",
    // Metropolitan France only. The overseas départements span a further ten
    // zones and would be listed here the day one of them is operated in.
    timezones: ["Europe/Paris"],
    seeded: true,
    // France uses the `district` level Finland skips: région → département →
    // commune. `fr` is a supported UI locale, so every level carries its French
    // label pair per the rule in src/services/locations/CLAUDE.md.
    hierarchy: [
      { type: "region", label: "Region", pluralLabel: "Regions", i18n: { fr: { label: "Région", pluralLabel: "Régions" } } },
      { type: "district", label: "Department", pluralLabel: "Departments", i18n: { fr: { label: "Département", pluralLabel: "Départements" } } },
      { type: "municipality", label: "Commune", pluralLabel: "Communes", i18n: { fr: { label: "Commune", pluralLabel: "Communes" } } },
      { type: "site", label: "Site", pluralLabel: "Sites", i18n: { fr: { label: "Site", pluralLabel: "Sites" } } },
    ],
  },
  {
    code: "US",
    name: "United States",
    anchor: "district",
    // Representative rather than complete, and honest about it: the US spans
    // six zones and the day it is seeded is the day the rest of them are
    // written here. Unseeded, so nothing offers this list yet.
    timezones: ["America/New_York"],
    seeded: false,
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
    anchor: "municipality",
    timezones: ["Europe/London"],
    seeded: true,
    // Nation → local authority. The speculative entry here used to read
    // Nation → City → Borough, which is how the UK looks from outside and not
    // how it is governed: "borough" is one of several words for the same rung
    // (Scotland has council areas, Wales principal areas, Northern Ireland
    // districts, England a mixture of counties, unitaries and metropolitan
    // boroughs), and there is no administrative city level above them. "Local
    // authority" is the term that covers all four nations and the one a UK
    // parent reads on a council letter. No `i18n` entries: English is the
    // default label language, so a country whose own language is English has
    // nothing to add.
    hierarchy: [
      { type: "region", label: "Nation", pluralLabel: "Nations" },
      { type: "municipality", label: "Local Authority", pluralLabel: "Local Authorities" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
  {
    code: "SE",
    name: "Sweden",
    anchor: "municipality",
    timezones: ["Europe/Stockholm"],
    seeded: true,
    hierarchy: [
      { type: "region", label: "County", pluralLabel: "Counties", i18n: { sv: { label: "Län", pluralLabel: "Län" } } },
      { type: "municipality", label: "Municipality", pluralLabel: "Municipalities", i18n: { sv: { label: "Kommun", pluralLabel: "Kommuner" } } },
      { type: "site", label: "Site", pluralLabel: "Sites", i18n: { sv: { label: "Plats", pluralLabel: "Platser" } } },
    ],
  },
  {
    code: "ES",
    name: "Spain",
    anchor: "municipality",
    // Mainland and the Balearics. The Canaries sit an hour behind on
    // Atlantic/Canary and join this list if Spain is ever seeded.
    timezones: ["Europe/Madrid"],
    seeded: false,
    hierarchy: [
      { type: "region", label: "Autonomous Community", pluralLabel: "Autonomous Communities" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
  {
    code: "JP",
    name: "Japan",
    anchor: "district",
    timezones: ["Asia/Tokyo"],
    seeded: false,
    hierarchy: [
      { type: "region", label: "Prefecture", pluralLabel: "Prefectures" },
      { type: "municipality", label: "City", pluralLabel: "Cities" },
      { type: "district", label: "Ward", pluralLabel: "Wards" },
      { type: "site", label: "Site", pluralLabel: "Sites" },
    ],
  },
];

/**
 * The countries whose region/municipality rows actually exist — the `seeded`
 * half of the list above, derived rather than restated so the two cannot drift.
 *
 * This is the set any feature should offer when it asks an admin or a family to
 * *name a country we operate in*: an unseeded entry is a declared hierarchy with
 * nothing under it, so choosing one produces a value no stored location could
 * ever match. Order follows `SUPPORTED_COUNTRIES`.
 */
export const SEEDED_COUNTRIES: readonly CountryConfig[] =
  SUPPORTED_COUNTRIES.filter((c) => c.seeded);

/** Whether a country code names one of the seeded countries above. */
export function isSeededCountry(code: string | null): boolean {
  return SEEDED_COUNTRIES.some((c) => c.code === code);
}

/**
 * The zone a product is authored in unless an admin picks another one.
 *
 * Every product written before the picker existed carries this value, and the
 * create form still starts here: the great majority of what we run is Finnish,
 * so it is the answer that needs no thought.
 */
export const DEFAULT_PRODUCT_TIMEZONE = "Europe/Helsinki";

/**
 * The zones the admin product form offers, in the order it offers them.
 *
 * Derived from the seeded countries' own `timezones` rather than listed
 * separately, so the set of zones a product can be authored in and the set of
 * countries we operate in cannot drift apart: seeding a country adds its zones
 * on the same commit, and the field being required means an entry cannot arrive
 * without them. Unseeded countries are excluded for the same reason
 * `SEEDED_COUNTRIES` excludes them — nothing we run happens there yet.
 *
 * `DEFAULT_PRODUCT_TIMEZONE` leads, then the rest in `SUPPORTED_COUNTRIES`
 * order, deduped because two countries may well share a zone.
 */
export const PRODUCT_TIMEZONES: readonly string[] = [
  ...new Set([
    DEFAULT_PRODUCT_TIMEZONE,
    ...SEEDED_COUNTRIES.flatMap((c) => c.timezones),
  ]),
];

/** Whether a string names one of the zones a product may be authored in. */
export function isProductTimezone(value: string): boolean {
  return PRODUCT_TIMEZONES.includes(value);
}

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

