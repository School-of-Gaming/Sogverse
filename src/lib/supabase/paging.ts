import type { PostgrestResponse } from "@supabase/supabase-js";

/**
 * PostgREST caps every response at its `max_rows` setting (1000 on this
 * project) and enforces it by returning a *short page*, not an error — so an
 * unbounded select is indistinguishable from a complete one and truncates
 * silently. Any list read not bounded by construction is therefore over the cap
 * as soon as its table is: `locations` is fully seeded from the official
 * classifications (France alone is 34,875 communes), and `profiles` only ever
 * grows. Keep this in step with the server setting: a value larger than
 * `max_rows` makes every page look short and the walk stops at the cap again; a
 * smaller one just costs extra round-trips.
 */
const PAGE_SIZE = 1000;

/**
 * Refuses to page forever if the server ever stops honouring the range (which
 * would return a full page every time). 100 pages is ~100k rows — three times
 * the whole of France.
 */
const MAX_PAGES = 100;

/**
 * One page request. The caller builds a **fresh** query each time rather than
 * re-ranging one builder: a PostgREST builder carries mutable URL state, and
 * reusing it across pages is the kind of thing that works until someone adds a
 * filter in between.
 */
export type PageFetcher<Row> = (
  from: number,
  to: number,
) => PromiseLike<PostgrestResponse<Row>>;

/**
 * Walk a list query page by page until a page comes back short.
 *
 * Shared by every unbounded list read across the service layer. The
 * `count: "exact"` the caller's query must ask for is what makes "short page ⇒
 * done" safe: `max_rows` is a dashboard setting nothing in this repo controls,
 * and if it ever drops below `PAGE_SIZE` then *every* page is short and a naive
 * walk returns a silently truncated list. Comparing what we collected against
 * the server-reported total turns that into a thrown error — so a caller who
 * omits the count would disarm the one guard this module exists to provide.
 * That is refused rather than tolerated: the first page must report a total or
 * the walk throws.
 *
 * The caller's query must also impose a **total** order or rows shift between
 * requests and the walk both duplicates and drops them. The column a surface
 * wants to sort by is almost never one on its own: every French DROM has a
 * région and a département of the same name, homonymous communes are common,
 * and two accounts created in the same transaction share a `created_at`. So a
 * total order is the sort key the surface wants followed by a unique
 * tiebreaker — the primary key.
 *
 * **Accepted limitation: pages are offset-based, so a concurrent write can
 * shift them mid-walk.** A row inserted ahead of the walk's cursor (a fresh
 * signup, under a newest-first order) pushes every later row down one position,
 * so the next page re-reads one row the previous page already collected and
 * skips the one that moved across the boundary. The count reconciliation cannot
 * see this — the walk still ends with the number of rows the server promised —
 * and the duplicated row can go on to collide as a React key wherever the list
 * is rendered. Keyset paging would close it and is deliberately not implemented:
 * these reads are rare, idempotent, and refetched by the query cache, so the
 * exposure is at most one wrong row for one load, self-correcting on the next
 * fetch. That is the accepted tolerance, React-key collision included.
 */
export async function walkPages<Row>(
  label: string,
  fetchPage: PageFetcher<Row>,
): Promise<Row[]> {
  const all: Row[] = [];
  let expected: number | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error, count } = await fetchPage(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    // PostgREST always populates the count when `count: "exact"` was asked for,
    // so a null here means the caller did not ask — and without a total the
    // reconciliation below never arms, which puts the silent truncation
    // straight back. Refuse on the first page rather than walk half-guarded.
    if (page === 0 && count === null) {
      throw new Error(
        `${label}: the page query reported no total — a walked read must select with { count: "exact" }, otherwise a truncated result is indistinguishable from a complete one`,
      );
    }

    all.push(...data);
    expected = count ?? expected;

    // A short page is PostgREST saying there is nothing after it.
    if (data.length < PAGE_SIZE) {
      if (expected !== null && all.length < expected) {
        throw new Error(
          `${label}: walk ended with ${all.length} of ${expected} rows — the server is returning pages shorter than PAGE_SIZE (max_rows lowered below ${PAGE_SIZE}?)`,
        );
      }
      return all;
    }
  }

  throw new Error(
    `${label}: still receiving full pages after ${MAX_PAGES} requests — the range filter is not being applied`,
  );
}
