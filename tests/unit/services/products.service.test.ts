import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProductsService } from "@/services/products/products.service";
import type { Database } from "@/types/database.types";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

describe("ProductsService.listVisibleByTypes", () => {
  function createMockSupabase() {
    return { from: vi.fn(), rpc: vi.fn(), auth: { getClaims: vi.fn() } };
  }

  // Wire up the from().select().in().eq().in().order() chain to resolve with
  // `result`, mirroring the real query shape in listVisibleByTypes.
  function mockQuery(
    mockSupabase: ReturnType<typeof createMockSupabase>,
    result: unknown,
  ) {
    const order = vi.fn().mockResolvedValue(result);
    const inStatus = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: inStatus });
    const inType = vi.fn().mockReturnValue({ eq });
    const select = vi.fn().mockReturnValue({ in: inType });
    mockSupabase.from.mockReturnValue({ select });
  }

  // Minimal product row carrying only the columns effectiveStatus() reads.
  // (listVisibleByTypes casts the query result to ProductBrowseRow[], so the
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

  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: ProductsService;

  beforeEach(() => {
    // Freeze "now" so end_date comparisons are deterministic. Helsinki is
    // UTC+3 in June, so 09:00Z is the same calendar day (2026-06-04) locally.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T09:00:00.000Z"));
    mockSupabase = createMockSupabase();
    service = new ProductsService(
      mockSupabase as unknown as SupabaseClient<Database>,
    );
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
    mockQuery(mockSupabase, mockSupabaseSuccess(rows));

    const result = await service.listVisibleByTypes(["consumer_club"]);

    expect(result.map((r) => r.id)).toEqual(["future", "open-ended"]);
  });

  it("keeps a product whose end_date is today (ends end-of-day local)", async () => {
    const rows = [
      row({ id: "ends-today", status: "running", end_date: "2026-06-04" }),
    ];
    mockQuery(mockSupabase, mockSupabaseSuccess(rows));

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
    mockQuery(mockSupabase, mockSupabaseSuccess(rows));

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
    mockQuery(mockSupabase, mockSupabaseSuccess(rows));

    const result = await service.listVisibleByTypes(["consumer_club"]);

    expect(result.map((r) => r.id)).toEqual(["kiritimati-today"]);
  });

  it("throws when the query errors", async () => {
    mockQuery(mockSupabase, mockSupabaseError("boom"));

    await expect(
      service.listVisibleByTypes(["consumer_club"]),
    ).rejects.toThrow();
  });
});
