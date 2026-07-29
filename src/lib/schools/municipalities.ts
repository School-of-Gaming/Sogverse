import type { LocationWithChain } from "@/services/locations";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import {
  municipalityOf,
  type EmbeddedLocation,
} from "@/lib/locations/embedded-chain";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";

// Pure logic behind the public /schools page: turn Finland's municipality rows
// plus the locations of the visible municipality clubs into a sorted list of
// municipalities, each flagged with whether a club is currently available
// there. Kept React/Supabase-free so it unit-tests directly.
//
// Both inputs are scoped reads that carry their own chain — the municipalities
// come with their ancestors, the clubs with their location and its parent — so
// nothing here needs the whole locations table to resolve a region name or to
// walk a site up to its municipality.

/**
 * /schools is Finland-only, and this is the country whose municipality rows it
 * lists. Scoping now happens in the query rather than in a filter here, so the
 * page never reads a row it will not show.
 */
export const SCHOOLS_COUNTRY_CODE = "FI";

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
 * Build the full sorted list of Finnish municipalities, each flagged with
 * whether a visible club is available there.
 *
 * @param municipalities  Finland's municipality rows, each with its ancestor
 *                        chain (nearest first, so `ancestors[0]` is the region)
 * @param clubLocations   the embedded location of each visible municipality
 *                        club (null entries are ignored)
 */
export function buildMunicipalityEntries(
  municipalities: LocationWithChain[],
  clubLocations: (EmbeddedLocation | null)[],
  locale: string,
): MunicipalityEntry[] {
  const activeMunicipalityIds = new Set<string>();
  for (const location of clubLocations) {
    const municipality = municipalityOf(location);
    if (municipality) activeMunicipalityIds.add(municipality.id);
  }

  return municipalities
    .map((m) => {
      // `.at()` rather than `[0]`: a municipality whose parent row is missing
      // really has an empty chain, and index access would type that away.
      const region = m.ancestors.at(0);
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
