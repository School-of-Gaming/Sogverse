import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  keysetAfterCursor,
  keysetPage,
  nextKeysetCursor,
  type KeysetCursor,
} from "@/lib/supabase/keyset";
import type { Database } from "@/types/database.types";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../../mocks/postgrest-fetch";

// As with the walk's suite, these run the REAL Supabase client over a fake fetch
// transport (tests/mocks/postgrest-fetch.ts): the genuine query builder encodes
// the request and the mock only answers it, so what is asserted below is the
// query PostgREST would actually receive — the ordering, the limit, and above
// all the quoting inside the cursor's `or`, which a hand-built URL would let us
// get wrong in agreement with ourselves.
//
// `profiles` stands in for any newest-first list a person pages through.

const PAGE_SIZE = 25;

/** A full-precision `timestamptz` as PostgREST emits one: microseconds, `+00:00`. */
const CREATED_AT = "2026-09-18T08:43:12.123456+00:00";
const CURSOR: KeysetCursor = {
  createdAt: CREATED_AT,
  id: "0a5f1d2c-7b3e-4c18-9f60-8d2a1b4e6c90",
};

function page(supabase: SupabaseClient<Database>, cursor?: KeysetCursor) {
  return keysetPage(supabase.from("profiles").select("id, created_at"), {
    cursor,
    pageSize: PAGE_SIZE,
  });
}

function sole(fetchMock: FetchMock): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [input] = fetchMock.mock.calls[0];
  return requestedUrl(input);
}

describe("keysetPage", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(postgrestJson([]));
    supabase = createFetchStubbedClient(fetchMock);
  });

  it("imposes the total order and the page's limit", async () => {
    await page(supabase);

    const url = sole(fetchMock);
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(url.searchParams.get("limit")).toBe(String(PAGE_SIZE));
  });

  // The first page has nothing to resume after, and a filter there would be a
  // filter against the newest row in the list.
  it("adds no filter when there is no cursor", async () => {
    await page(supabase);

    expect(sole(fetchMock).searchParams.has("or")).toBe(false);
  });

  it("resumes strictly after the cursor, tiebreaker included", async () => {
    await page(supabase, CURSOR);

    expect(sole(fetchMock).searchParams.get("or")).toBe(
      `(created_at.lt."${CREATED_AT}",and(created_at.eq."${CREATED_AT}",id.gt."${CURSOR.id}"))`,
    );
  });

  // The timestamp is the reason the values are quoted at all: `.` separates a
  // filter's parts and `:` and `,` separate its own, so an unquoted timestamp is
  // not a parse error but a different filter.
  it("quotes the timestamp so the grammar reads it as one value", () => {
    const filter = keysetAfterCursor(CURSOR);

    expect(filter).toContain(`"${CREATED_AT}"`);
    expect(filter).not.toContain(`lt.${CREATED_AT}`);
  });

  it("escapes a quote or a backslash inside a value", () => {
    expect(keysetAfterCursor({ createdAt: CREATED_AT, id: 'a"b\\c' })).toContain(
      String.raw`id.gt."a\"b\\c"`,
    );
  });

  // Every other filter is its own query parameter, which PostgREST ANDs — so a
  // search composes with a cursor rather than competing with it.
  it("composes with an ilike search the caller adds", async () => {
    await keysetPage(
      supabase.from("profiles").select("id, created_at").ilike("email", "%aino%"),
      { cursor: CURSOR, pageSize: PAGE_SIZE },
    );

    const url = sole(fetchMock);
    expect(url.searchParams.get("email")).toBe("ilike.%aino%");
    expect(url.searchParams.get("or")).toContain("created_at.lt.");
  });
});

describe("nextKeysetCursor", () => {
  const rows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      created_at: CREATED_AT,
      id: `row-${i}`,
    }));

  it("carries the last row's own values forward", () => {
    expect(nextKeysetCursor(rows(PAGE_SIZE), PAGE_SIZE)).toEqual({
      createdAt: CREATED_AT,
      id: `row-${PAGE_SIZE - 1}`,
    });
  });

  // Never re-serialised through a Date: a `timestamptz` comes back at
  // microsecond precision, a Date holds milliseconds, and a truncated cursor is
  // earlier than the row it came from — which re-reads every row written inside
  // that millisecond.
  it("carries a microsecond timestamp through unchanged", () => {
    expect(nextKeysetCursor(rows(1), 1)?.createdAt).toBe(CREATED_AT);
  });

  it("ends the list on a page shorter than it asked for", () => {
    expect(nextKeysetCursor(rows(PAGE_SIZE - 1), PAGE_SIZE)).toBeUndefined();
  });

  it("ends the list on an empty page", () => {
    expect(nextKeysetCursor([], PAGE_SIZE)).toBeUndefined();
  });
});
