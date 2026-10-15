import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ADMIN_PRODUCT_LIST_PAGE_SIZE,
  ProductsService,
  type AdminProductListFilters,
} from "@/services/products/products.service";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// The admin product list's two reads, run through the REAL Supabase client over
// a fake fetch transport (tests/mocks/postgrest-fetch.ts), so the assertions are
// on the PostgREST request the genuine query builder produced.
//
// What they pin for the page read is the caller's half of the keyset contract —
// the order and the cursor filter agreeing, with the id tiebreaker — and that
// every filter arrives as its own parameter, so none of them can collide with
// the cursor's top-level `or`.

const PRODUCTS_PATH = "/rest/v1/products";
const ASSIGNMENTS_PATH = "/rest/v1/gedu_group_assignments";
const TRAINEES_PATH = "/rest/v1/gedu_group_trainees";

const NO_FILTERS: AdminProductListFilters = {
  type: null,
  search: "",
  weekday: null,
  geduId: null,
  spokenLanguage: null,
  municipalityId: null,
};

/** Rows carrying only what a cursor is derived from; the read passes them through. */
function listRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `product-${i}`,
    created_at: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
  }));
}

describe("ProductsService.getAdminListPage", () => {
  let fetchMock: FetchMock;
  let service: ProductsService;

  function firstUrl(): URL {
    return requestedUrl(fetchMock.mock.calls[0][0]);
  }

  /** Every URL the read requested of one table. */
  function urlsOf(path: string): URL[] {
    return fetchMock.mock.calls
      .map(([input]) => requestedUrl(input))
      .filter((url) => url.pathname === path);
  }

  /**
   * Answers each seat table with the product ids given for it, or an error,
   * and the products read with one page.
   */
  function mockSeats(
    assignments: readonly string[] | "error",
    trainees: readonly string[] | "error",
  ) {
    fetchMock.mockImplementation((input) => {
      const path = requestedUrl(input).pathname;
      if (path === PRODUCTS_PATH) {
        return Promise.resolve(postgrestPage(listRows(1), { from: 0, total: 1 }));
      }
      const ids = path === ASSIGNMENTS_PATH ? assignments : trainees;
      return Promise.resolve(
        ids === "error"
          ? postgrestError("boom")
          : postgrestJson(ids.map((product_id) => ({ product_id }))),
      );
    });
  }

  /** The count preference the read asked for, or "null" when it asked for none. */
  function countPreference(): string {
    return String(new Headers(fetchMock.mock.calls[0][1]?.headers).get("prefer"));
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new ProductsService(createFetchStubbedClient(fetchMock));
  });

  it("reads one keyset page of products, newest first with the id tiebreaker", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(3), { from: 0, total: 3 }));

    await service.getAdminListPage(NO_FILTERS);

    const url = firstUrl();
    expect(url.pathname).toBe("/rest/v1/products");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    expect(url.searchParams.get("limit")).toBe(String(ADMIN_PRODUCT_LIST_PAGE_SIZE));
    expect(url.searchParams.getAll("or")).toEqual([]);
  });

  // The filter embeds are empty and unconstrained when nothing narrows the
  // list, so every product passes them.
  it("sends no filter at all when nothing narrows the list", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage(NO_FILTERS);

    expect([...firstUrl().searchParams.keys()].sort()).toEqual([
      "limit",
      "order",
      "select",
    ]);
  });

  it("asks for an exact count on the first page and reports it", async () => {
    fetchMock.mockResolvedValue(
      postgrestPage(listRows(ADMIN_PRODUCT_LIST_PAGE_SIZE), { from: 0, total: 87 }),
    );

    const page = await service.getAdminListPage(NO_FILTERS);

    expect(countPreference()).toContain("count=exact");
    expect(page.total).toBe(87);
  });

  // The count cannot change as the reader scrolls, so it is not paid per page;
  // `null` afterwards means "not asked", never "none".
  it("asks for no count once a cursor is carried, and reports none", async () => {
    fetchMock.mockResolvedValue(postgrestJson(listRows(2)));

    const page = await service.getAdminListPage(NO_FILTERS, {
      cursor: { createdAt: "2026-01-02T00:00:00.000Z", id: "product-24" },
    });

    expect(countPreference()).not.toContain("count=exact");
    expect(page.total).toBeNull();
  });

  it("resumes strictly after the cursor it was handed, verbatim", async () => {
    fetchMock.mockResolvedValue(postgrestJson(listRows(1)));

    await service.getAdminListPage(NO_FILTERS, {
      cursor: { createdAt: "2026-09-18T08:43:12.123456+00:00", id: "product-24" },
    });

    expect(firstUrl().searchParams.getAll("or")).toEqual([
      '(created_at.lt."2026-09-18T08:43:12.123456+00:00",and(created_at.eq."2026-09-18T08:43:12.123456+00:00",id.gt."product-24"))',
    ]);
  });

  it("filters the type and the language as equalities on the product", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage({
      ...NO_FILTERS,
      type: "consumer_club",
      spokenLanguage: "sv",
    });

    const url = firstUrl();
    expect(url.searchParams.get("product_type")).toBe("eq.consumer_club");
    expect(url.searchParams.get("spoken_language_code")).toBe("eq.sv");
  });

  // Each filter over a product's children goes on its own aliased empty embed,
  // never on the embed the row renders — a club on Monday and Wednesday
  // filtered to Monday must still show both days.
  it("matches the search against any one of the product's names", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage({ ...NO_FILTERS, search: "  blox c " });

    const url = firstUrl();
    expect(url.searchParams.get("name_match.name")).toBe("ilike.%blox c%");
    expect(url.searchParams.get("name_match")).toBe("not.is.null");
    expect(url.searchParams.has("product_translations.name")).toBe(false);
  });

  // `%` and `_` are SQL's wildcards and are escaped; `*` is PostgREST's, which
  // cannot be escaped, so it is dropped.
  it.each([
    ["100%", "ilike.%100\\%%"],
    ["a_b", "ilike.%a\\_b%"],
    ["Club*", "ilike.%Club%"],
  ])("does not let a wildcard in %s widen the search", async (typed, expected) => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage({ ...NO_FILTERS, search: typed });

    expect(firstUrl().searchParams.get("name_match.name")).toBe(expected);
  });

  it("sends no search for a needle of only wildcards and spaces", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage({ ...NO_FILTERS, search: " * " });

    expect(firstUrl().searchParams.has("name_match")).toBe(false);
  });

  it("filters the weekday on its own schedule embed", async () => {
    fetchMock.mockResolvedValue(postgrestPage(listRows(1), { from: 0, total: 1 }));

    await service.getAdminListPage({ ...NO_FILTERS, weekday: 0 });

    const url = firstUrl();
    expect(url.searchParams.get("day_match.weekday")).toBe("eq.0");
    expect(url.searchParams.get("day_match")).toBe("not.is.null");
    expect(url.searchParams.has("schedule_slots.weekday")).toBe(false);
  });

  // A gedu's seat is an assignment or a trainee seat — two tables, so an `or`
  // across two embeds, which only the top level could hold. The products they
  // are seated on are read first and the list is narrowed to those ids.
  it("reads the gedu's seats from both seat tables, by the gedu's id", async () => {
    mockSeats(["product-a"], ["product-b"]);

    await service.getAdminListPage({ ...NO_FILTERS, geduId: "gedu-1" });

    for (const path of [ASSIGNMENTS_PATH, TRAINEES_PATH]) {
      const [url] = urlsOf(path);
      expect(url.searchParams.get("gedu_id")).toBe("eq.gedu-1");
      expect(url.searchParams.get("select")).toBe("product_id");
    }
  });

  it("narrows the list to the products the gedu is assigned to or a trainee on", async () => {
    mockSeats(["product-a", "product-c"], ["product-b"]);

    await service.getAdminListPage({ ...NO_FILTERS, geduId: "gedu-1" });

    const [url] = urlsOf(PRODUCTS_PATH);
    expect(url.searchParams.get("id")).toBe("in.(product-a,product-c,product-b)");
    expect(url.searchParams.getAll("or")).toEqual([]);
  });

  it("matches a gedu who holds only trainee seats", async () => {
    mockSeats([], ["product-b"]);

    await service.getAdminListPage({ ...NO_FILTERS, geduId: "gedu-1" });

    expect(urlsOf(PRODUCTS_PATH)[0].searchParams.get("id")).toBe("in.(product-b)");
  });

  // An empty list keeps no product — never "no filter".
  it("keeps no product for a gedu with no seat anywhere", async () => {
    mockSeats([], []);

    await service.getAdminListPage({ ...NO_FILTERS, geduId: "gedu-1" });

    expect(urlsOf(PRODUCTS_PATH)[0].searchParams.get("id")).toBe("in.()");
  });

  it("keeps the cursor's or the only top-level one under the gedu filter", async () => {
    mockSeats(["product-a"], []);

    await service.getAdminListPage(
      { ...NO_FILTERS, geduId: "gedu-1" },
      { cursor: { createdAt: "2026-01-02T00:00:00.000Z", id: "product-24" } },
    );

    expect(urlsOf(PRODUCTS_PATH)[0].searchParams.getAll("or")).toHaveLength(1);
  });

  it.each([
    ["assignments", "error", []],
    ["trainee seats", [], "error"],
  ] as const)(
    "throws when the %s read fails, rather than listing fewer products",
    async (_table, assignments, trainees) => {
      mockSeats(assignments, trainees);

      await expect(
        service.getAdminListPage({ ...NO_FILTERS, geduId: "gedu-1" }),
      ).rejects.toMatchObject({ message: "boom" });
      expect(urlsOf(PRODUCTS_PATH)).toEqual([]);
    },
  );

  // The location is the municipality itself (online) or a site under it. That
  // `or` is scoped to its embed, so the cursor keeps the only top-level one,
  // and its value is quoted because it comes off the URL.
  it("filters the municipality with an or scoped to its embed, quoted", async () => {
    fetchMock.mockResolvedValue(postgrestJson(listRows(1)));

    await service.getAdminListPage(
      { ...NO_FILTERS, municipalityId: "muni,1" },
      { cursor: { createdAt: "2026-01-02T00:00:00.000Z", id: "product-24" } },
    );

    const url = firstUrl();
    expect(url.searchParams.get("municipality_match.or")).toBe(
      '(id.eq."muni,1",parent_id.eq."muni,1")',
    );
    expect(url.searchParams.get("municipality_match")).toBe("not.is.null");
    expect(url.searchParams.getAll("or")).toHaveLength(1);
  });

  it("composes every filter into one products request", async () => {
    mockSeats(["product-a"], ["product-b"]);

    await service.getAdminListPage({
      type: "municipality_club",
      search: "kerho",
      weekday: 2,
      geduId: "gedu-1",
      spokenLanguage: "fi",
      municipalityId: "muni-1",
    });

    const products = urlsOf(PRODUCTS_PATH);
    expect(products).toHaveLength(1);
    const [url] = products;
    expect(url.searchParams.get("product_type")).toBe("eq.municipality_club");
    expect(url.searchParams.get("name_match.name")).toBe("ilike.%kerho%");
    expect(url.searchParams.get("day_match.weekday")).toBe("eq.2");
    expect(url.searchParams.get("id")).toBe("in.(product-a,product-b)");
    expect(url.searchParams.get("spoken_language_code")).toBe("eq.fi");
    expect(url.searchParams.get("municipality_match.or")).toBe(
      '(id.eq."muni-1",parent_id.eq."muni-1")',
    );
  });

  it("throws a PostgREST error rather than answering with no rows", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(service.getAdminListPage(NO_FILTERS)).rejects.toMatchObject({
      message: "boom",
    });
  });
});

describe("ProductsService.getListFacets", () => {
  let fetchMock: FetchMock;
  let service: ProductsService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new ProductsService(createFetchStubbedClient(fetchMock));
  });

  const ROW = {
    product_type: "municipality_club",
    product_count: 4,
    gedu_ids: ["gedu-1"],
    weekdays: [0, 2],
    spoken_language_codes: ["fi"],
    municipalities: [
      { id: "muni-1", name: "Espoo", name_i18n: { sv: "Esbo" }, type: "municipality" },
    ],
  };

  it("reads the facets view and parses its rows", async () => {
    fetchMock.mockResolvedValue(postgrestJson([ROW]));

    const facets = await service.getListFacets();

    expect(requestedUrl(fetchMock.mock.calls[0][0]).pathname).toBe(
      "/rest/v1/product_list_facets",
    );
    expect(facets).toEqual([ROW]);
  });

  // The view's columns are nullable in the generated types and the
  // municipalities are jsonb, so the parse is what holds the shape.
  it("refuses a row whose shape the view stopped guaranteeing", async () => {
    fetchMock.mockResolvedValue(postgrestJson([{ ...ROW, gedu_ids: null }]));

    await expect(service.getListFacets()).rejects.toThrow();
  });
});
