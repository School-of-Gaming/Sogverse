import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocationsService } from "@/services/locations/locations.service";
import type { Location } from "@/types";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// These tests run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts): the genuine query builder constructs the
// PostgREST request, the mock answers with canned wire responses, and the
// client parses them — so the full read path is exercised with no casts.

const PAGE_SIZE = 1000;

function locationRows(count: number, offset = 0): Location[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `loc-${offset + i}`,
    name: `Location ${offset + i}`,
    type: "municipality" as const,
    parent_id: null,
    country_code: "FR",
    external_code: String(offset + i),
    name_i18n: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }));
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

describe("LocationsService.getAllLocations", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("stops after one request when the first page comes back short", async () => {
    fetchMock.mockResolvedValue(postgrestJson(locationRows(120)));

    const result = await service.getAllLocations();

    expect(result).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a short page whose Content-Range total confirms it is the whole table", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(120), { from: 0, total: 120 }),
    );

    await expect(service.getAllLocations()).resolves.toHaveLength(120);
  });

  it("throws when the walk ends short of the server-reported total", async () => {
    // The scenario the count guards: max_rows lowered below our page size, so
    // every page comes back short and "short page ⇒ done" would silently
    // return a truncated table. Content-Range still reports the true total.
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(500), { from: 0, total: 1500 }),
    );

    await expect(service.getAllLocations()).rejects.toThrow(
      /500 of 1500 rows/,
    );
  });

  // The bug this guards: PostgREST enforces max_rows by returning a short page,
  // not an error, so an unbounded select silently truncated at 1000 rows.
  it("keeps paging while pages come back full, and concatenates them in order", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, PAGE_SIZE)))
      .mockResolvedValueOnce(postgrestJson(locationRows(37, 2 * PAGE_SIZE)));

    const result = await service.getAllLocations();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(2 * PAGE_SIZE + 37);
    expect(result[0]?.id).toBe("loc-0");
    expect(result[PAGE_SIZE]?.id).toBe(`loc-${PAGE_SIZE}`);
    expect(result.at(-1)?.id).toBe(`loc-${2 * PAGE_SIZE + 36}`);
  });

  it("requests consecutive, non-overlapping windows", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(1, PAGE_SIZE)));

    await service.getAllLocations();

    expect(requestedRanges(fetchMock)).toEqual(["0:1000", "1000:1000"]);
  });

  // A page boundary is only meaningful under a total order. `name` is not one:
  // every French DROM has a région and a département of the same name.
  it("orders by name and then id so paging is stable across requests", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await service.getAllLocations();

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });

  it("stops immediately when a page comes back exactly empty", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await expect(service.getAllLocations()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on the first failing page instead of returning a partial list", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestError("boom"));

    await expect(service.getAllLocations()).rejects.toMatchObject({
      message: "boom",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // If the range filter is ever dropped server-side, every page looks full and
  // a naive loop never terminates. The walk must give up loudly instead.
  it("gives up loudly rather than paging forever when pages never go short", async () => {
    // A fresh Response per call — a Response body is single-use, and this is
    // the one test that drives the service through many requests.
    const page = locationRows(PAGE_SIZE);
    fetchMock.mockImplementation(() => Promise.resolve(postgrestJson(page)));

    await expect(service.getAllLocations()).rejects.toThrow(
      /range filter is not being applied/
    );
  });
});
