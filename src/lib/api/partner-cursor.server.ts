import { createHash } from "crypto";
import type { z } from "zod";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";

/**
 * Cursor paging for the partner API: the cursor codec, and the one page reader
 * every record-returning resource goes through.
 *
 * **Keyset, never offset.** A partner pull walks a whole resource page by page
 * while families keep signing up, and an offset shifts under a concurrent
 * insert — one record read twice, another never. The general paging rules
 * (`src/lib/supabase/CLAUDE.md`) accept that race for idempotent screens the
 * query cache refetches; a pull that treats a missing record as "no longer in
 * scope" cannot. So a page is "the next `limit` records after this key", in
 * ascending key order, and a record inserted behind the cursor is simply picked
 * up by the next full pull.
 *
 * **The cursor is `base64url(JSON { r, f, k })`, unsigned**: `r` the resource,
 * `f` a fingerprint of the filters it was issued under, `k` the last key the
 * page returned. Unsigned because there is nothing in it to protect — every key
 * is a value the page itself already handed the caller, and forging one only
 * moves where the caller's own authorised read starts. `r` and `f` are what
 * make a cursor mean one thing: replayed against another resource or under
 * different filters it would silently skip or repeat records, so both are
 * refused as `invalid_query` instead. Cursors never expire; a key stays a
 * position in the order however old it is.
 */

/** The record-returning resources — the ones that page. */
export type PartnerPagedResource =
  | "products"
  | "families"
  | "enrolments"
  | "sessions"
  | "feedback"
  | "roblox-research";

/**
 * A keyset key: one column's value, or a tuple of them for a composite order.
 *
 * Strings only, and the order they are compared in is JavaScript's code-unit
 * order. That is the database's order too for every key the partner API uses —
 * a uuid compares as its bytes, which is its lowercase hex; an ISO timestamp as
 * PostgREST emits it (always `+00:00`, trailing fractional zeros trimmed)
 * compares digit by digit — and it is what lets the page reader check the order
 * a fetch returned rather than trust it. A text column under a collation does
 * NOT compare this way and must not be a key.
 */
export type PartnerKey = string | readonly string[];

/** The parsed query of a paged resource: its filters, plus the paging pair. */
export type PagedQuery = Readonly<Record<string, unknown>> & {
  readonly limit: number;
  readonly cursor?: string;
};

// ---------------------------------------------------------------------------
// The codec
// ---------------------------------------------------------------------------

/**
 * A stable fingerprint of the filters a page was read under: every parsed query
 * field except `limit` and `cursor`, with absent ones dropped and names sorted,
 * hashed so a cursor stays short however long a filter value is.
 *
 * `limit` is excluded on purpose — a caller may change page size mid-walk and
 * the position is still meaningful — and `cursor` because it is the thing
 * being fingerprinted. Anything else changing means a different result set, in
 * which the key is not a position at all.
 */
export function filterFingerprint(query: PagedQuery): string {
  const entries = Object.entries(query)
    .filter(
      ([name, value]) =>
        name !== "limit" && name !== "cursor" && value !== undefined,
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("base64url")
    .slice(0, 22);
}

/** Issue the cursor that resumes after `key`. */
export function encodeCursor(
  resource: PartnerPagedResource,
  query: PagedQuery,
  key: PartnerKey,
): string {
  const payload = { r: resource, f: filterFingerprint(query), k: key };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export type CursorDecodeResult<K> =
  | { ok: true; key: K | null }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read `query.cursor` back into the key it resumes after — `null` when the
 * query carries no cursor, which is the first page.
 *
 * Refuses, with a message naming `cursor`, anything that is not a cursor this
 * resource issued under these same filters, and any key that does not match
 * `keySchema` — the schema is the resource's key shape (`z.string().uuid()`, or
 * a tuple for a composite order), so a key that parses is safe to hand to a
 * query builder.
 */
export function decodeCursor<K extends PartnerKey>(
  resource: PartnerPagedResource,
  query: PagedQuery,
  keySchema: z.ZodType<K>,
): CursorDecodeResult<K> {
  if (query.cursor === undefined) return { ok: true, key: null };

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
  } catch {
    return { ok: false, message: "cursor: is not a cursor this API issued" };
  }

  if (!isRecord(payload) || typeof payload.r !== "string" || typeof payload.f !== "string") {
    return { ok: false, message: "cursor: is not a cursor this API issued" };
  }
  if (payload.r !== resource) {
    return {
      ok: false,
      message: `cursor: was issued by /${payload.r}, not /${resource}`,
    };
  }
  if (payload.f !== filterFingerprint(query)) {
    return {
      ok: false,
      message:
        "cursor: was issued under different filters — repeat the filters of the request that returned it",
    };
  }

  const key = keySchema.safeParse(payload.k);
  if (!key.success) {
    return { ok: false, message: "cursor: is not a cursor this API issued" };
  }
  return { ok: true, key: key.data };
}

// ---------------------------------------------------------------------------
// Key order
// ---------------------------------------------------------------------------

/**
 * Compare two keys of the same shape: code-unit order, tuples element by element.
 * See `PartnerKey` for why that is the database's order for the keys in use.
 */
export function compareKeys(a: PartnerKey, b: PartnerKey): number {
  const left = typeof a === "string" ? [a] : a;
  const right = typeof b === "string" ? [b] : b;
  if (left.length !== right.length) {
    throw new Error(
      `compareKeys: a key of ${left.length} part(s) compared with one of ${right.length}`,
    );
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

/**
 * PostgREST's value quoting inside a logic tree: double quotes around the value,
 * backslash before any quote or backslash in it. Quoting is unconditional because
 * a timestamp carries `:` and `.`, both reserved inside `or=(…)`.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/**
 * The PostgREST `or` filter for "strictly after this composite key", for
 * `query.or(keysetAfter(columns, key))`:
 *
 *   (a > k1) OR (a = k1 AND b > k2) OR (a = k1 AND b = k2 AND c > k3)
 *
 * The query must order by the same columns in the same sequence, ascending. A
 * single-column key needs none of this — `query.gt(column, key)` says it.
 */
export function keysetAfter(
  columns: readonly string[],
  key: readonly string[],
): string {
  if (columns.length === 0 || columns.length !== key.length) {
    throw new Error(
      `keysetAfter: ${columns.length} column(s) for a key of ${key.length} part(s)`,
    );
  }
  const arms = columns.map((column, i) => {
    const equal = columns
      .slice(0, i)
      .map((prior, j) => `${prior}.eq.${quoteFilterValue(key[j])}`);
    const greater = `${column}.gt.${quoteFilterValue(key[i])}`;
    return equal.length === 0 ? greater : `and(${[...equal, greater].join(",")})`;
  });
  return arms.join(",");
}

// ---------------------------------------------------------------------------
// The page reader
// ---------------------------------------------------------------------------

/**
 * One fetched batch: a `PostgrestResponse` satisfies it as it stands, so a fetch
 * can return the query builder directly. The count must be the exact number of
 * rows the fetch's filters match after `after` — `select(…, { count: "exact" })`
 * — see `readPartnerPage` for what it guards.
 */
export interface KeysetBatch<Row> {
  data: Row[] | null;
  error: unknown;
  count: number | null;
}

/**
 * Fetch up to `take` rows strictly after `after` (from the start when null), in
 * ascending key order. Build a fresh query per call.
 */
export type KeysetFetch<Row, K extends PartnerKey> = (
  after: K | null,
  take: number,
) => PromiseLike<KeysetBatch<Row>>;

/**
 * The largest batch a fetch is asked for. `max_rows` caps a PostgREST response
 * at 1000 on this project; asking for more would make every batch look short.
 * The exact count still guards the case where the setting is ever lowered.
 */
const MAX_BATCH = 1000;

export interface PartnerPageSpec<Row, Rec, K extends PartnerKey> {
  resource: PartnerPagedResource;
  /** The parsed query: filters, `limit` and `cursor`. */
  query: PagedQuery;
  /** The key's shape, which a decoded cursor must match. */
  key: z.ZodType<K>;
  fetch: KeysetFetch<Row, K>;
  keyOf: (row: Row) => K;
  /**
   * Turn one fetched batch into records: one entry per row, in the same order,
   * `null` for a row that is not a record of this page — a filter the database
   * cannot apply (a derived status), or a row that is not the key of its record
   * (a family is listed at its smallest parent). Async so enrichment can be
   * batched per fetch rather than per row.
   */
  build: (rows: Row[]) => Promise<(Rec | null)[]> | (Rec | null)[];
  /**
   * Rows per fetch, for a walk whose `build` drops many rows. Defaults to
   * `limit + 1`, the fewest that can decide whether a next page exists when
   * nothing is dropped. Clamped to at least `limit + 1` and at most 1000.
   */
  batchSize?: number;
}

/**
 * Read one page of a resource: decode the cursor, walk the key order in batches
 * until `limit + 1` records are in hand or the rows run out, and answer the list
 * envelope — `data` with at most `limit` records, `next_cursor` the key of the
 * last one when a record follows it, else `null`.
 *
 * The `+ 1` is the whole of how "is there a next page" is decided: a cursor is
 * issued only when a record is known to follow, so the last page is never an
 * empty one the partner has to fetch to learn it was the end.
 *
 * Throws `PartnerQueryError` (→ 400 `invalid_query`) for a cursor that does not
 * decode, and a plain error (→ 500 `internal_error`) whenever a fetch cannot be
 * trusted to be complete:
 *
 * - **a batch shorter than asked for whose exact count says more rows match** —
 *   PostgREST truncating to `max_rows` looks exactly like the end of the data,
 *   and a missing record is read by the partner as a deleted one;
 * - **a fetch with no count**, which would disarm that check;
 * - **rows out of key order, or not after the cursor** — a fetch ordering by
 *   something other than its key, or ignoring `after`, repeats and drops records
 *   across pages without any other symptom.
 */
export async function readPartnerPage<Row, Rec, K extends PartnerKey>(
  spec: PartnerPageSpec<Row, Rec, K>,
): Promise<{ data: Rec[]; next_cursor: string | null }> {
  const decoded = decodeCursor(spec.resource, spec.query, spec.key);
  if (!decoded.ok) throw new PartnerQueryError(decoded.message);

  const { limit } = spec.query;
  const take = Math.min(
    MAX_BATCH,
    Math.max(limit + 1, spec.batchSize ?? limit + 1),
  );
  const label = `partner /${spec.resource} page`;

  const records: { rec: Rec; key: K }[] = [];
  let after = decoded.key;

  while (records.length <= limit) {
    const batch = await spec.fetch(after, take);
    if (batch.error) throw batch.error;
    if (batch.data === null) throw new Error(`${label}: a fetch returned no data`);
    if (batch.count === null) {
      throw new Error(
        `${label}: a fetch reported no count — select with { count: "exact" } so a truncated batch cannot pass for the last one`,
      );
    }

    const rows = batch.data;
    if (rows.length > take) {
      throw new Error(`${label}: asked for ${take} rows and received ${rows.length}`);
    }
    if (rows.length < take && batch.count > rows.length) {
      throw new Error(
        `${label}: received ${rows.length} of ${batch.count} matching rows — the response was truncated (max_rows below ${take}?)`,
      );
    }

    let previous = after;
    for (const row of rows) {
      const key = spec.keyOf(row);
      if (previous !== null && compareKeys(key, previous) <= 0) {
        throw new Error(
          `${label}: rows are not in strictly ascending key order after the cursor — the fetch must order by its key and apply \`after\``,
        );
      }
      previous = key;
    }

    const built = await spec.build(rows);
    if (built.length !== rows.length) {
      throw new Error(
        `${label}: build returned ${built.length} entries for ${rows.length} rows`,
      );
    }

    for (let i = 0; i < rows.length && records.length <= limit; i++) {
      const rec = built[i];
      if (rec !== null) records.push({ rec, key: spec.keyOf(rows[i]) });
    }

    if (rows.length < take) break;
    after = spec.keyOf(rows[rows.length - 1]);
  }

  const page = records.slice(0, limit);
  const next_cursor =
    records.length > limit
      ? encodeCursor(spec.resource, spec.query, page[page.length - 1].key)
      : null;
  return { data: page.map((entry) => entry.rec), next_cursor };
}

/**
 * A `KeysetFetch` over rows already in memory — for a resource whose records
 * have to be assembled before they can be ordered (a family is a connected
 * component, and its key only exists once the component does).
 *
 * `rows` must already be sorted ascending by `keyOf` with unique keys; the page
 * reader verifies the order on every batch it takes. The count is the rows
 * remaining after `after`, which is exact by construction.
 *
 * Name the key function once and pass it to both, so the source and the reader
 * cannot disagree on the order (an inline lambda here also leaves the row type
 * uninferred through the nested generic call):
 *
 *   const keyOf = (family: FamilyDraft) => family.parents[0].id;
 *   readPartnerPage({ …, fetch: keysetInMemory(sorted, keyOf), keyOf, … });
 */
export function keysetInMemory<Row, K extends PartnerKey>(
  rows: readonly Row[],
  keyOf: (row: Row) => K,
): KeysetFetch<Row, K> {
  return (after, take) => {
    const start =
      after === null
        ? 0
        : (() => {
            // First row whose key is strictly after `after`: binary search.
            let low = 0;
            let high = rows.length;
            while (low < high) {
              const mid = (low + high) >> 1;
              if (compareKeys(keyOf(rows[mid]), after) <= 0) low = mid + 1;
              else high = mid;
            }
            return low;
          })();
    const remaining = rows.length - start;
    return Promise.resolve({
      data: rows.slice(start, start + take),
      error: null,
      count: remaining,
    });
  };
}
