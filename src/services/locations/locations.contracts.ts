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

/**
 * What an admin may say when creating a location — in practice always a `site`.
 *
 * `country_code` is deliberately absent, and its absence is the contract: zod
 * strips unknown keys, so a client that sends one is ignored rather than
 * refused. The route derives it from the confirmed parent row instead. It is
 * denormalized onto every row purely so country filtering needs no recursion,
 * which makes "the parent's code" the only value that can be right — a
 * client-supplied one is a second source of truth for a field that has exactly
 * one.
 */
export const createLocationBody = z.object({
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(Constants.public.Enums.location_type),
  // `.uuid()` rather than a bare string: this id is read back as a `uuid` on
  // the way to deriving the country code, and Postgres refuses a malformed one
  // with a cast error rather than "no such row". Without the check that error
  // surfaces as a 500 on what is plainly a bad request.
  parent_id: z.string().uuid().nullable(),
});

/**
 * What `createLocation` takes — the parsed body, not the table's Insert type.
 *
 * The route strips everything else (`country_code` is derived from the parent;
 * zod drops unknown keys), so typing the caller against the generated Insert
 * would let it pass fields the write is guaranteed to discard, and read as
 * though they meant something. This makes the discarded fields
 * unrepresentable, which is what the contract already says in prose.
 */
export type CreateLocationBody = z.infer<typeof createLocationBody>;

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
});

/**
 * The columns every read of `locations` names, matching `locationRow` above.
 *
 * Spelled out rather than `*` because `*` drags the generated `search_blob`
 * fold along: it is the longest value on a row, a browse page is 200 rows, and
 * nothing outside the database ever reads it — the index does. It used to ride
 * the wire for exactly that reason, which is also the only reason it was ever
 * in the contract.
 *
 * A literal, not a join of `locationRow`'s keys. The Supabase client infers a
 * response's shape from the *type* of the select string, and any string built
 * at runtime widens to `string` and takes the whole row type down with it.
 * Keeping the two in step is therefore a manual job — but a drifted list fails
 * loudly, at the `parseJsonResponse` call and at the row types in the service,
 * rather than silently.
 */
export const LOCATION_COLUMNS =
  "id, name, name_i18n, type, parent_id, country_code, external_code, created_at, updated_at";

/**
 * The columns the postal lookup names.
 *
 * `location_id` is the whole answer: the caller already supplied the country
 * and the code, so reading those back would be echoing the filter. The row is
 * then resolved through the existing keyed read, which is what gives it a name
 * and an ancestor chain.
 *
 * The embed beside it carries no answer at all — it is how the retired filter
 * is expressed. A postal code is a way of *offering* a municipality, so a
 * municipality a refresh retired must not come back from one; but `retired_at`
 * is the database's business and no application row may select it. An inner
 * join over the relation puts the filter on the server (`locations.retired_at
 * is null`) while the only column that crosses the wire is the joined row's id,
 * which the caller is about to look up anyway.
 *
 * A literal for the same reason `LOCATION_COLUMNS` is one — the Supabase client
 * infers the response shape from the *type* of the select string, and a string
 * built at runtime widens to `string` and takes the row type with it.
 */
export const POSTAL_CODE_COLUMNS = "location_id, locations!inner(id)";

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * How short a needle may be before search runs at all. Enforced twice on
 * purpose: the client stops sending, and the database stops answering, so a
 * caller that skips the UI still cannot ask the table to scan for one letter.
 */
export const LOCATION_SEARCH_MIN_QUERY = 2;

/**
 * How long a needle may be before the route refuses it outright.
 *
 * A place name is nowhere near this long, so the ceiling is not a validation
 * rule anybody types into — it is what stops a pasted document from becoming a
 * cache key and a trigram probe. Exported because a search box has to carry it
 * as its own `maxLength`: without it a paste sails past the schema and the
 * request comes back 400, which is a dead results area rather than the "no
 * matches" the page would otherwise show.
 */
export const LOCATION_SEARCH_MAX_QUERY = 120;

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
 *
 * `country` restricts matches to one ISO 3166-1 alpha-2 code, server-side. It
 * is pinned to the canonical uppercase form rather than normalized, for the
 * same reason `types` is one parameter: this route is cached by URL, and
 * accepting `fi` alongside `FI` would spend two cache entries on one question.
 * The only caller that sends it holds a constant.
 */
export const searchLocationsQuery = z.object({
  q: z.string().min(LOCATION_SEARCH_MIN_QUERY).max(LOCATION_SEARCH_MAX_QUERY),
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
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
});
