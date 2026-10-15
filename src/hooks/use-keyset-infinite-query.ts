"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import {
  nextKeysetCursor,
  type KeysetCursor,
  type KeysetRow,
} from "@/lib/supabase/keyset";
import {
  useScrollSentinel,
  type ScrollSentinelRoot,
} from "@/hooks/use-scroll-sentinel";

/**
 * One keyset page as a surface's read returns it: the rows, and how many match
 * the filters — a number on the first page when the read counted, `null`
 * otherwise. The count is an aggregate over the whole match set, so only the
 * first page carries one; it cannot change as the reader scrolls.
 */
export interface KeysetListPage<Row> {
  rows: Row[];
  total: number | null;
}

/** Every page loaded so far, as the surface renders it. */
export interface KeysetList<Row> {
  /** The loaded pages' rows, in order — newest first. */
  rows: Row[];
  /** The first page's total. */
  total: number | null;
}

function flattenKeysetPages<Row>(
  data: InfiniteData<KeysetListPage<Row>, KeysetCursor | undefined>,
): KeysetList<Row> {
  return {
    rows: data.pages.flatMap((page) => page.rows),
    total: data.pages[0]?.total ?? null,
  };
}

export interface KeysetInfiniteQueryOptions<Row, Key extends QueryKey> {
  /** Everything that changes the answer, and nothing else. */
  queryKey: Key;
  /** One page of the surface's read, resumed after `cursor` when there is one. */
  fetchPage: (cursor: KeysetCursor | undefined) => Promise<KeysetListPage<Row>>;
  /** The page size the read asks for — the same constant, not a copy of it. */
  pageSize: number;
  /** False keeps a mounted-but-unseen surface (a closed sheet) from reading. */
  enabled?: boolean;
}

/**
 * A list a person scrolls through, one keyset page at a time.
 *
 * What a surface hook brings is its key and its read; this owns the rest, which
 * is the same for every such list:
 *
 * - **Pages accumulate rather than replace**, so a revealed page appends below
 *   the rows already painted and nothing on screen moves. `data` is the loaded
 *   pages flattened, plus the first page's total.
 * - **"There is more" is the keyset module's answer** — a page shorter than it
 *   asked for is the end — so `pageSize` must be the constant the read sends,
 *   or the question is answered wrongly in both directions.
 * - **`keepPreviousData` is a layout decision.** A keystroke or a filter
 *   changes the key, and without it the list would empty and refill on each:
 *   the rows a reader is looking at vanish, the empty line claims an answer
 *   before one exists, and whatever survives the narrowing comes back at a
 *   different offset. The price is that what is on screen can belong to the
 *   previous question, which `isPlaceholderData` reports — and then the cursor
 *   it yields must not be used to ask for more. `useKeysetSentinel` below
 *   enforces that.
 */
export function useKeysetInfiniteQuery<Row extends KeysetRow, Key extends QueryKey>({
  queryKey,
  fetchPage,
  pageSize,
  enabled = true,
}: KeysetInfiniteQueryOptions<Row, Key>) {
  // The page param is the keyset cursor, absent on the first page. Both the
  // initial value and the query function's parameter are annotated: React
  // Query infers the param type from several sites at once, and an
  // `undefined` literal on its own narrows it to `undefined` — which then
  // rejects the very cursor `getNextPageParam` hands back.
  const firstPage: KeysetCursor | undefined = undefined;

  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }: { pageParam: KeysetCursor | undefined }) =>
      fetchPage(pageParam),
    initialPageParam: firstPage,
    getNextPageParam: (lastPage) => nextKeysetCursor(lastPage.rows, pageSize),
    enabled,
    placeholderData: keepPreviousData,
    // A module-level function, so the selection is memoised across renders
    // rather than recomputed on each.
    select: flattenKeysetPages<Row>,
  });
}

/** The parts of a keyset list's state the sentinel reads. */
export interface KeysetSentinelSource {
  hasNextPage: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  fetchNextPage: () => Promise<unknown>;
}

/**
 * The sentinel at the bottom of a keyset list: reaching it asks for the next
 * page, unless asking now would be wrong.
 *
 * Three conditions hold it off. Nothing left to fetch is the obvious one. A
 * fetch in flight is the second — `isFetching`, not `isFetchingNextPage`:
 * asking for the next page cancels a refresh in flight, so a sentinel firing
 * while an invalidation re-reads the loaded pages would throw that refresh away
 * and leave stale rows on screen marked fresh. The third is placeholder data:
 * the pages on screen answer the previous question, and their cursor would
 * resume the new query from the old one's boundary.
 *
 * The caller still unmounts the sentinel once `hasNextPage` is false.
 *
 * @returns the ref callback for the sentinel element.
 */
export function useKeysetSentinel(
  list: KeysetSentinelSource,
  options: { rootMargin?: string; root?: ScrollSentinelRoot } = {},
): (node: Element | null) => void {
  return useScrollSentinel({
    enabled: list.hasNextPage && !list.isFetching && !list.isPlaceholderData,
    onReach: () => {
      void list.fetchNextPage();
    },
    ...options,
  });
}
