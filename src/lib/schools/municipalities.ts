import { municipalitySlug } from "@/lib/locations/municipality-slug";
import {
  municipalityOf,
  type EmbeddedLocation,
  type EmbeddedLocationNode,
} from "@/lib/locations/embedded-chain";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";
import type { Json, LocationType } from "@/types";

// Pure logic behind the public /schools pages: turn the municipalities that
// actually run clubs into a sorted list of rows a parent can browse or search.
// Kept React/Supabase-free so it unit-tests directly.
//
// Both routes start from the clubs and derive the geography from what those
// clubs point at, so every read either page makes is bounded by the club count
// rather than by the size of a country. Which shape feeds the entry builder
// differs, and that is the whole difference between the two pages:
//
//   * `/schools/<slug>` feeds it the municipality node off each club's own
//     product embed — no locations read at all, because the page renders a name
//     and matches a slug and never mentions the region.
//   * `/schools` feeds it the keyed read's rows-with-chains, because its region
//     grouping is only reachable through the ancestor chain (an in-person club's
//     embed stops at the municipality).

/**
 * /schools is Finland-only. The club-bearing municipality ids are read by key,
 * and a keyed read is deliberately unfiltered, so this is what the /schools
 * list narrows its rows to in memory — the keyed read returns `country_code`
 * and `type`, so no forbidden column is involved.
 */
export const SCHOOLS_COUNTRY_CODE = "FI";

/**
 * The minimum a municipality has to carry to become an entry.
 *
 * Two callers feed it deliberately different shapes: a row from the keyed
 * locations read (which carries its ancestor chain, so the region resolves) and
 * a municipality node lifted straight off a product's location embed (which
 * carries no chain and needs none). An entry built from an embed therefore has
 * no region — that is correct rather than missing, because the only surface
 * that builds entries that way is the one that never renders a region.
 */
export interface MunicipalitySource {
  id: string;
  name: string;
  name_i18n: Json | null;
  /** Ancestor chain, nearest first — `ancestors[0]` is the region. */
  ancestors?: readonly MunicipalityAncestor[];
}

/**
 * The minimum an ancestor has to carry to become a region header: enough to
 * tell a region from a country and to render its name in the viewer's locale.
 *
 * Deliberately narrower than the chain node the keyed read returns, because a
 * search hit's chain is narrower still — the search RPC carries only what a
 * path needs — and both have to feed this builder.
 */
export interface MunicipalityAncestor {
  id: string;
  name: string;
  name_i18n: Json | null;
  type: LocationType;
}

/** One municipality row for the /schools list. */
export interface MunicipalityEntry {
  id: string;
  /** Display name in the viewer's locale (Swedish name for `sv`, else `name`). */
  name: string;
  /**
   * URL slug for the `/schools/<slug>` page, derived from the viewer-locale
   * display name — a Swedish viewer links to `helsingfors`, a Finnish viewer to
   * `helsinki`. Both resolve to the same row via `findMunicipalityBySlug`,
   * which accepts the canonical and every alternate slug.
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
}

/** Municipalities grouped under their region, for the default browse view. */
export interface RegionGroup {
  regionId: string | null;
  regionName: string | null;
  municipalities: MunicipalityEntry[];
}

/**
 * The distinct municipalities a set of clubs sits in, each as the node the
 * club's own embed carried, in first-seen order.
 *
 * Membership is *resolved* rather than compared: a municipality club's location
 * is the municipality row itself when online and a site inside it when
 * in-person, so stepping up to the nearest municipality is what puts both
 * shapes in the same bucket. A club that resolves to no municipality (legacy
 * data anchored at a region or a country) contributes nothing — availability is
 * municipality-exact, with no cascade.
 *
 * Typed structurally, so any row carrying its location embed works.
 */
export function municipalitiesOfClubs<
  T extends { locations: EmbeddedLocation | null },
>(clubs: readonly T[]): EmbeddedLocationNode[] {
  const byId = new Map<string, EmbeddedLocationNode>();
  for (const club of clubs) {
    const municipality = municipalityOf(club.locations);
    if (municipality && !byId.has(municipality.id)) {
      byId.set(municipality.id, municipality);
    }
  }
  return [...byId.values()];
}

/**
 * Build the sorted list of municipality entries.
 *
 * Every municipality handed in is one a club resolved to, so there is no
 * "available here?" flag to carry — the list *is* the club-bearing set.
 *
 * @param municipalities  the club-bearing municipalities, either as rows with
 *                        their ancestor chain (nearest first) or as embedded
 *                        location nodes with no chain
 */
export function buildMunicipalityEntries(
  municipalities: readonly MunicipalitySource[],
  locale: string,
): MunicipalityEntry[] {
  return municipalities
    .map((m) => buildMunicipalityEntry(m, locale))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * One municipality as a row, with no ordering imposed.
 *
 * The list above is sorted by name because it is browsed. A caller that already
 * holds an order it must not lose — the search index's ranking, which puts an
 * exact match above a prefix above an infix — builds its rows one at a time
 * through here instead, so the slug and search-slug derivation still happens in
 * exactly one place.
 */
export function buildMunicipalityEntry(
  municipality: MunicipalitySource,
  locale: string,
): MunicipalityEntry {
  // `.at()` rather than `[0]`: a municipality whose parent row is missing
  // really has an empty chain, and index access would type that away.
  const region = municipality.ancestors?.at(0);
  const isRegion = region?.type === "region";
  const displayName = localizedLocationName(municipality, locale);
  return {
    id: municipality.id,
    name: displayName,
    slug: municipalitySlug(displayName),
    searchSlugs: [
      municipalitySlug(municipality.name),
      ...localizedNameAlternates(municipality).map(municipalitySlug),
    ],
    regionId: isRegion ? region.id : null,
    regionName: isRegion ? localizedLocationName(region, locale) : null,
  };
}

/**
 * The clubs that belong to one municipality, by *resolved* membership — the same
 * rule that decides which municipalities are listed at all.
 *
 * A municipality club always carries a location, in one of two shapes: the
 * municipality row itself (online) or a site inside it (in-person). Comparing a
 * club's `location_id` against the municipality id therefore answers a
 * different, narrower question — it matches only the online half and silently
 * drops every in-person club. Resolving each club's own location up to its
 * municipality is what puts both shapes in the same bucket.
 *
 * Delivery mode is a separate axis and is deliberately not touched here: a
 * municipality page shows both modes and lets the viewer filter by format.
 *
 * Typed structurally (any row carrying its embedded location works) so the
 * server prefetch and the client refetch can both hand over their product rows
 * without this module knowing the product query's shape.
 */
export function selectClubsInMunicipality<
  T extends { locations: EmbeddedLocation | null },
>(clubs: readonly T[], municipalityId: string): T[] {
  return clubs.filter((c) => municipalityOf(c.locations)?.id === municipalityId);
}

/**
 * Resolve a `/schools/<slug>` URL slug back to its municipality entry. Accepts
 * the canonical slug *and* every alternate-locale slug, so both `helsinki` and
 * `helsingfors` land on the same row regardless of the viewer's locale — the
 * URL rests on whatever was linked/bookmarked, and switching locale never
 * rewrites it. Returns `undefined` for an unknown slug (the page 404s on that).
 *
 * The entries are the club-bearing municipalities and nothing else, so a slug
 * naming a real municipality that runs no clubs misses here exactly as a
 * nonsense slug does — which is the 404 that page has always served.
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
 * view.
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
