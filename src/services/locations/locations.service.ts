import type {
  Location,
  LocationInsert,
  LocationType,
  AppSupabaseClient,
} from "@/types";
import { walkPages, type PageFetcher } from "@/lib/supabase/paging";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import {
  LOCATION_COLUMNS,
  LOCATION_SEARCH_LIMIT,
  LOCATION_SEARCH_MIN_QUERY,
  locationRow,
  locationSearchResult,
} from "./locations.contracts";
import type { z } from "zod";

/**
 * How many keys go into one `in.(…)` filter. Two things bound it: a URL long
 * enough to be refused by a proxy, and `max_rows` — a chunk can return at most
 * one row per key, so keeping the chunk well under the cap is what lets the
 * key-set lookups below skip the paged walk entirely rather than reimplementing
 * it. 100 keys is ~4 KB of query string.
 */
const KEY_LOOKUP_CHUNK_SIZE = 100;

/**
 * One page of a list read, for a caller that wants a screenful rather than
 * everything.
 *
 * The sibling of `walkPages` (`src/lib/supabase/paging.ts`), and it exists for
 * the opposite reason: the walk
 * is for reads whose *whole* result a surface needs (one country's
 * municipalities to group, one municipality's venues to list), and this is for
 * browsing, where the payload has to stay proportional to what is on screen no matter how
 * many children a node has. Both share the same two disciplines — `count:
 * "exact"` so the caller learns the true size, and a total order on the query so
 * a page boundary cannot duplicate or drop a row.
 */
export interface LocationsPage<Row> {
  rows: Row[];
  /** How many rows the filter matches in total, across every page. */
  total: number;
  /** Whether another page exists after this one. */
  hasMore: boolean;
}

/** How many children one browse request returns. */
export const LOCATION_BROWSE_PAGE_SIZE = 200;

async function readPage<Row>(
  page: number,
  pageSize: number,
  fetchPage: PageFetcher<Row>,
): Promise<LocationsPage<Row>> {
  const from = page * pageSize;
  const { data, error, count } = await fetchPage(from, from + pageSize - 1);
  if (error) throw error;

  // `count` is only absent if the caller forgot `count: "exact"`; falling back
  // to what arrived keeps the shape total rather than making the type lie.
  const total = count ?? from + data.length;
  return { rows: data, total, hasMore: from + data.length < total };
}

/** Split a key list into `in.(…)`-sized batches, preserving order. */
function chunkKeys(keys: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += KEY_LOOKUP_CHUNK_SIZE) {
    chunks.push(keys.slice(i, i + KEY_LOOKUP_CHUNK_SIZE));
  }
  return chunks;
}

/** Deduplicated and sorted, so the same input always produces the same batches. */
function normalizeKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

// ---------------------------------------------------------------------------
// The chain-carrying queries.
//
// `parent:parent_id(...)` (column-name form) embeds the *parent* via the FK on
// parent_id. The `locations!parent_id` form looks like the same thing but
// PostgREST resolves it to the children — rows whose parent_id points back
// here — and returns `[]` for any leaf.
//
// Every select below names its columns. `LOCATION_COLUMNS` (the contract) is
// the whole row minus the generated search fold; `CHAIN_COLUMNS` is narrower
// still, because an ancestor is rendered rather than picked and its timestamps
// answer nothing a breadcrumb or a grouping header asks.
// ---------------------------------------------------------------------------

const CHAIN_COLUMNS = "id, name, name_i18n, type, parent_id, country_code, external_code";

// ---------------------------------------------------------------------------
// Retired rows, and which reads see them.
//
// A refresh never deletes a location — `gedu_locations.location_id` cascades,
// so a DELETE would erase a gedu's coverage claim silently. It stamps
// `retired_at` instead, and the split between reads is the whole point of the
// column:
//
//   * **Reads that OFFER a place** — browsing a level, one country's
//     municipalities for the directory — filter retired rows out. Nobody should
//     be able to newly pick a place that no longer exists.
//   * **Keyed reads deliberately do not.** A stored pick must keep resolving:
//     the three-state guard in front of every picker distinguishes "the read
//     has not landed" from "this id resolves to nothing", and a retired row is
//     a *valid* pick, never cleared. Filtering it here would turn a live
//     reference into a silently wiped one.
//   * **The venue list is not filtered either**, and does not need to be:
//     nothing retires a `site`. Sites are ours, created by an admin and absent
//     from every upstream source, so no refresh path can reach them.
//
// No read selects `retired_at`, `geonames_id` or `depth` — no surface renders
// any of them, and the column list is the contract's.
// ---------------------------------------------------------------------------

/**
 * Four ancestor levels, the deepest chain any supported country has: a French
 * site sits under commune → département → région → France, and a Finnish one
 * under kunta → maakunta → Suomi (so its fourth level comes back null, since a
 * country row has no parent).
 *
 * The keyed read uses it, because a key set is whatever a caller stored and a
 * stored pick can be a site — so it has to ask for the depth of the deepest
 * row it might be handed rather than the depth of a level it chose.
 *
 * Spelled out rather than generated, because the depth has to be visible in the
 * *type* of the select string: the client infers the response shape from the
 * literal, and a runtime-built string collapses it to `string` and takes the
 * whole row type with it.
 */
const SITE_CHAIN_EMBED =
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS}))))`;

/**
 * One level shallower, because a municipality *is* the level below a site: a
 * French commune sits under département → région → France, a Finnish kunta
 * under maakunta → Suomi. Each embedded level is an indexed lookup per row, and
 * this query runs over some 34,900 rows for France — so it asks for the depth it
 * needs and no more.
 */
const MUNICIPALITY_CHAIN_EMBED =
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS})))`;

function buildMunicipalitiesQuery(
  supabase: AppSupabaseClient,
  countryCode: string,
) {
  return supabase
    .from("locations")
    .select(`${LOCATION_COLUMNS}, ${MUNICIPALITY_CHAIN_EMBED}`, {
      count: "exact",
    })
    .eq("country_code", countryCode)
    .eq("type", "municipality")
    .is("retired_at", null)
    .order("name")
    .order("id");
}

/** One ancestor, carrying the columns a breadcrumb or a grouping header needs. */
export interface LocationChainNode {
  id: string;
  name: string;
  name_i18n: Location["name_i18n"];
  type: LocationType;
  parent_id: string | null;
  country_code: string | null;
  external_code: string | null;
}

/**
 * The raw embed, as a nest of optional parents.
 *
 * Written out rather than taken from `QueryData` because the inference is
 * wrong here in the direction that hurts: it types the *nested* `parent` embeds
 * as non-nullable, even though `locations.parent_id` is nullable and a country
 * row really does come back with `parent: null`. A consumer trusting that would
 * skip the check and read a property off null. This declaration only widens —
 * so the `walkPages<RawSiteRow>` call below still fails to compile if the
 * select string stops producing these columns, which is the protection the
 * inferred type was there for.
 */
interface EmbeddedAncestor extends LocationChainNode {
  parent?: EmbeddedAncestor | null;
}

interface RawChainRow extends Location {
  parent?: EmbeddedAncestor | null;
}

/**
 * A row with its ancestor chain flattened to an array, **nearest first**:
 * `ancestors[0]` is the level immediately above it whatever the country, which
 * France's extra `district` level would otherwise make position-dependent.
 * Reverse it for a root-first breadcrumb.
 *
 * A site's chain starts at its municipality; a municipality's at its
 * département (France) or region (Finland).
 */
export interface LocationWithChain extends Location {
  ancestors: LocationChainNode[];
}

function flattenChain(row: RawChainRow): LocationWithChain {
  const { parent, ...self } = row;
  const ancestors: LocationChainNode[] = [];
  let node = parent;
  while (node) {
    const { parent: next, ...ancestor } = node;
    ancestors.push(ancestor);
    node = next;
  }
  return { ...self, ancestors };
}

export class LocationsService {
  constructor(private supabase: AppSupabaseClient) {}

  async getLocation(id: string): Promise<Location> {
    const { data, error } = await this.supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Every municipality of one country, each carrying its ancestor chain.
   * Drives the `/schools` list, Finland-only today (308 rows) — but the same
   * call for France is some 34,900, so this is a paged walk, not a select. The
   * chain is what lets the surface show (and group by) the region without a
   * second read.
   */
  async getMunicipalitiesByCountry(
    countryCode: string,
  ): Promise<LocationWithChain[]> {
    const rows = await walkPages<RawChainRow>(
      "getMunicipalitiesByCountry",
      (from, to) =>
        buildMunicipalitiesQuery(this.supabase, countryCode).range(from, to),
    );
    return rows.map(flattenChain);
  }

  /**
   * The children of one node, or the countries when `parentId` is null.
   *
   * This is the whole of browsing. A country is simply depth 0 of the tree —
   * the rows with no parent — so opening the picker and opening a région are
   * the same request against the same index, and no surface has to know which
   * country a user is heading for before they start.
   *
   * Paged rather than walked: a French département has hundreds of communes and
   * a future country could have thousands, and the payload has to stay
   * proportional to the screen rather than to the node.
   */
  async getChildren(
    parentId: string | null,
    options?: { page?: number },
  ): Promise<LocationsPage<Location>> {
    const page = options?.page ?? 0;
    return readPage(page, LOCATION_BROWSE_PAGE_SIZE, (from, to) => {
      const base = this.supabase
        .from("locations")
        .select(LOCATION_COLUMNS, { count: "exact" });
      // `.is(column, null)` and `.eq(column, value)` are different filters, not
      // one with a nullable argument: `eq` against null matches nothing.
      const scoped =
        parentId === null
          ? base.is("parent_id", null)
          : base.eq("parent_id", parentId);
      return scoped
        .is("retired_at", null)
        .order("name")
        .order("id")
        .range(from, to);
    });
  }

  /**
   * Cross-country search, ranked and capped by the database.
   *
   * Goes through the API route rather than the injected client — the one read
   * in this service that does. It is the only location read a signed-out
   * visitor makes on every keystroke, so it is the only one where a shared
   * cache in front of the database is worth a route: the route bounds the
   * needle and the page size before anything reaches Postgres, and identical
   * queries from different visitors are answered without a round trip. The
   * injected client is deliberately unused here, as it is by the write methods.
   *
   * `country` is answered by the database rather than by the caller filtering
   * what comes back. Filtering in the browser loses twice over: the server
   * ranks and caps the page *before* a client-side filter can run, so a needle
   * matching many rows elsewhere pushes every wanted row off the page, and the
   * "showing N of M" total counts matches the picker would never offer. It
   * rides in the URL, so a restricted and an unrestricted search are different
   * cache entries at every layer.
   */
  async searchLocations(
    query: string,
    options?: {
      types?: readonly LocationType[];
      limit?: number;
      country?: string;
    },
  ): Promise<z.infer<typeof locationSearchResult>> {
    const needle = query.trim();
    // The same floor the database enforces, applied before a request exists at
    // all. A caller under it is not an error, it is a search that has not
    // started — so it answers like one.
    if (needle.length < LOCATION_SEARCH_MIN_QUERY) {
      return { total: 0, results: [] };
    }

    const params = new URLSearchParams({ q: needle });
    if (options?.types?.length) params.set("types", options.types.join(","));
    params.set("limit", String(options?.limit ?? LOCATION_SEARCH_LIMIT));
    if (options?.country) params.set("country", options.country);

    const response = await fetch(`/api/locations/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to search locations"),
      );
    }
    return parseJsonResponse(response, locationSearchResult);
  }

  /**
   * The sites under one municipality — the venues an admin sees once they have
   * drilled the tree down to a place.
   */
  async getSitesByParent(parentId: string): Promise<Location[]> {
    return walkPages("getSitesByParent", (from, to) =>
      this.supabase
        .from("locations")
        .select(LOCATION_COLUMNS, { count: "exact" })
        .eq("type", "site")
        .eq("parent_id", parentId)
        .order("name")
        .order("id")
        .range(from, to),
    );
  }

  /**
   * Fetch specific rows by id, each with its ancestor chain — a stored
   * selection's display name and path, a gedu's saved coverage.
   *
   * The chain rides along because every surface that holds ids holds them to
   * render them, and a name with no path is ambiguous the moment two countries
   * are in play: France has several communes called Saint-Martin, and Finland
   * and France both have a Nord-adjacent everything.
   *
   * Batched rather than paged: each request asks for at most
   * `KEY_LOOKUP_CHUNK_SIZE` keys and so can receive at most that many rows,
   * which is comfortably under `max_rows`. Missing ids are simply absent from
   * the result; this is a lookup, not an assertion.
   */
  async getLocationsByIds(
    ids: readonly string[],
  ): Promise<LocationWithChain[]> {
    const wanted = normalizeKeys(ids);
    if (wanted.length === 0) return [];

    const rows: RawChainRow[] = [];
    for (const batch of chunkKeys(wanted)) {
      const { data, error } = await this.supabase
        .from("locations")
        .select(`${LOCATION_COLUMNS}, ${SITE_CHAIN_EMBED}`)
        .in("id", batch)
        .order("name")
        .order("id");

      if (error) throw error;
      rows.push(...data);
    }
    return rows.map(flattenChain);
  }

  // `locations` writes go through the admin API. `authenticated` holds INSERT
  // and UPDATE on the table (migration 00123) and the admin_manage_locations
  // policy decides who may use them — the route re-checks the role and then
  // writes on the caller's own server-side client, so the route's answer and
  // the database's have to agree. The injected `supabase` client is unused by
  // these methods, kept for symmetry with the read methods.
  async createLocation(location: LocationInsert): Promise<Location> {
    const response = await fetch("/api/admin/locations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(location),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to create location")
      );
    }
    return parseJsonResponse(response, locationRow);
  }

  async updateLocation(
    id: string,
    updates: Pick<Location, "name">
  ): Promise<Location> {
    const response = await fetch(
      `/api/admin/locations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to update location")
      );
    }
    return parseJsonResponse(response, locationRow);
  }
}
