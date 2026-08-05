import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { walkPages } from "@/lib/supabase/paging";
import type { Database } from "@/types/database.types";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../../mocks/postgrest-fetch";

// These tests run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts): the genuine query builder constructs the
// PostgREST request, the mock answers with canned wire responses, and the
// client parses them — including the Content-Range header the walk's count
// reconciliation depends on. So the walk is exercised over the real read path
// with no casts.
//
// `profiles` stands in for "any table a caller walks". Nothing here is specific
// to it; it is simply one of the reads the primitive now serves.

const PAGE_SIZE = 1000;

function rows(count: number, offset = 0): { id: string }[] {
  return Array.from({ length: count }, (_, i) => ({ id: `row-${offset + i}` }));
}

/** The read under test: one walked list query in a total order. */
function walk(supabase: SupabaseClient<Database>): Promise<{ id: string }[]> {
  return walkPages("test read", (from, to) =>
    supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .order("id")
      .range(from, to),
  );
}

/** The `offset`/`limit` (or Range header) each captured request asked for. */
function requestedRanges(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = requestedUrl(input);
    const offset = url.searchParams.get("offset");
    const limit = url.searchParams.get("limit");
    if (offset !== null || limit !== null) return `${offset}:${limit}`;
    return String(new Headers(init?.headers).get("range"));
  });
}

describe("walkPages", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    supabase = createFetchStubbedClient(fetchMock);
  });

  it("stops after one request when the first page comes back short", async () => {
    fetchMock.mockResolvedValue(postgrestJson(rows(120)));

    await expect(walk(supabase)).resolves.toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops immediately when a page comes back exactly empty", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await expect(walk(supabase)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a short page whose Content-Range total confirms it is the whole set", async () => {
    fetchMock.mockResolvedValue(postgrestPage(rows(120), { from: 0, total: 120 }));

    await expect(walk(supabase)).resolves.toHaveLength(120);
  });

  // The bug the whole primitive exists for: PostgREST enforces max_rows by
  // returning a short page, not an error, so an unbounded select truncates
  // silently.
  it("keeps paging while pages come back full, and concatenates them in order", async () => {
    const TOTAL = 2 * PAGE_SIZE + 37;
    fetchMock
      .mockResolvedValueOnce(postgrestPage(rows(PAGE_SIZE, 0), { from: 0, total: TOTAL }))
      .mockResolvedValueOnce(
        postgrestPage(rows(PAGE_SIZE, PAGE_SIZE), { from: PAGE_SIZE, total: TOTAL }),
      )
      .mockResolvedValueOnce(
        postgrestPage(rows(37, 2 * PAGE_SIZE), { from: 2 * PAGE_SIZE, total: TOTAL }),
      );

    const result = await walk(supabase);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(TOTAL);
    expect(result[0]?.id).toBe("row-0");
    expect(result[PAGE_SIZE]?.id).toBe(`row-${PAGE_SIZE}`);
    expect(result.at(-1)?.id).toBe(`row-${TOTAL - 1}`);
  });

  it("requests consecutive, non-overlapping windows", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(rows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestJson(rows(1, PAGE_SIZE)));

    await walk(supabase);

    expect(requestedRanges(fetchMock)).toEqual(["0:1000", "1000:1000"]);
  });

  // The scenario the count guards: max_rows lowered below our page size, so
  // every page comes back short and "short page ⇒ done" would silently return a
  // fraction of the table. Content-Range still reports the true total.
  it("throws when the walk ends short of the server-reported total", async () => {
    fetchMock.mockResolvedValue(postgrestPage(rows(500), { from: 0, total: 1500 }));

    await expect(walk(supabase)).rejects.toThrow(/test read: walk ended with 500 of 1500 rows/);
  });

  it("throws when a LATER page ends the walk short of the total", async () => {
    // Multi-page variant: full first page (count captured there), short second
    // page that still leaves the walk below the reported total. Guards the
    // accumulation across pages, not just the single-page capture.
    fetchMock
      .mockResolvedValueOnce(postgrestPage(rows(PAGE_SIZE, 0), { from: 0, total: 2600 }))
      .mockResolvedValueOnce(
        postgrestPage(rows(600, PAGE_SIZE), { from: PAGE_SIZE, total: 2600 }),
      );

    await expect(walk(supabase)).rejects.toThrow(/1600 of 2600 rows/);
  });

  // If the range filter is ever dropped server-side, every page looks full and
  // a naive loop never terminates. The walk must give up loudly instead.
  it("gives up loudly rather than paging forever when pages never go short", async () => {
    // A fresh Response per call — a Response body is single-use, and this is the
    // one case that drives the walk through many requests.
    const page = rows(PAGE_SIZE);
    fetchMock.mockImplementation(() => Promise.resolve(postgrestJson(page)));

    await expect(walk(supabase)).rejects.toThrow(
      /still receiving full pages after 100 requests — the range filter is not being applied/,
    );
  });

  it("throws on the first failing page instead of returning a partial list", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(rows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestError("boom"));

    await expect(walk(supabase)).rejects.toMatchObject({ message: "boom" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
