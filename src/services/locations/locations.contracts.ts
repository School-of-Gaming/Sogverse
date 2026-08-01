import { z } from "zod";
import { Constants } from "@/types";

/**
 * Request/response contracts for the locations API — the admin write routes and
 * the public search route — plus the result shape of the search RPC.
 *
 * Both ends import from here: a route parses its request body (or query) with
 * the schema, the service parses the response with the row schema. The compiler
 * keeps the schemas honest at the use sites — the route inserts the parsed body
 * into `locations` (checked against the generated Insert type) and the service
 * returns `Location` (checked against the generated Row type).
 */

export const createLocationBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable().default(null),
});

export const updateLocationBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export const locationRow = z.object({
  id: z.string(),
  name: z.string(),
  // locale -> display-name overrides, e.g. { sv: "Helsingfors" }. Null/absent
  // for the rows (most municipalities, every site) that have no alternate name.
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable(),
  // The official statistical code (INSEE / Tilastokeskus) on a seeded row;
  // null on the admin-created sites this API creates, which exist in no
  // national classification.
  external_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  // Derived, never written: the folded search terms the database maintains for
  // this row. It is here only because the row type includes it — a route that
  // selects the row selects this too. Nothing reads it outside the database.
  search_blob: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * How short a needle may be before search runs at all. Enforced twice on
 * purpose: the client stops sending, and the database stops answering, so a
 * caller that skips the UI still cannot ask the table to scan for one letter.
 */
export const LOCATION_SEARCH_MIN_QUERY = 2;

/** How many hits one search renders. The true match count comes back regardless. */
export const LOCATION_SEARCH_LIMIT = 20;

/** The server's own ceiling, mirrored here so a caller cannot ask for more. */
export const LOCATION_SEARCH_MAX_LIMIT = 50;

/** One node of an ancestor chain — enough to render a path, and nothing else. */
export const locationChainNode = z.object({
  id: z.string(),
  name: z.string(),
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
  // Not carried on a chain node: an ancestor is rendered, never picked, and the
  // country is the last link of every chain anyway.
});

/** One search hit: the row's identifying columns plus its chain, nearest first. */
export const locationSearchHit = z.object({
  id: z.string(),
  name: z.string(),
  name_i18n: z.record(z.string(), z.string()).nullable(),
  type: z.enum(Constants.public.Enums.location_type),
  parent_id: z.string().nullable(),
  country_code: z.string().nullable(),
  external_code: z.string().nullable(),
  ancestors: z.array(locationChainNode),
});

/**
 * The `search_locations` RPC's whole answer. `total` counts every match, not
 * only the ones in `results` — the panel says "showing N of M" off that gap, and
 * it is the difference between a capped list and a truncated one.
 */
export const locationSearchResult = z.object({
  total: z.number().int().nonnegative(),
  results: z.array(locationSearchHit),
});

/**
 * The public search route's query string. `types` arrives as a comma-separated
 * list because a repeated query parameter would produce a different URL for the
 * same request, and this route is meant to be cached by URL.
 */
export const searchLocationsQuery = z.object({
  q: z.string().min(LOCATION_SEARCH_MIN_QUERY).max(120),
  types: z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.enum(Constants.public.Enums.location_type)).min(1))
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LOCATION_SEARCH_MAX_LIMIT)
    .optional(),
});
