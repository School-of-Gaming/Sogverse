import { describe, it, expect, vi, beforeEach } from "vitest";
import { SitesService } from "@/services/sites/sites.service";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// Same arrangement as the locations service tests: the REAL Supabase client
// over a fake fetch transport, so the genuine query builder constructs each
// PostgREST request and the mock only supplies canned wire responses.

/** A products row as the site page's list read receives it. */
function productRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    product_type: "consumer_club",
    status: "running",
    is_visible: true,
    product_translations: [{ locale: "en", name: `Product ${id}` }],
    ...overrides,
  };
}

describe("SitesService.getSiteNotes", () => {
  let fetchMock: FetchMock;
  let service: SitesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new SitesService(createFetchStubbedClient(fetchMock));
  });

  // The two halves have two audiences and two policies, so they are two reads
  // rather than one embed — and both are keyed by the site the caller named.
  it("reads both detail tables by location, naming its columns", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        requestedUrl(input).pathname.includes("site_staff_details")
          ? postgrestJson({ notes: "Keys are in the office." })
          : postgrestJson({ address: "Kirkkokatu 1", notes: "Side door." }),
      ),
    );

    const notes = await service.getSiteNotes("site-1");

    expect(notes).toEqual({
      address: "Kirkkokatu 1",
      memberNote: "Side door.",
      staffNote: "Keys are in the office.",
    });

    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    const member = urls.find((url) =>
      url.pathname.includes("site_details"),
    );
    const staff = urls.find((url) =>
      url.pathname.includes("site_staff_details"),
    );
    expect(member?.searchParams.get("location_id")).toBe("eq.site-1");
    expect(staff?.searchParams.get("location_id")).toBe("eq.site-1");
    // Not `*`: the rows' timestamps answer nothing this surface asks, and
    // `location_id` is the filter the caller already supplied.
    expect(member?.searchParams.get("select")).toBe("address,notes");
    expect(staff?.searchParams.get("select")).toBe("notes");
  });

  // Both rows are sparse — a site nobody has written anything about has
  // neither — which is the overwhelmingly common state and not an error.
  it("answers three empty fields when neither row exists", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(postgrestJson(null)));

    await expect(service.getSiteNotes("site-1")).resolves.toEqual({
      address: null,
      memberNote: null,
      staffNote: null,
    });
  });

  // Half an answer is worse than none: a caller shown empty notes would save
  // that emptiness back over two paragraphs somebody wrote.
  it("throws rather than returning half the answer when one read fails", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        requestedUrl(input).pathname.includes("site_staff_details")
          ? postgrestError("boom")
          : postgrestJson({ address: null, notes: "Side door." }),
      ),
    );

    await expect(service.getSiteNotes("site-1")).rejects.toMatchObject({
      message: "boom",
    });
  });
});

describe("SitesService.getProductsAtSite", () => {
  let fetchMock: FetchMock;
  let service: SitesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new SitesService(createFetchStubbedClient(fetchMock));
  });

  // A site is a leaf, so equality on `location_id` is exact here — the rule
  // against it governs *municipality* membership, where an in-person club
  // points one level deeper.
  it("filters on the site and imposes a total order", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage([productRow("p1")], { from: 0, total: 1 }),
    );

    await service.getProductsAtSite("site-1");

    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toContain("products");
    expect(url.searchParams.get("location_id")).toBe("eq.site-1");
    // `created_at` ties across rows written in one transaction, so the primary
    // key rides behind it.
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
  });

  // The page renders the whole list and nothing about the query bounds it, so
  // the read must page rather than trust a short response.
  it("asks for an exact count, which is what makes a short page mean 'done'", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage([productRow("p1")], { from: 0, total: 1 }),
    );

    await service.getProductsAtSite("site-1");

    const [, init] = fetchMock.mock.calls[0];
    expect(String(new Headers(init?.headers).get("prefer"))).toContain(
      "count=exact",
    );
  });

  it("returns the rows the page renders and nothing wider", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage([productRow("p1"), productRow("p2")], {
        from: 0,
        total: 2,
      }),
    );

    const rows = await service.getProductsAtSite("site-1");

    expect(rows.map((row) => row.id)).toEqual(["p1", "p2"]);
    const select =
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("select") ?? "";
    expect(select).not.toContain("*");
    expect(select).toContain("product_translations(locale,name)");
  });
});

describe("SitesService.getProductCountsBySite", () => {
  let fetchMock: FetchMock;
  let service: SitesService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new SitesService(createFetchStubbedClient(fetchMock));
  });

  it("makes no request at all for an empty page", async () => {
    await expect(service.getProductCountsBySite([])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for each site once, whatever the caller passed", async () => {
    fetchMock.mockResolvedValue(postgrestPage([], { from: 0, total: 0 }));

    await service.getProductCountsBySite(["b", "a", "b"]);

    expect(
      requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("location_id"),
    ).toBe("in.(a,b)");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // PostgREST has no GROUP BY, so the tally happens here — over a set the
  // caller's page bounds, never over the table.
  it("tallies the rows per site", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(
        [
          { location_id: "a" },
          { location_id: "a" },
          { location_id: "b" },
        ],
        { from: 0, total: 3 },
      ),
    );

    await expect(
      service.getProductCountsBySite(["a", "b"]),
    ).resolves.toEqual({ a: 2, b: 1 });
  });

  // Zero has to be an answer rather than an absence, or a site with nothing at
  // it is indistinguishable from one whose tally has not landed.
  it("gives every requested site an entry, including the empty ones", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage([{ location_id: "a" }], { from: 0, total: 1 }),
    );

    await expect(
      service.getProductCountsBySite(["a", "b", "c"]),
    ).resolves.toEqual({ a: 1, b: 0, c: 0 });
  });

  it("throws rather than reporting every site as empty when the read fails", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(
      service.getProductCountsBySite(["a"]),
    ).rejects.toMatchObject({ message: "boom" });
  });

  // The caller holds every site there is, so an unchunked `in.(…)` grows with
  // the table until a proxy refuses the URL. Zero-padded ids so the sorted
  // order the service imposes is the order they were generated in.
  const manyIds = Array.from(
    { length: 150 },
    (_, i) => `site-${String(i).padStart(3, "0")}`,
  );

  it("splits the key list into chunks no request could outgrow", async () => {
    // A fresh Response per call: this read makes two requests, and a single
    // canned one has its body read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(postgrestPage([], { from: 0, total: 0 })),
    );

    await service.getProductCountsBySite(manyIds);

    const filters = fetchMock.mock.calls.map(([input]) =>
      requestedUrl(input).searchParams.get("location_id"),
    );
    expect(filters).toHaveLength(2);
    expect(filters[0]).toBe(`in.(${manyIds.slice(0, 100).join(",")})`);
    expect(filters[1]).toBe(`in.(${manyIds.slice(100).join(",")})`);
  });

  // A chunk is bounded as a *request*, not as a response: a hundred sites can
  // carry any number of products between them, so each chunk is still walked.
  it("tallies across every chunk, and every id still gets an entry", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        requestedUrl(input).searchParams
          .get("location_id")
          ?.includes("site-100")
          ? postgrestPage([{ location_id: "site-100" }], {
              from: 0,
              total: 1,
            })
          : postgrestPage(
              [{ location_id: "site-000" }, { location_id: "site-000" }],
              { from: 0, total: 2 },
            ),
      ),
    );

    const counts = await service.getProductCountsBySite(manyIds);

    expect(Object.keys(counts)).toHaveLength(150);
    expect(counts["site-000"]).toBe(2);
    expect(counts["site-100"]).toBe(1);
    expect(counts["site-042"]).toBe(0);
  });
});
