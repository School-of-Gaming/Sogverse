import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import {
  compareKeys,
  decodeCursor,
  encodeCursor,
  filterFingerprint,
  keysetAfter,
  keysetInMemory,
  readPartnerPage,
  type KeysetBatch,
  type PagedQuery,
} from "@/lib/api/partner-cursor.server";
import {
  createFetchStubbedClient,
  requestedUrl,
  type FetchMock,
} from "../../../mocks/postgrest-fetch";

const uuidKey = z.string().uuid();

/** Ten sorted, distinct uuids — the same shape the partner keys have. */
const IDS = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
);

describe("filterFingerprint", () => {
  it("ignores limit, cursor, absent filters and the order the filters came in", () => {
    const a = filterFingerprint({ limit: 10, status: "running", product_id: undefined });
    const b = filterFingerprint({ status: "running", limit: 500, cursor: "abc" });
    expect(a).toBe(b);
  });

  it("differs when any filter value differs", () => {
    expect(filterFingerprint({ limit: 10, status: "running" })).not.toBe(
      filterFingerprint({ limit: 10, status: "pending" }),
    );
    expect(filterFingerprint({ limit: 10 })).not.toBe(
      filterFingerprint({ limit: 10, status: "pending" }),
    );
  });
});

describe("the cursor codec", () => {
  const query: PagedQuery = { limit: 2, status: "running" };

  it("reads no cursor as the first page", () => {
    expect(decodeCursor("products", query, uuidKey)).toEqual({ ok: true, key: null });
  });

  it("round-trips a key under the same resource and filters", () => {
    const cursor = encodeCursor("products", query, IDS[3]);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor("products", { ...query, cursor, limit: 50 }, uuidKey)).toEqual({
      ok: true,
      key: IDS[3],
    });
  });

  it("round-trips a composite key", () => {
    const schema = z.tuple([z.string().uuid(), z.string()]);
    const key = [IDS[1], "2026-09-01T10:00:00+00:00"] as const;
    const cursor = encodeCursor("feedback", { limit: 5 }, key);
    expect(decodeCursor("feedback", { limit: 5, cursor }, schema)).toEqual({
      ok: true,
      key: [...key],
    });
  });

  it.each([
    ["not base64 JSON", "!!!"],
    ["JSON that is not a cursor", Buffer.from('{"id":"x"}').toString("base64url")],
    ["an array", Buffer.from("[1,2]").toString("base64url")],
  ])("refuses %s, naming the cursor", (_label, cursor) => {
    const result = decodeCursor("products", { limit: 2, cursor }, uuidKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/^cursor: /);
  });

  it("refuses another resource's cursor", () => {
    const cursor = encodeCursor("enrolments", query, IDS[3]);
    const result = decodeCursor("products", { ...query, cursor }, uuidKey);
    expect(result).toEqual({
      ok: false,
      message: "cursor: was issued by /enrolments, not /products",
    });
  });

  it("refuses a cursor issued under other filters", () => {
    const cursor = encodeCursor("products", query, IDS[3]);
    const result = decodeCursor("products", { limit: 2, status: "pending", cursor }, uuidKey);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("different filters");
  });

  it("refuses a key of the wrong shape", () => {
    const cursor = encodeCursor("products", query, "not-a-uuid");
    expect(decodeCursor("products", { ...query, cursor }, uuidKey).ok).toBe(false);
  });
});

describe("compareKeys", () => {
  it("orders strings and tuples by code unit, element by element", () => {
    expect(compareKeys("a", "b")).toBe(-1);
    expect(compareKeys(["a", "b"], ["a", "a"])).toBe(1);
    expect(compareKeys(["a", "b"], ["a", "b"])).toBe(0);
  });

  it("orders PostgREST timestamps chronologically, fractional seconds included", () => {
    expect(
      compareKeys("2026-09-01T10:00:00+00:00", "2026-09-01T10:00:00.5+00:00"),
    ).toBe(-1);
    expect(
      compareKeys("2026-09-01T10:00:00.5+00:00", "2026-09-01T10:00:00.123456+00:00"),
    ).toBe(1);
  });

  it("refuses keys of different arity", () => {
    expect(() => compareKeys("a", ["a", "b"])).toThrow();
  });
});

describe("keysetAfter", () => {
  it("expands a composite key into strictly-after arms, every value quoted", () => {
    expect(keysetAfter(["a", "b", "c"], ["1", "2", "3"])).toBe(
      'a.gt."1",and(a.eq."1",b.gt."2"),and(a.eq."1",b.eq."2",c.gt."3")',
    );
  });

  it("escapes quotes and backslashes inside a value", () => {
    expect(keysetAfter(["a"], ['x"y\\z'])).toBe('a.gt."x\\"y\\\\z"');
  });

  it("refuses a key that does not match its columns", () => {
    expect(() => keysetAfter(["a", "b"], ["1"])).toThrow();
    expect(() => keysetAfter([], [])).toThrow();
  });

  it("is what PostgREST receives through the query builder", async () => {
    const fetchMock: FetchMock = vi.fn<typeof fetch>(
      async () => new Response("[]", { headers: { "Content-Range": "*/0" } }),
    );
    const client = createFetchStubbedClient(fetchMock);
    await client
      .from("session_feedback")
      .select("participant_id")
      .or(keysetAfter(["participant_id", "session_opens_at"], [IDS[0], "2026-09-01T10:00:00.5+00:00"]));
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("or")).toBe(
      `(participant_id.gt."${IDS[0]}",and(participant_id.eq."${IDS[0]}",session_opens_at.gt."2026-09-01T10:00:00.5+00:00"))`,
    );
  });
});

// ---------------------------------------------------------------------------
// readPartnerPage
// ---------------------------------------------------------------------------

type Row = { id: string };
const rows: Row[] = IDS.map((id) => ({ id }));

/** A fetch over `rows` that behaves the way a correct PostgREST keyset query does. */
function honestFetch(source: readonly Row[] = rows) {
  return vi.fn((after: string | null, take: number): Promise<KeysetBatch<Row>> => {
    const remaining = source.filter((row) => after === null || row.id > after);
    return Promise.resolve({ data: remaining.slice(0, take), error: null, count: remaining.length });
  });
}

function page(options: {
  limit: number;
  cursor?: string;
  fetch?: ReturnType<typeof honestFetch>;
  build?: (batch: Row[]) => (string | null)[];
  batchSize?: number;
}) {
  const fetch = options.fetch ?? honestFetch();
  return readPartnerPage({
    resource: "products",
    query: { limit: options.limit, cursor: options.cursor },
    key: uuidKey,
    fetch,
    keyOf: (row) => row.id,
    build: options.build ?? ((batch) => batch.map((row) => row.id)),
    batchSize: options.batchSize,
  });
}

describe("readPartnerPage", () => {
  it("returns the first limit records and a cursor when more follow", async () => {
    const fetch = honestFetch();
    const first = await page({ limit: 3, fetch });
    expect(first.data).toEqual(IDS.slice(0, 3));
    expect(first.next_cursor).not.toBeNull();
    // limit + 1 is the whole fetch.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(null, 4);
  });

  it("walks every record exactly once across pages, and ends without an empty page", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = await page({ limit: 3, cursor });
      seen.push(...result.data);
      pages += 1;
      cursor = result.next_cursor ?? undefined;
    } while (cursor !== undefined);
    expect(seen).toEqual(IDS);
    // 10 records at 3 a page is 4 pages, the last holding one — never a fifth, empty one.
    expect(pages).toBe(4);
  });

  it("answers no cursor when the records exactly fill the page", async () => {
    const result = await page({ limit: 10 });
    expect(result.data).toHaveLength(10);
    expect(result.next_cursor).toBeNull();
  });

  it("answers an empty last page for an empty resource", async () => {
    expect(await page({ limit: 5, fetch: honestFetch([]) })).toEqual({
      data: [],
      next_cursor: null,
    });
  });

  it("keeps walking past dropped rows until the page is full", async () => {
    // Only even-indexed ids are records; batches of limit + 1 rows hold too few.
    const keep = new Set(IDS.filter((_, i) => i % 2 === 0));
    const fetch = honestFetch();
    const result = await page({
      limit: 2,
      fetch,
      build: (batch) => batch.map((row) => (keep.has(row.id) ? row.id : null)),
    });
    expect(result.data).toEqual([IDS[0], IDS[2]]);
    expect(result.next_cursor).not.toBeNull();

    // The cursor is the last RETURNED record's key, so the dropped row after it
    // is re-read and re-dropped — nothing kept is skipped.
    const next = await page({
      limit: 2,
      cursor: result.next_cursor ?? undefined,
      build: (batch) => batch.map((row) => (keep.has(row.id) ? row.id : null)),
    });
    expect(next.data).toEqual([IDS[4], IDS[6]]);
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
  });

  it("honours a larger batch size, and clamps it to the response cap", async () => {
    const fetch = honestFetch();
    await page({ limit: 2, fetch, batchSize: 50 });
    expect(fetch).toHaveBeenCalledWith(null, 50);
    const capped = honestFetch();
    await page({ limit: 2, fetch: capped, batchSize: 5000 });
    expect(capped).toHaveBeenCalledWith(null, 1000);
  });

  it("throws PartnerQueryError for a cursor that does not decode, before any fetch", async () => {
    const fetch = honestFetch();
    await expect(page({ limit: 2, cursor: "!!!", fetch })).rejects.toBeInstanceOf(
      PartnerQueryError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a batch truncated below what its count promises", async () => {
    // What max_rows lowered under the batch size looks like: a short batch that
    // would otherwise pass for the last one.
    const truncated = vi.fn(() =>
      Promise.resolve({ data: rows.slice(0, 2), error: null, count: 10 }),
    );
    await expect(page({ limit: 5, fetch: truncated })).rejects.toThrow(/truncated/);
  });

  it("refuses a fetch that reports no count", async () => {
    const uncounted = vi.fn(() => Promise.resolve({ data: rows.slice(0, 2), error: null, count: null }));
    await expect(page({ limit: 5, fetch: uncounted })).rejects.toThrow(/count/);
  });

  it("refuses rows out of key order", async () => {
    const shuffled = vi.fn(() =>
      Promise.resolve({ data: [rows[1], rows[0]], error: null, count: 2 }),
    );
    await expect(page({ limit: 5, fetch: shuffled })).rejects.toThrow(/ascending/);
  });

  it("refuses a fetch that ignores the cursor", async () => {
    const cursor = encodeCursor("products", { limit: 5 }, IDS[4]);
    const ignoresAfter = vi.fn(() =>
      Promise.resolve({ data: rows.slice(0, 3), error: null, count: 3 }),
    );
    await expect(page({ limit: 5, cursor, fetch: ignoresAfter })).rejects.toThrow(/ascending/);
  });

  it("rethrows a fetch's error", async () => {
    const failure = new Error("boom");
    const failing = vi.fn(() => Promise.resolve({ data: null, error: failure, count: null }));
    await expect(page({ limit: 5, fetch: failing })).rejects.toBe(failure);
  });

  it("refuses a build that does not answer one entry per row", async () => {
    await expect(page({ limit: 5, build: () => [] })).rejects.toThrow(/build/);
  });

  it("accepts a PostgREST query builder as the fetch", async () => {
    const fetchMock: FetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = requestedUrl(input);
      const after = url.searchParams.get("id")?.replace(/^gt\./, "") ?? null;
      const limit = Number(url.searchParams.get("limit"));
      const remaining = IDS.filter((id) => after === null || id > after);
      const data = remaining.slice(0, limit).map((id) => ({ id }));
      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Content-Range": `0-${data.length - 1}/${remaining.length}`,
        },
      });
    });
    const client = createFetchStubbedClient(fetchMock);

    const result = await readPartnerPage({
      resource: "products",
      query: { limit: 4 },
      key: uuidKey,
      fetch: (after, take) => {
        const query = client
          .from("products")
          .select("id", { count: "exact" })
          .order("id")
          .limit(take);
        return after === null ? query : query.gt("id", after);
      },
      keyOf: (row) => row.id,
      build: (batch) => batch.map((row) => row.id),
    });

    expect(result.data).toEqual(IDS.slice(0, 4));
    expect(result.next_cursor).not.toBeNull();
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("order")).toBe("id.asc");
  });
});

describe("keysetInMemory", () => {
  it("serves sorted rows after a key with an exact remaining count", async () => {
    const fetch = keysetInMemory(rows, (row) => row.id);
    expect(await fetch(null, 2)).toEqual({ data: rows.slice(0, 2), error: null, count: 10 });
    expect(await fetch(IDS[7], 5)).toEqual({ data: rows.slice(8), error: null, count: 2 });
    expect(await fetch(IDS[9], 5)).toEqual({ data: [], error: null, count: 0 });
  });

  it("resumes after a key that is not itself a row", async () => {
    const fetch = keysetInMemory([rows[1], rows[3], rows[5]], (row) => row.id);
    expect((await fetch(IDS[2], 5)).data).toEqual([rows[3], rows[5]]);
  });

  it("pages through readPartnerPage", async () => {
    // One named key function for both: the in-memory source and the page reader
    // must agree on the order, and naming it once is also what lets the row
    // type flow through a nested generic call.
    const keyOf = (row: Row) => row.id;
    const result = await readPartnerPage({
      resource: "families",
      query: { limit: 4 },
      key: uuidKey,
      fetch: keysetInMemory(rows, keyOf),
      keyOf,
      build: (batch) => batch.map((row) => row.id),
    });
    expect(result.data).toEqual(IDS.slice(0, 4));
    expect(result.next_cursor).not.toBeNull();
  });
});
