import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProductsService } from "@/services/products/products.service";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

describe("ProductsService.listVisibleByTypes", () => {
  // These tests run the REAL Supabase client over a fake fetch transport (see
  // tests/mocks/postgrest-fetch.ts): the genuine query builder constructs the
  // PostgREST request, the mock answers with canned row JSON, and the client
  // parses it — so the full read path is exercised with no casts.
  let fetchMock: FetchMock;
  let service: ProductsService;

  // Minimal product row carrying only the columns effectiveStatus() reads.
  // (The canned wire JSON doesn't need every ProductBrowseRow column — the
  // runtime filter only ever touches these fields.)
  function row(overrides: {
    id: string;
    status: string;
    end_date: string | null;
    start_date?: string | null;
    signup_threshold?: number | null;
    timezone?: string;
  }) {
    return {
      start_date: null,
      signup_threshold: null,
      timezone: "Europe/Helsinki",
      ...overrides,
    };
  }

  beforeEach(() => {
    // Freeze "now" so end_date comparisons are deterministic. Helsinki is
    // UTC+3 in June, so 09:00Z is the same calendar day (2026-06-04) locally.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T09:00:00.000Z"));
    fetchMock = vi.fn<typeof fetch>();
    service = new ProductsService(createFetchStubbedClient(fetchMock));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides running products whose end_date has already passed", async () => {
    const rows = [
      row({ id: "past", status: "running", end_date: "2026-06-03" }),
      row({ id: "future", status: "running", end_date: "2026-12-31" }),
      row({ id: "open-ended", status: "running", end_date: null }),
    ];
    fetchMock.mockResolvedValue(postgrestJson(rows));

    const result = await service.listVisibleByTypes(["consumer_club"]);

    // The real builder issued the browse query with its type + status filters.
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/products");
    expect(url.searchParams.get("product_type")).toBe("in.(consumer_club)");
    expect(url.searchParams.get("is_visible")).toBe("eq.true");

    expect(result.map((r) => r.id)).toEqual(["future", "open-ended"]);
  });

  it("keeps a product whose end_date is today (ends end-of-day local)", async () => {
    const rows = [
      row({ id: "ends-today", status: "running", end_date: "2026-06-04" }),
    ];
    fetchMock.mockResolvedValue(postgrestJson(rows));

    const result = await service.listVisibleByTypes(["camp"]);

    expect(result.map((r) => r.id)).toEqual(["ends-today"]);
  });

  it("hides a pending product whose end_date passed without ever starting (expired)", async () => {
    const rows = [
      row({
        id: "expired",
        status: "pending",
        start_date: "2026-01-01",
        signup_threshold: 5,
        end_date: "2026-06-03",
      }),
      row({
        id: "pending-future",
        status: "pending",
        start_date: "2026-07-01",
        end_date: "2026-08-01",
      }),
    ];
    fetchMock.mockResolvedValue(postgrestJson(rows));

    const result = await service.listVisibleByTypes(["event"]);

    expect(result.map((r) => r.id)).toEqual(["pending-future"]);
  });

  it("respects the product's own timezone at the day boundary", async () => {
    // Now is 2026-06-04T09:00Z. In Pacific/Kiritimati (UTC+14) it's already
    // 2026-06-04 23:00, so an end_date of 2026-06-03 has clearly passed; in a
    // far-west zone the same instant could still be 2026-06-03. We assert the
    // product's zone is what decides — the Kiritimati row ends 2026-06-04 and
    // must survive (today, not past), the Helsinki row ended 2026-06-03.
    const rows = [
      row({
        id: "kiritimati-today",
        status: "running",
        end_date: "2026-06-04",
        timezone: "Pacific/Kiritimati",
      }),
      row({
        id: "helsinki-past",
        status: "running",
        end_date: "2026-06-03",
        timezone: "Europe/Helsinki",
      }),
    ];
    fetchMock.mockResolvedValue(postgrestJson(rows));

    const result = await service.listVisibleByTypes(["consumer_club"]);

    expect(result.map((r) => r.id)).toEqual(["kiritimati-today"]);
  });

  it("throws when the query errors", async () => {
    fetchMock.mockResolvedValue(postgrestError("boom"));

    await expect(
      service.listVisibleByTypes(["consumer_club"]),
    ).rejects.toThrow();
  });

  // The narrow half of the same listing, for a caller that wants only where
  // each product is. Two claims worth pinning: it asks for none of the payload
  // a card renders, and it answers the visibility question identically —
  // "which products are on sale" must not depend on how much of the row was
  // requested.
  describe("listVisibleLocationsByTypes", () => {
    function selectOf(call: number) {
      return (
        requestedUrl(fetchMock.mock.calls[call][0]).searchParams.get("select") ??
        ""
      );
    }

    it("selects the location chain and the lifecycle columns, nothing else", async () => {
      fetchMock.mockResolvedValue(postgrestJson([]));

      await service.listVisibleLocationsByTypes(["municipality_club"]);

      const select = selectOf(0);
      expect(select).toContain("locations(");
      expect(select).toContain("parent:parent_id(");
      for (const column of [
        "status",
        "start_date",
        "end_date",
        "signup_threshold",
        "timezone",
      ]) {
        expect(select).toContain(column);
      }
      // The payload the landing page was paying for and never opened.
      expect(select).not.toContain("*");
      expect(select).not.toContain("product_translations");
      expect(select).not.toContain("product_prices");
      expect(select).not.toContain("schedule_slots");
    });

    it("applies the same visibility filters as the full listing", async () => {
      // A fresh Response per call: both reads consume a body, and a single
      // canned one has its body read once.
      fetchMock.mockImplementation(() => Promise.resolve(postgrestJson([])));

      await service.listVisibleByTypes(["municipality_club"]);
      await service.listVisibleLocationsByTypes(["municipality_club"]);

      const full = requestedUrl(fetchMock.mock.calls[0][0]);
      const narrow = requestedUrl(fetchMock.mock.calls[1][0]);
      for (const param of ["product_type", "is_visible", "status", "order"]) {
        expect(narrow.searchParams.get(param)).toBe(
          full.searchParams.get(param),
        );
      }
    });

    it("drops ended products exactly as the full listing does", async () => {
      const rows = [
        row({ id: "past", status: "running", end_date: "2026-06-03" }),
        row({ id: "future", status: "running", end_date: "2026-12-31" }),
      ];
      fetchMock.mockResolvedValue(postgrestJson(rows));

      const result = await service.listVisibleLocationsByTypes([
        "municipality_club",
      ]);

      // `id` isn't in the narrow select, so the surviving row is named by the
      // lifecycle column the filter actually turned on.
      expect(result.map((r) => r.end_date)).toEqual(["2026-12-31"]);
    });

    it("throws when the query errors", async () => {
      fetchMock.mockResolvedValue(postgrestError("boom"));

      await expect(
        service.listVisibleLocationsByTypes(["municipality_club"]),
      ).rejects.toThrow();
    });
  });
});
