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

// The paged walk every list read shares. `locations` is fully seeded from the
// official classifications — France alone is 34,875 communes — so no list read
// is bounded by construction, and PostgREST enforces `max_rows` by returning a
// short page rather than an error. These cases pin the walk's behaviour once,
// through `getSites`; the per-method suites below only assert their own filters.

describe("LocationsService paged walk (via getSites)", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("stops after one request when the first page comes back short", async () => {
    fetchMock.mockResolvedValue(postgrestJson(locationRows(120)));

    const result = await service.getSites();

    expect(result).toHaveLength(120);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a short page whose Content-Range total confirms it is the whole table", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(120), { from: 0, total: 120 }),
    );

    await expect(service.getSites()).resolves.toHaveLength(120);
  });

  it("throws when the walk ends short of the server-reported total", async () => {
    // The scenario the count guards: max_rows lowered below our page size, so
    // every page comes back short and "short page ⇒ done" would silently
    // return a truncated table. Content-Range still reports the true total.
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(500), { from: 0, total: 1500 }),
    );

    await expect(service.getSites()).rejects.toThrow(
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

    const result = await service.getSites();

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

    await service.getSites();

    expect(requestedRanges(fetchMock)).toEqual(["0:1000", "1000:1000"]);
  });

  // A page boundary is only meaningful under a total order. `name` is not one:
  // every French DROM has a région and a département of the same name.
  it("orders by name and then id so paging is stable across requests", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await service.getSites();

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });

  it("stops immediately when a page comes back exactly empty", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await expect(service.getSites()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on the first failing page instead of returning a partial list", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestError("boom"));

    await expect(service.getSites()).rejects.toMatchObject({
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

    await expect(service.getSites()).rejects.toThrow(
      /range filter is not being applied/
    );
  });
});

// The scoped reads that replace fetching the whole table.

describe("LocationsService.getMunicipalitiesByCountry", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("asks only for that country's municipalities, in a total order", async () => {
    fetchMock.mockResolvedValue(postgrestJson(locationRows(308)));

    await service.getMunicipalitiesByCountry("FI");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("country_code")).toBe("eq.FI");
    expect(url.searchParams.get("type")).toBe("eq.municipality");
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });

  // One level shallower than the site query, and that is the point: this one
  // runs over 34,875 rows for France, so it asks for the depth a municipality
  // actually has (département -> région -> pays) and no more.
  it("embeds three ancestor levels, not the site query's four", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await service.getMunicipalitiesByCountry("FR");

    const select =
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ?? "";
    expect(select.split("parent:parent_id(")).toHaveLength(4);
  });

  it("flattens the embedded parent nest into a nearest-first chain", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        {
          ...locationRows(1)[0],
          parent: {
            id: "region",
            name: "Uusimaa",
            parent: { id: "country", name: "Finland", parent: null },
          },
        },
      ]),
    );

    const [municipality] = await service.getMunicipalitiesByCountry("FI");

    expect(municipality.ancestors.map((node) => node.name)).toEqual([
      "Uusimaa",
      "Finland",
    ]);
    expect(municipality.ancestors[0]).not.toHaveProperty("parent");
  });

  it("pages through a country the size of France", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, PAGE_SIZE)))
      .mockResolvedValueOnce(postgrestJson(locationRows(12, 2 * PAGE_SIZE)));

    const result = await service.getMunicipalitiesByCountry("FR");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(2 * PAGE_SIZE + 12);
    expect(requestedRanges(fetchMock)).toEqual([
      "0:1000",
      "1000:1000",
      "2000:1000",
    ]);
  });

  it("throws rather than returning a truncated list when the total disagrees", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(400), { from: 0, total: 34875 }),
    );

    await expect(service.getMunicipalitiesByCountry("FR")).rejects.toThrow(
      /400 of 34875 rows/,
    );
  });
});

describe("LocationsService.getSites", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("selects sites with four embedded ancestor levels", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await service.getSites();

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("type")).toBe("eq.site");
    // Four levels is the deepest chain any supported country has: a French
    // site sits under commune -> département -> région -> France.
    const select = url.searchParams.get("select") ?? "";
    expect(select.split("parent:parent_id(")).toHaveLength(5);
  });

  // The embed comes back as a nest of `parent` objects; consumers want an
  // array, nearest first, so `ancestors[0]` is the municipality whatever the
  // country's depth. The walk also has to stop at the first null parent —
  // Finland's chain is one level shorter than France's.
  it("flattens the embedded parent nest into a nearest-first chain", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        {
          ...locationRows(1)[0],
          type: "site",
          parent: {
            id: "muni",
            name: "Helsinki",
            parent: { id: "region", name: "Uusimaa", parent: null },
          },
        },
      ]),
    );

    const [site] = await service.getSites();

    expect(site.ancestors.map((node) => node.name)).toEqual([
      "Helsinki",
      "Uusimaa",
    ]);
    // The nesting key itself is gone — a consumer reads the array, not a nest.
    expect(site.ancestors[0]).not.toHaveProperty("parent");
  });

  it("pages, so a long venue list cannot silently truncate", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(PAGE_SIZE, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(3, PAGE_SIZE)));

    await expect(service.getSites()).resolves.toHaveLength(PAGE_SIZE + 3);
    expect(requestedRanges(fetchMock)).toEqual(["0:1000", "1000:1000"]);
  });
});

describe("LocationsService.getSitesByParent", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("filters to sites under exactly that municipality", async () => {
    fetchMock.mockResolvedValue(postgrestJson(locationRows(2)));

    await service.getSitesByParent("muni-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("type")).toBe("eq.site");
    expect(url.searchParams.get("parent_id")).toBe("eq.muni-1");
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });
});

describe("LocationsService.getLocationsByIds", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("makes no request at all for an empty selection", async () => {
    await expect(service.getLocationsByIds([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for each id once, whatever the caller passed", async () => {
    fetchMock.mockResolvedValue(postgrestJson(locationRows(2)));

    await service.getLocationsByIds(["b", "a", "b"]);

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("id")).toBe("in.(a,b)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Batching is what lets this skip the paged walk: a request asking for at
  // most 100 keys can come back with at most 100 rows, well under max_rows.
  it("batches a large selection and concatenates the batches", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${String(i).padStart(3, "0")}`);
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(100, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(100, 100)))
      .mockResolvedValueOnce(postgrestJson(locationRows(50, 200)));

    const result = await service.getLocationsByIds(ids);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(250);
    const batches = fetchMock.mock.calls.map(
      ([input]) => (requestedUrl(input).searchParams.get("id") ?? "").split(",").length,
    );
    expect(batches).toEqual([100, 100, 50]);
  });

  it("throws on a failing batch instead of returning a partial list", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(service.getLocationsByIds(["a"])).rejects.toMatchObject({
      message: "boom",
    });
  });
});

describe("LocationsService.resolveLocationsByCodes", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("makes no request when nothing is ticked", async () => {
    await expect(service.resolveLocationsByCodes("FR", [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // France reuses every one of its 18 région codes as a département code, so a
  // code-only lookup would be ambiguous. The type has to be on the filter.
  it("issues one request per type, each scoped to country and type", async () => {
    // A fresh Response per call — a Response body is single-use and this test
    // drives two requests.
    fetchMock.mockImplementation(() => Promise.resolve(postgrestJson([])));

    await service.resolveLocationsByCodes("FR", [
      { type: "municipality", external_code: "59350" },
      { type: "district", external_code: "59" },
      { type: "municipality", external_code: "59009" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    const seen = urls.map((url) => ({
      country: url.searchParams.get("country_code"),
      type: url.searchParams.get("type"),
      codes: url.searchParams.get("external_code"),
    }));
    expect(seen).toEqual([
      { country: "eq.FR", type: "eq.district", codes: "in.(59)" },
      { country: "eq.FR", type: "eq.municipality", codes: "in.(59009,59350)" },
    ]);
  });

  it("merges the per-type results into one list", async () => {
    fetchMock
      .mockResolvedValueOnce(postgrestJson(locationRows(1, 0)))
      .mockResolvedValueOnce(postgrestJson(locationRows(2, 1)));

    const result = await service.resolveLocationsByCodes("FI", [
      { type: "region", external_code: "01" },
      { type: "municipality", external_code: "091" },
      { type: "municipality", external_code: "049" },
    ]);

    expect(result.map((row) => row.id)).toEqual(["loc-0", "loc-1", "loc-2"]);
  });

  it("throws rather than resolving half the ticks", async () => {
    fetchMock.mockResolvedValue(postgrestError("nope"));

    await expect(
      service.resolveLocationsByCodes("FR", [
        { type: "municipality", external_code: "59350" },
      ]),
    ).rejects.toMatchObject({ message: "nope" });
  });
});
