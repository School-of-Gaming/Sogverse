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

  it("queries participations_v2 filtered by the given gamer ids", async () => {
    const rows = [
      {
        id: "part-1",
        gamer_id: "g1",
        status: "active",
        signed_up_at: "2026-01-01T00:00:00.000Z",
        product: {
          id: "prod-1",
          product_type: "camp",
          product_translations_v2: [{ locale: "en", name: "Summer Camp" }],
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

    expect(mockSupabase.from).toHaveBeenCalledWith("participations_v2");
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
