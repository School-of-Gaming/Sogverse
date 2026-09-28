/**
 * Keyset paging for a newest-first list a person scrolls through.
 *
 * The sibling of `walkPages` beside this, and the answer to the race that one
 * accepts. An offset page is "rows 25–49 of the current ordering", so an insert
 * ahead of the cursor — a signup, on a list ordered newest first — shifts every
 * later row down one position: the next page re-reads a row the previous page
 * already rendered and skips the one that crossed the boundary. A walk absorbs
 * that (it is one load, refetched by the query cache), and an interactive list
 * cannot: the pages are all on screen at once, the duplicate collides as a React
 * key, and the skipped person is simply absent with nothing to say so.
 *
 * A keyset page is "rows after this row" instead, expressed against the ordering
 * columns themselves, so nothing an insert does to the row *count* can move it.
 * The cursor is the last row of the page just rendered.
 *
 * **The order is `created_at DESC, id ASC` and this module owns both halves.**
 * The tiebreaker is not decoration: two accounts created in one transaction
 * share a `created_at`, and a tie straddling a page boundary is the same
 * duplicate-and-drop the offset race produces. Ordering, cursor filter and
 * cursor derivation therefore live in one place, because a caller that ordered
 * by one thing and paged by another would compile and read plausibly and be
 * wrong only at the boundaries.
 *
 * **No exact count, unlike the walk.** The walk needs one because its page size
 * sits at `max_rows` and a truncated page is indistinguishable from the last
 * one; a keyset page is a screenful, far below that cap, so a short page really
 * does mean the end of the list. Keep it that way: a page size anywhere near
 * `max_rows` puts the silent-truncation problem back and would need the count
 * guard with it.
 */

/**
 * Where a page resumes: the `created_at` and `id` of the last row of the page
 * before it.
 *
 * **`createdAt` is the row's own string, exactly as PostgREST emitted it, and
 * must never be re-serialised through `Date`.** A `timestamptz` comes back at
 * microsecond precision and a JavaScript `Date` holds milliseconds, so a
 * round-trip through one truncates the value — and a truncated cursor is
 * strictly *earlier* than the row it came from, which re-reads every row written
 * inside that millisecond. Carry the string.
 */
export interface KeysetCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** The two columns a paged row has to carry for a cursor to be derivable. */
export interface KeysetRow {
  readonly created_at: string;
  readonly id: string;
}

/**
 * The builder methods this module calls, as a structural type. A PostgREST query
 * builder satisfies it as it stands, so a caller hands one over directly and
 * nothing here has to name the client's generics or assert its way to them.
 */
export interface KeysetPageable<Self> {
  order(column: string, options?: { ascending?: boolean }): Self;
  or(filters: string): Self;
  limit(count: number): Self;
}

/** The ordering columns, named once so the filter and the order cannot drift. */
const CREATED_AT = "created_at";
const ID = "id";

/**
 * PostgREST's value quoting inside a logic tree: double quotes around the value,
 * a backslash before any quote or backslash within it.
 *
 * Unconditional, because a timestamp is full of characters the `or=(…)` grammar
 * reserves — `.` separates a filter's parts, `:` and `,` separate its own — so
 * an unquoted `2026-09-18T08:43:12.123456+00:00` is not a parse error but a
 * different filter. The same rule is stated once more server-side for the
 * partner API's cursors (`src/lib/api/`), which cannot be imported here: that
 * module is server-only and this one runs in the browser. Fix one, fix both.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/**
 * The `or` filter for "strictly after this cursor" in `created_at DESC, id ASC`:
 *
 *   created_at < c  OR  (created_at = c  AND  id > i)
 *
 * Exported for the tests that pin the exact string; a surface uses
 * `keysetPage()`, which applies this along with the matching order and limit.
 */
export function keysetAfterCursor(cursor: KeysetCursor): string {
  const createdAt = quoteFilterValue(cursor.createdAt);
  return [
    `${CREATED_AT}.lt.${createdAt}`,
    `and(${CREATED_AT}.eq.${createdAt},${ID}.gt.${quoteFilterValue(cursor.id)})`,
  ].join(",");
}

/**
 * Order a list query newest-first, resume it after `cursor` when there is one,
 * and limit it to one page.
 *
 * **The caller must not add a top-level `or` of its own.** This is the one
 * constraint the shape imposes: the cursor filter *is* the query's top-level
 * `or`, and a second one is a second thing to get wrong — supabase-js appends
 * rather than replaces, so the two arrive as separate parameters and how they
 * combine is PostgREST's business rather than something the call site states.
 * Every other filter composes freely, because each is its own parameter and
 * PostgREST ANDs them: an `ilike` search, an `eq` on a role, an `in` on a set of
 * ids. A search that genuinely needs several columns ORed together belongs in a
 * searchable column on the view, where it is one `ilike` and one parameter.
 */
export function keysetPage<Query extends KeysetPageable<Query>>(
  query: Query,
  { cursor, pageSize }: { cursor?: KeysetCursor; pageSize: number },
): Query {
  const ordered = query
    .order(CREATED_AT, { ascending: false })
    .order(ID, { ascending: true });
  const resumed = cursor === undefined ? ordered : ordered.or(keysetAfterCursor(cursor));
  return resumed.limit(pageSize);
}

/**
 * The cursor that resumes after this page, or `undefined` when nothing follows
 * it.
 *
 * A page shorter than it asked for is the end of the list — the same reasoning
 * the walk uses, sound here because a page size is a screenful and the response
 * cap is orders of magnitude above it. An empty page is short by the same test,
 * so a list that ends on an exact multiple of the page size costs one final
 * empty request to learn it has ended; that is the price of not carrying a count,
 * and it is one request against a cheap indexed read.
 */
export function nextKeysetCursor<Row extends KeysetRow>(
  rows: readonly Row[],
  pageSize: number,
): KeysetCursor | undefined {
  if (rows.length < pageSize) return undefined;
  const last = rows.at(-1);
  if (last === undefined) return undefined;
  return { createdAt: last.created_at, id: last.id };
}
