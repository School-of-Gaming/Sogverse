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

// The paged walk itself is specified in tests/unit/lib/supabase/paging.test.ts —
// termination, the count reconciliation and the runaway guard all live with the
// primitive. What belongs here is the shape of each read: its filters, its
// total order, and the columns it names.

// The scoped reads that replace fetching the whole table.

describe("LocationsService.getMunicipalitiesByCountry", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("asks only for that country's municipalities, in a total order", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(308), { from: 0, total: 308 }),
    );

    await service.getMunicipalitiesByCountry("FI");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("country_code")).toBe("eq.FI");
    expect(url.searchParams.get("type")).toBe("eq.municipality");
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });

  // A directory read *offers* places, so it drops the ones a refresh retired.
  // Keyed reads deliberately do not — see the column discipline block below and
  // the service's own note.
  it("leaves retired municipalities out of the directory", async () => {
    fetchMock.mockResolvedValue(postgrestPage([], { from: 0, total: 0 }));

    await service.getMunicipalitiesByCountry("FI");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("retired_at")).toBe("is.null");
  });

  // One level shallower than the keyed read, and that is the point: this one
  // runs over some 34,900 rows for France, so it asks for the depth a municipality
  // actually has (département -> région -> pays) and no more.
  it("embeds three ancestor levels, not the keyed read's four", async () => {
    fetchMock.mockResolvedValue(postgrestPage([], { from: 0, total: 0 }));

    await service.getMunicipalitiesByCountry("FR");

    const select =
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ?? "";
    expect(select.split("parent:parent_id(")).toHaveLength(4);
  });

  it("flattens the embedded parent nest into a nearest-first chain", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(
        [
          {
            ...locationRows(1)[0],
            parent: {
              id: "region",
              name: "Uusimaa",
              parent: { id: "country", name: "Finland", parent: null },
            },
          },
        ],
        { from: 0, total: 1 },
      ),
    );

    const [municipality] = await service.getMunicipalitiesByCountry("FI");

    expect(municipality.ancestors.map((node) => node.name)).toEqual([
      "Uusimaa",
      "Finland",
    ]);
    expect(municipality.ancestors[0]).not.toHaveProperty("parent");
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
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(2), { from: 0, total: 2 }),
    );

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

  // A key set is whatever a caller stored, and a stored pick can be a site —
  // the deepest row in the tree — so this read asks for four ancestor levels
  // rather than the three a municipality needs. Under-asking would silently
  // truncate a French venue's chain at its région.
  it("asks for four embedded ancestor levels, the deepest chain any country has", async () => {
    fetchMock.mockResolvedValue(postgrestJson([]));

    await service.getLocationsByIds(["a"]);

    const select =
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ?? "";
    expect(select.split("parent:parent_id(")).toHaveLength(5);
  });

  // Every surface holding ids holds them to render them, and a bare name is
  // ambiguous across countries — so the chain comes back with the row. The
  // embed arrives as a nest of `parent` objects and consumers want an array,
  // nearest first, so `ancestors[0]` is the level immediately above whatever
  // the country's depth. The flatten also has to stop at the first null parent:
  // a Finnish site's chain is one level shorter than a French one's, so the
  // fourth embed level comes back null rather than missing.
  it("flattens a site's embedded parent nest into a nearest-first chain", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        {
          ...locationRows(1)[0],
          type: "site",
          parent: {
            id: "muni",
            name: "Helsinki",
            parent: {
              id: "region",
              name: "Uusimaa",
              parent: { id: "country", name: "Suomi", parent: null },
            },
          },
        },
      ]),
    );

    const [row] = await service.getLocationsByIds(["a"]);

    expect(row.ancestors.map((node) => node.name)).toEqual([
      "Helsinki",
      "Uusimaa",
      "Suomi",
    ]);
    // The nesting key itself is gone — a consumer reads the array, not a nest.
    expect(row.ancestors[0]).not.toHaveProperty("parent");
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

// The postal lookup: a code is an alternative key onto a municipality, resolved
// in two reads — `postal_codes` says which places, and the keyed read above says
// what they are. What is specified here is the shape of the first read and the
// hand-off to the second; the fixtures that prove a real code reaches the right
// kunta or commune are DB tests, because they are claims about seeded data.

describe("LocationsService.getMunicipalitiesByPostalCode", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  it("filters on the country and the code, and asks only for the id", async () => {
    fetchMock.mockResolvedValueOnce(postgrestJson([{ location_id: "muni-1" }]));
    fetchMock.mockResolvedValueOnce(postgrestJson(locationRows(1)));

    await service.getMunicipalitiesByPostalCode("FI", "00100");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toContain("postal_codes");
    expect(url.searchParams.get("country_code")).toBe("eq.FI");
    expect(url.searchParams.get("postal_code")).toBe("eq.00100");
    // The country and the code came from the caller; reading them back would be
    // echoing the filter. The embed beside `location_id` carries no answer
    // either — it is how the retired filter below reaches the joined row.
    expect(url.searchParams.get("select")).toBe("location_id,locations!inner(id)");
  });

  // A postal code is a way of *offering* a municipality, so it sits on the
  // offering side of the retirement split, exactly as browsing a level and the
  // directory do. The filter has to be on this read rather than on the keyed
  // read that follows: keyed reads deliberately answer for retired rows, so a
  // stored pick keeps resolving.
  it("does not offer a municipality a refresh retired", async () => {
    fetchMock.mockResolvedValueOnce(postgrestJson([{ location_id: "muni-1" }]));
    fetchMock.mockResolvedValueOnce(postgrestJson(locationRows(1)));

    await service.getMunicipalitiesByPostalCode("FI", "00100");

    const postal = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(postal.searchParams.get("locations.retired_at")).toBe("is.null");
    // And the second read stays unfiltered — by then the ids are ones the
    // first read already vouched for.
    const keyed = requestedUrl(fetchMock.mock.calls[1][0]);
    expect(keyed.searchParams.has("retired_at")).toBe(false);
  });

  // A code can span municipalities — a French code routinely covers dozens of
  // communes, which is exactly why `location_id` is part of the postal key
  // rather than a unique column beside it. Answering with one row would pick a
  // winner the data does not have.
  it("resolves every municipality the code reaches, with its chain", async () => {
    fetchMock.mockResolvedValueOnce(
      postgrestJson([{ location_id: "a" }, { location_id: "b" }]),
    );
    fetchMock.mockResolvedValueOnce(
      postgrestJson([
        {
          ...locationRows(1)[0],
          parent: {
            id: "district",
            name: "Marne",
            parent: { id: "country", name: "France", parent: null },
          },
        },
        locationRows(1, 1)[0],
      ]),
    );

    const rows = await service.getMunicipalitiesByPostalCode("FR", "51300");

    expect(requestedUrl(fetchMock.mock.calls[1][0]).searchParams.get("id")).toBe(
      "in.(a,b)",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].ancestors.map((node) => node.name)).toEqual([
      "Marne",
      "France",
    ]);
  });

  // An unknown code is a lookup that found nothing, not an error — and there is
  // nothing to resolve, so the second read must not be made at all.
  it("answers empty for a code no municipality carries, without a second read", async () => {
    fetchMock.mockResolvedValueOnce(postgrestJson([]));

    await expect(
      service.getMunicipalitiesByPostalCode("FI", "99999"),
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A half-typed code is a search that has not started, so it answers like one
  // rather than asking the database to match the empty string.
  it("makes no request at all for a blank code", async () => {
    await expect(
      service.getMunicipalitiesByPostalCode("FI", "   "),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws rather than reporting an unknown code when the read fails", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(
      service.getMunicipalitiesByPostalCode("FI", "00100"),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("LocationsService.getChildren", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
  });

  // A country is depth 0 of the tree: the rows with no parent. `eq` against
  // null matches nothing in SQL, so this filter has to be `is.null` — getting
  // it wrong yields an empty picker rather than an error.
  it("asks for the parentless rows when browsing the top of the tree", async () => {
    fetchMock.mockResolvedValue(postgrestPage(locationRows(2), { from: 0, total: 2 }));

    await service.getChildren(null);

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("parent_id")).toBe("is.null");
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });

  it("asks for one node's children when browsing into it", async () => {
    fetchMock.mockResolvedValue(postgrestPage(locationRows(3), { from: 0, total: 3 }));

    await service.getChildren("region-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("parent_id")).toBe("eq.region-1");
  });

  // Browsing is a read that *offers* places, at every level including the root,
  // so a retired row must not appear in either.
  it("leaves retired rows out of every browse level", async () => {
    // A fresh Response per call: a single canned one has its body read once and
    // is unusable on the second request.
    fetchMock.mockImplementation(() =>
      Promise.resolve(postgrestPage([], { from: 0, total: 0 })),
    );

    await service.getChildren(null);
    await service.getChildren("region-1");

    for (const call of fetchMock.mock.calls) {
      expect(requestedUrl(call[0]).searchParams.get("retired_at")).toBe(
        "is.null",
      );
    }
  });

  it("returns one page and reports the true total behind it", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(200), { from: 0, total: 812 }),
    );

    const page = await service.getChildren("district-1");

    expect(page.rows).toHaveLength(200);
    expect(page.total).toBe(812);
    expect(page.hasMore).toBe(true);
    // One request, not a walk: the payload is proportional to the screen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for the window the requested page names", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(200, 400), { from: 400, total: 812 }),
    );

    await service.getChildren("district-1", { page: 2 });

    expect(requestedRanges(fetchMock)).toEqual(["400:200"]);
  });

  it("reports no further page once the total is reached", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(locationRows(12, 400), { from: 400, total: 412 }),
    );

    const page = await service.getChildren("district-1", { page: 2 });

    expect(page.hasMore).toBe(false);
  });
});

describe("LocationsService.searchLocations", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
    vi.stubGlobal("fetch", fetchMock);
  });

  function searchResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // The floor is enforced in the database too. Applying it here as well is what
  // stops a typist from spending a request per letter before a needle could
  // mean anything.
  it("does not call the server at all below the minimum needle length", async () => {
    await expect(service.searchLocations("h")).resolves.toEqual({
      total: 0,
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only needle as no search", async () => {
    await expect(service.searchLocations("   ")).resolves.toEqual({
      total: 0,
      results: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the trimmed needle, the type filter and the cap as one stable URL", async () => {
    fetchMock.mockResolvedValue(
      searchResponse({ total: 0, results: [] }),
    );

    await service.searchLocations("  Lille ", {
      types: ["municipality", "district"],
      limit: 10,
    });

    // The service asks for a same-origin path, so there is no origin to parse
    // against here — a base is supplied purely to read the parts back out.
    const url = new URL(String(fetchMock.mock.calls[0][0]), "https://example.test");
    expect(url.pathname).toBe("/api/locations/search");
    expect(url.searchParams.get("q")).toBe("Lille");
    // One comma-separated parameter rather than repeated ones, so the same
    // request is always the same URL and therefore the same cache entry.
    expect(url.searchParams.get("types")).toBe("municipality,district");
    expect(url.searchParams.get("limit")).toBe("10");
    // Not asked for, not sent — an unrestricted search and a restricted one
    // have to be different URLs, which is what keeps them different cache
    // entries in the shared cache in front of the route.
    expect(url.searchParams.has("country")).toBe(false);
  });

  it("sends a country restriction to the server rather than filtering after", async () => {
    fetchMock.mockResolvedValue(searchResponse({ total: 0, results: [] }));

    await service.searchLocations("helsinki", { country: "FI" });

    const url = new URL(String(fetchMock.mock.calls[0][0]), "https://example.test");
    expect(url.searchParams.get("country")).toBe("FI");
  });

  it("parses the ranked answer, chains and all", async () => {
    fetchMock.mockResolvedValue(
      searchResponse({
        total: 47,
        results: [
          {
            id: "lille",
            name: "Lille",
            name_i18n: null,
            type: "municipality",
            parent_id: "nord",
            country_code: "FR",
            external_code: "59350",
            ancestors: [
              { id: "nord", name: "Nord", name_i18n: null, type: "district" },
            ],
          },
        ],
      }),
    );

    const result = await service.searchLocations("lille");

    expect(result.total).toBe(47);
    expect(result.results[0].ancestors[0].name).toBe("Nord");
  });

  it("throws rather than returning a half-understood answer", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    await expect(service.searchLocations("lille")).rejects.toThrow();
  });
});

// Column discipline, in two sweeps over two different populations — kept apart
// because the claims are not the same claim.
//
// The first is about *every read this service makes*, whichever table it starts
// from. `*` drags the generated `search_blob` fold along — the longest value on
// a row, on every row of a 200-row browse page, and read by nothing outside the
// database — and `geonames_id`, `retired_at` and `depth` are the database's own
// business, decided by filters rather than rendered by anything. The `Location`
// alias states that intent but cannot enforce it: `select("*")` returns a wider
// row, and assigning a wider row to a narrower type compiles happily.
//
// The second is about the reads that actually select a `locations` row, and
// anchors the negatives above: a select asking for nothing recognisable would
// satisfy every "not contains" in the file.
//
// The postal lookup is in the first list and not the second, which is the shape
// worth noticing: it reads `postal_codes`, names one column of it, and joins
// `locations` only to apply the retired filter — so it must obey the column
// rules without ever selecting a location row's columns.

const READS: [string, (service: LocationsService) => Promise<unknown>][] = [
  ["getLocation", (s) => s.getLocation("loc-0")],
  ["getChildren (root)", (s) => s.getChildren(null)],
  ["getChildren (node)", (s) => s.getChildren("loc-0")],
  ["getSitesByParent", (s) => s.getSitesByParent("loc-0")],
  ["getMunicipalitiesByCountry", (s) => s.getMunicipalitiesByCountry("FI")],
  ["getLocationsByIds", (s) => s.getLocationsByIds(["loc-0"])],
  [
    "getMunicipalitiesByPostalCode",
    (s) => s.getMunicipalitiesByPostalCode("FI", "00100"),
  ],
];

/** The subset of the above that selects `locations` row columns. */
const LOCATION_ROW_READS = READS.filter(
  ([name]) => name !== "getMunicipalitiesByPostalCode",
);

describe("LocationsService column discipline", () => {
  let fetchMock: FetchMock;
  let service: LocationsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new LocationsService(createFetchStubbedClient(fetchMock));
    // A fresh Response per call: the postal lookup makes two requests, and a
    // single canned one has its body read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(postgrestPage(locationRows(1), { from: 0, total: 1 })),
    );
  });

  it.each(READS)(
    "%s names its columns and omits the fold and the supply columns",
    async (_name, read) => {
      await read(service);

      for (const call of fetchMock.mock.calls) {
        const select = requestedUrl(call[0]).searchParams.get("select") ?? "";

        // Not `*` at the top level, and not `*` inside an embed either.
        expect(select).not.toContain("*");
        expect(select).not.toContain("search_blob");
        // The GeoNames groundwork columns are read by nothing on any surface.
        // `retired_at` decides which rows a read offers, which is a filter —
        // it appears in this method's query string, never in its select.
        expect(select).not.toContain("geonames_id");
        expect(select).not.toContain("retired_at");
        expect(select).not.toContain("depth");
      }
    },
  );

  it.each(LOCATION_ROW_READS)(
    "%s asks for the columns a location row is made of",
    async (_name, read) => {
      await read(service);

      const select =
        requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ??
        "";

      expect(select).toContain("external_code");
      expect(select).toContain("created_at");
    },
  );
});
