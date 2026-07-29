import type {
  Location,
  LocationInsert,
  LocationType,
  AppSupabaseClient,
} from "@/types";
import type { PostgrestResponse } from "@supabase/supabase-js";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { locationRow } from "./locations.contracts";

/**
 * PostgREST caps every response at its `max_rows` setting (1000 on this
 * project) and enforces it by returning a *short page*, not an error — so an
 * unbounded select is indistinguishable from a complete one and truncates
 * silently. `locations` is fully seeded from the official classifications
 * (France alone is 34,875 communes), so any list read that isn't bounded by
 * construction is over the cap already. Keep this in step with the server
 * setting: a value larger than `max_rows` makes every page look short and the
 * walk stops at the cap again; a smaller one just costs extra round-trips.
 */
const LOCATIONS_PAGE_SIZE = 1000;

/**
 * Refuses to page forever if the server ever stops honouring the range (which
 * would return a full page every time). 100 pages is ~100k rows — three times
 * the whole of France.
 */
const LOCATIONS_MAX_PAGES = 100;

/**
 * How many keys go into one `in.(…)` filter. Two things bound it: a URL long
 * enough to be refused by a proxy, and `max_rows` — a chunk can return at most
 * one row per key, so keeping the chunk well under the cap is what lets the
 * key-set lookups below skip the paged walk entirely rather than reimplementing
 * it. 100 keys is ~4 KB of query string.
 */
const KEY_LOOKUP_CHUNK_SIZE = 100;

/**
 * One page request. The caller builds a **fresh** query each time rather than
 * re-ranging one builder: a PostgREST builder carries mutable URL state, and
 * reusing it across pages is the kind of thing that works until someone adds a
 * filter in between.
 */
type PageFetcher<Row> = (
  from: number,
  to: number,
) => PromiseLike<PostgrestResponse<Row>>;

/**
 * Walk a list query page by page until a page comes back short.
 *
 * Shared by every unbounded read in this service. The `count: "exact"` the
 * caller's query must ask for is what makes "short page ⇒ done" safe: `max_rows`
 * is a dashboard setting nothing in this repo controls, and if it ever drops
 * below `LOCATIONS_PAGE_SIZE` then *every* page is short and a naive walk
 * returns a silently truncated list. Comparing what we collected against the
 * server-reported total turns that into a thrown error.
 *
 * The caller's query must also impose a **total** order or rows shift between
 * requests and the walk both duplicates and drops them. `name` alone is not one:
 * every French DROM has a région and a département of the same name, and
 * homonymous communes are common — hence `name` then `id` everywhere below.
 */
async function walkPages<Row>(
  label: string,
  fetchPage: PageFetcher<Row>,
): Promise<Row[]> {
  const all: Row[] = [];
  let expected: number | null = null;

  for (let page = 0; page < LOCATIONS_MAX_PAGES; page++) {
    const from = page * LOCATIONS_PAGE_SIZE;
    const { data, error, count } = await fetchPage(
      from,
      from + LOCATIONS_PAGE_SIZE - 1,
    );

    if (error) throw error;
    all.push(...data);
    expected = count ?? expected;

    // A short page is PostgREST saying there is nothing after it.
    if (data.length < LOCATIONS_PAGE_SIZE) {
      if (expected !== null && all.length < expected) {
        throw new Error(
          `${label}: walk ended with ${all.length} of ${expected} rows — the server is returning pages shorter than LOCATIONS_PAGE_SIZE (max_rows lowered below ${LOCATIONS_PAGE_SIZE}?)`,
        );
      }
      return all;
    }
  }

  throw new Error(
    `${label}: still receiving full pages after ${LOCATIONS_MAX_PAGES} requests — the range filter is not being applied`,
  );
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

/**
 * Identifies one row by the pair the shipped catalogs are keyed on. A catalog
 * entry carries a code and its level, and `(country_code, type, external_code)`
 * is the unique key on the table, so the two line up exactly — which is what
 * lets a UI that ticks catalog entries resolve them to ids without ever having
 * seen a row.
 */
export interface LocationCodeRef {
  type: LocationType;
  external_code: string;
}

// ---------------------------------------------------------------------------
// The chain-carrying queries.
//
// `parent:parent_id(...)` (column-name form) embeds the *parent* via the FK on
// parent_id. The `locations!parent_id` form looks like the same thing but
// PostgREST resolves it to the children — rows whose parent_id points back
// here — and returns `[]` for any leaf.
// ---------------------------------------------------------------------------

const CHAIN_COLUMNS = "id, name, name_i18n, type, parent_id, country_code, external_code";

/**
 * Four ancestor levels, the deepest chain any supported country has: a French
 * site sits under commune → département → région → France, and a Finnish one
 * under kunta → maakunta → Suomi (so its fourth level comes back null, since a
 * country row has no parent).
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
 * this query runs over 34,875 rows for France — so it asks for the depth it
 * needs and no more.
 */
const MUNICIPALITY_CHAIN_EMBED =
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS}, ` +
  `parent:parent_id(${CHAIN_COLUMNS})))`;

function buildSitesQuery(supabase: AppSupabaseClient) {
  return supabase
    .from("locations")
    .select(`*, ${SITE_CHAIN_EMBED}`, { count: "exact" })
    .eq("type", "site")
    .order("name")
    .order("id");
}

function buildMunicipalitiesQuery(
  supabase: AppSupabaseClient,
  countryCode: string,
) {
  return supabase
    .from("locations")
    .select(`*, ${MUNICIPALITY_CHAIN_EMBED}`, { count: "exact" })
    .eq("country_code", countryCode)
    .eq("type", "municipality")
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
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Every municipality of one country, each carrying its ancestor chain.
   * Drives the `/schools` list and the online municipality-club picker, both
   * Finland-only today (308 rows) — but the same call for France is 34,875, so
   * this is a paged walk, not a select. The chain is what lets both surfaces
   * show (and group by) the region without a second read.
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

  /** Every site, each carrying its ancestor chain. */
  async getSites(): Promise<LocationWithChain[]> {
    const rows = await walkPages<RawChainRow>("getSites", (from, to) =>
      buildSitesQuery(this.supabase).range(from, to),
    );
    return rows.map(flattenChain);
  }

  /**
   * The sites under one municipality — what an admin sees after drilling the
   * catalog down to a commune and resolving it to a row.
   */
  async getSitesByParent(parentId: string): Promise<Location[]> {
    return walkPages("getSitesByParent", (from, to) =>
      this.supabase
        .from("locations")
        .select("*", { count: "exact" })
        .eq("type", "site")
        .eq("parent_id", parentId)
        .order("name")
        .order("id")
        .range(from, to),
    );
  }

  /**
   * Fetch specific rows by id — coverage chips, a saved product's location,
   * anything holding ids rather than codes.
   *
   * Batched rather than paged: each request asks for at most
   * `KEY_LOOKUP_CHUNK_SIZE` keys and so can receive at most that many rows,
   * which is comfortably under `max_rows`. Missing ids are simply absent from
   * the result; this is a lookup, not an assertion.
   */
  async getLocationsByIds(ids: readonly string[]): Promise<Location[]> {
    const wanted = normalizeKeys(ids);
    if (wanted.length === 0) return [];

    const rows: Location[] = [];
    for (const batch of chunkKeys(wanted)) {
      const { data, error } = await this.supabase
        .from("locations")
        .select("*")
        .in("id", batch)
        .order("name")
        .order("id");

      if (error) throw error;
      rows.push(...data);
    }
    return rows;
  }

  /**
   * Resolve catalog entries — `(type, official code)` pairs — to the rows they
   * name, so a UI that only ever handled catalog codes can write foreign keys.
   *
   * One request per distinct `type`, because the table's key is the triple
   * `(country_code, type, external_code)` and France reuses each of its 18
   * région codes as a département code: a code-only lookup would be ambiguous
   * by construction. Codes go through `.in()` rather than a hand-built `or()`
   * string — the query builder quotes them, an interpolated filter would not.
   *
   * Same batching as `getLocationsByIds`, and the same non-assertion: a code
   * with no row is absent from the result rather than an error, so the caller
   * decides whether that is a stale tick or a bug.
   */
  async resolveLocationsByCodes(
    countryCode: string,
    refs: readonly LocationCodeRef[],
  ): Promise<Location[]> {
    const byType = new Map<LocationType, string[]>();
    for (const { type, external_code } of refs) {
      byType.set(type, [...(byType.get(type) ?? []), external_code]);
    }

    const rows: Location[] = [];
    // Sorted so the request sequence depends only on the input set, not on the
    // order the caller happened to build it in.
    for (const type of [...byType.keys()].sort()) {
      for (const batch of chunkKeys(normalizeKeys(byType.get(type) ?? []))) {
        const { data, error } = await this.supabase
          .from("locations")
          .select("*")
          .eq("country_code", countryCode)
          .eq("type", type)
          .in("external_code", batch)
          .order("name")
          .order("id");

        if (error) throw error;
        rows.push(...data);
      }
    }
    return rows;
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
