import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useKeysetInfiniteQuery } from "@/hooks/use-keyset-infinite-query";
import type { KeysetCursor } from "@/lib/supabase/keyset";

/**
 * **The shared glue under every load-as-you-scroll list.** A surface brings a
 * key and a read; these cases pin what the hook does with them — when it asks
 * for more and with which cursor, and what it hands the surface back.
 */

const PAGE_SIZE = 2;

interface Row {
  id: string;
  created_at: string;
}

function row(n: number): Row {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    // Microsecond precision, as PostgREST emits it — the cursor must carry it.
    created_at: `2026-09-${String(30 - n).padStart(2, "0")}T08:00:00.123456+00:00`,
  };
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/** A read over `rows`, resumed after the cursor's row, counted on the first page. */
function readOver(rows: Row[]) {
  return vi.fn((cursor: KeysetCursor | undefined) => {
    const start =
      cursor === undefined
        ? 0
        : rows.findIndex((r) => r.id === cursor.id) + 1;
    return Promise.resolve({
      rows: rows.slice(start, start + PAGE_SIZE),
      total: cursor === undefined ? rows.length : null,
    });
  });
}

afterEach(() => {
  cleanup();
});

describe("useKeysetInfiniteQuery", () => {
  it("resumes after the last row of a full page, carrying its own strings", async () => {
    const rows = [row(1), row(2), row(3)];
    const fetchPage = readOver(rows);
    const { result } = renderHook(
      () =>
        useKeysetInfiniteQuery({
          queryKey: ["keyset-test", "full"],
          fetchPage,
          pageSize: PAGE_SIZE,
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await act(() => result.current.fetchNextPage());

    expect(fetchPage).toHaveBeenLastCalledWith({
      createdAt: rows[1].created_at,
      id: rows[1].id,
    });
  });

  it("ends on a short page", async () => {
    const { result } = renderHook(
      () =>
        useKeysetInfiniteQuery({
          queryKey: ["keyset-test", "short"],
          fetchPage: readOver([row(1)]),
          pageSize: PAGE_SIZE,
        }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("flattens the pages in order and keeps the first page's total", async () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const { result } = renderHook(
      () =>
        useKeysetInfiniteQuery({
          queryKey: ["keyset-test", "flatten"],
          fetchPage: readOver(rows),
          pageSize: PAGE_SIZE,
        }),
      { wrapper: wrapper() },
    );

    // Read in the render the test observes: React Query re-renders only for
    // the result properties a render has read, and `data` is the one at issue.
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(4));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(5));

    expect(result.current.data?.rows.map((r) => r.id)).toEqual(
      rows.map((r) => r.id),
    );
    // The later pages answer `null`; the count is the first page's.
    expect(result.current.data?.total).toBe(rows.length);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("holds the previous question's rows on screen while a new one is read", async () => {
    const first = [row(1)];
    let release: () => void = () => {};
    const fetchPage = vi.fn((cursor: KeysetCursor | undefined) =>
      fetchPage.mock.calls.length === 1
        ? readOver(first)(cursor)
        : new Promise<{ rows: Row[]; total: number | null }>((resolve) => {
            release = () => resolve({ rows: [row(9)], total: 1 });
          }),
    );
    const { result, rerender } = renderHook(
      ({ needle }: { needle: string }) =>
        useKeysetInfiniteQuery({
          queryKey: ["keyset-test", "placeholder", needle],
          fetchPage,
          pageSize: PAGE_SIZE,
        }),
      { wrapper: wrapper(), initialProps: { needle: "" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ needle: "ada" });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.rows).toEqual(first);

    act(() => release());
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.rows).toEqual([row(9)]);
  });

  it("reads nothing while disabled", () => {
    const fetchPage = readOver([row(1)]);
    renderHook(
      () =>
        useKeysetInfiniteQuery({
          queryKey: ["keyset-test", "disabled"],
          fetchPage,
          pageSize: PAGE_SIZE,
          enabled: false,
        }),
      { wrapper: wrapper() },
    );

    expect(fetchPage).not.toHaveBeenCalled();
  });
});
