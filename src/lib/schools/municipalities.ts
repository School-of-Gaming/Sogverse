import type { Location } from "@/types";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";

// Pure logic behind the public /schools page: turn the flat FI locations list
// plus the set of visible municipality-club locations into a sorted list of
// municipalities, each flagged with whether a club is currently available
// there. Kept React/Supabase-free so it unit-tests directly.

/** One municipality row for the /schools list. */
export interface MunicipalityEntry {
  id: string;
  /** Display name in the viewer's locale (Swedish name for `sv`, else `name`). */
  name: string;
  /**
   * URL slug for the (future) `/schools/<slug>` page, derived from the
   * viewer-locale display name — a Swedish viewer links to `helsingfors`, a
   * Finnish viewer to `helsinki`. Both resolve to the same row via
   * `findMunicipalityBySlug`, which accepts the canonical and every alternate
   * slug.
   */
  slug: string;
  /**
   * Slugs to match a search query against — the canonical name plus every
   * alternate-locale name, so a Swedish speaker finds "Helsingfors" and a
   * Finnish speaker finds "Helsinki" for the same row.
   */
  searchSlugs: string[];
  regionId: string | null;
  /** Region display name in the viewer's locale. */
  regionName: string | null;
  /** True when >=1 visible municipality club resolves to this municipality. */
  hasClubs: boolean;
}

/** Municipalities grouped under their region, for the default browse view. */
export interface RegionGroup {
  regionId: string | null;
  regionName: string | null;
  municipalities: MunicipalityEntry[];
}

/**
 * Walk a location up its parent chain to the nearest `municipality` (including
 * itself). An online municipality club's `location_id` *is* the municipality;
 * an in-person one points at a `site` whose parent is the municipality. A
 * region- or country-scoped location has no municipality ancestor and resolves
 * to `null` — deliberately: availability is municipality-exact, no cascade.
 * Cycle-guarded against malformed `parent_id`.
 */
function nearestMunicipalityId(
  locationId: string,
  byId: Map<string, Location>,
): string | null {
  const seen = new Set<string>();
  let current = byId.get(locationId);
  while (current && !seen.has(current.id)) {
    if (current.type === "municipality") return current.id;
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/**
 * Build the full sorted list of Finnish municipalities, each flagged with
 * whether a visible club is available there.
 *
 * @param locations         the full flat locations list (any countries/levels)
 * @param clubLocationIds   `location_id` of each visible municipality club
 *                          (null entries are ignored)
 */
export function buildMunicipalityEntries(
  locations: Location[],
  clubLocationIds: (string | null)[],
  locale: string,
): MunicipalityEntry[] {
  const byId = new Map(locations.map((l) => [l.id, l]));

  const activeMunicipalityIds = new Set<string>();
  for (const locId of clubLocationIds) {
    if (!locId) continue;
    const muniId = nearestMunicipalityId(locId, byId);
    if (muniId) activeMunicipalityIds.add(muniId);
  }

  return locations
    .filter((l) => l.type === "municipality" && l.country_code === "FI")
    .map((m) => {
      const region = m.parent_id ? byId.get(m.parent_id) : undefined;
      const isRegion = region?.type === "region";
      const displayName = localizedLocationName(m, locale);
      return {
        id: m.id,
        name: displayName,
        slug: municipalitySlug(displayName),
        searchSlugs: [
          municipalitySlug(m.name),
          ...localizedNameAlternates(m).map(municipalitySlug),
        ],
        regionId: isRegion ? region.id : null,
        regionName: isRegion ? localizedLocationName(region, locale) : null,
        hasClubs: activeMunicipalityIds.has(m.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * Resolve a `/schools/<slug>` URL slug back to its municipality entry. Accepts
 * the canonical slug *and* every alternate-locale slug, so both `helsinki` and
 * `helsingfors` land on the same row regardless of the viewer's locale — the
 * URL rests on whatever was linked/bookmarked, and switching locale never
 * rewrites it. Returns `undefined` for an unknown slug (the page 404s on that).
 */
export function findMunicipalityBySlug(
  slug: string,
  entries: MunicipalityEntry[],
): MunicipalityEntry | undefined {
  return entries.find(
    (e) => e.slug === slug || e.searchSlugs.includes(slug),
  );
}

/**
 * Group municipalities under their region, regions sorted by name and
 * municipalities sorted within each (Finnish collation). Used for the default
 * view, which passes only the municipalities that `hasClubs`.
 */
export function groupByRegion(entries: MunicipalityEntry[]): RegionGroup[] {
  const groups = new Map<string, RegionGroup>();
  for (const e of entries) {
    const key = e.regionId ?? "__none__";
    let group = groups.get(key);
    if (!group) {
      group = {
        regionId: e.regionId,
        regionName: e.regionName,
        municipalities: [],
      };
      groups.set(key, group);
    }
    group.municipalities.push(e);
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.municipalities.sort((a, b) => a.name.localeCompare(b.name, "fi"));
  }
  return result.sort((a, b) =>
    (a.regionName ?? "").localeCompare(b.regionName ?? "", "fi"),
  );
}
