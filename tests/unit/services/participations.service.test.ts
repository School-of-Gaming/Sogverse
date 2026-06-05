import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ParticipationsService } from "@/services/participations/participations.service";
import type { Database } from "@/types/database.types";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

describe("ParticipationsService.getParticipationsForGamers", () => {
  function createMockSupabase() {
    return { from: vi.fn(), rpc: vi.fn(), auth: { getClaims: vi.fn() } };
  }

  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: ParticipationsService;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new ParticipationsService(
      mockSupabase as unknown as SupabaseClient<Database>,
    );
  });

  it("returns [] for empty input without touching the database", async () => {
    const result = await service.getParticipationsForGamers([]);
    expect(result).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("queries participations filtered by the given gamer ids", async () => {
    const rows = [
      {
        id: "part-1",
        gamer_id: "g1",
        status: "active",
        signed_up_at: "2026-01-01T00:00:00.000Z",
        product: {
          id: "prod-1",
          product_type: "camp",
          product_translations: [{ locale: "en", name: "Summer Camp" }],
        },
        group: { name: "Group A" },
      },
    ];

    // Chain: from().select().in().order().order() → { data, error }
    const order2 = vi.fn().mockResolvedValue(mockSupabaseSuccess(rows));
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const inFn = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ in: inFn });
    mockSupabase.from.mockReturnValue({ select });

    const result = await service.getParticipationsForGamers(["g1", "g2"]);

    expect(mockSupabase.from).toHaveBeenCalledWith("participations");
    expect(inFn).toHaveBeenCalledWith("gamer_id", ["g1", "g2"]);
    expect(result).toEqual(rows);
  });

  it("throws when the query errors", async () => {
    const order2 = vi.fn().mockResolvedValue(mockSupabaseError("boom"));
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const inFn = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ in: inFn });
    mockSupabase.from.mockReturnValue({ select });

    await expect(
      service.getParticipationsForGamers(["g1"]),
    ).rejects.toThrow();
  });
});

describe("ParticipationsService.getMyUpcomingSessions", () => {
  function createMockSupabase() {
    return { from: vi.fn(), rpc: vi.fn(), auth: { getClaims: vi.fn() } };
  }

  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let service: ParticipationsService;

  // Chain: from().select().eq(audienceColumn, userId).eq("status", "active")
  function mockParticipationsQuery(rows: unknown[]) {
    const eq2 = vi.fn().mockResolvedValue(mockSupabaseSuccess(rows));
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    mockSupabase.from.mockReturnValue({ select });
  }

  function rawRow(id: string, gamerFirstName: string) {
    return {
      id,
      gamer_id: `gamer-${id}`,
      group_id: "group-1",
      product: {
        id: "prod-1",
        product_type: "consumer_club",
        timezone: "UTC",
        start_date: null,
        end_date: null,
        padlet_url: null,
        is_remote: true,
        product_translations: [],
        schedule_slots: [],
      },
      gamer: { first_name: gamerFirstName, username: null },
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new ParticipationsService(
      mockSupabase as unknown as SupabaseClient<Database>,
    );
    mockSupabase.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
    });
  });

  it("flags only the participations returned by the payment-problem RPC", async () => {
    mockParticipationsQuery([rawRow("p1", "Alex"), rawRow("p2", "Bobby")]);
    mockSupabase.rpc.mockResolvedValue(
      mockSupabaseSuccess([{ participation_id: "p1" }]),
    );

    const result = await service.getMyUpcomingSessions("customer");

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "get_my_payment_problem_participations",
    );
    expect(result.find((r) => r.gamer.firstName === "Alex")?.paymentProblem).toBe(
      true,
    );
    expect(
      result.find((r) => r.gamer.firstName === "Bobby")?.paymentProblem,
    ).toBe(false);
  });

  it("degrades to no payment problem (and does not throw) when the RPC errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockParticipationsQuery([rawRow("p1", "Alex")]);
    mockSupabase.rpc.mockResolvedValue(mockSupabaseError("boom"));

    const result = await service.getMyUpcomingSessions("customer");

    expect(result[0].paymentProblem).toBe(false);
    consoleError.mockRestore();
  });
});
