import { describe, it, expect, vi, beforeEach } from "vitest";
import { GroupsService } from "@/services/groups/groups.service";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

describe("GroupsService", () => {
  let service: GroupsService;
  let mockSupabase: { rpc: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSupabase = { rpc: vi.fn() };
    service = new GroupsService(mockSupabase as any);
  });

  describe("getProductGroups", () => {
    it("reshapes flat RPC rows into nested groups sorted by displayOrder", async () => {
      const flatRows = [
        {
          group_id: "g2",
          product_id: "p1",
          gedu_id: "gedu-2",
          display_order: 1,
          gedu_display_name: "Bob",
          gedu_email: "bob@test.com",
          gamer_id: null,
          gamer_display_name: null,
          enrollment_id: null,
          gamer_date_of_birth: null,
          gamer_gender: null,
        },
        {
          group_id: "g1",
          product_id: "p1",
          gedu_id: "gedu-1",
          display_order: 0,
          gedu_display_name: "Alice",
          gedu_email: "alice@test.com",
          gamer_id: "gamer-1",
          gamer_display_name: "Kid A",
          enrollment_id: "e1",
          gamer_date_of_birth: "2015-01-01",
          gamer_gender: "male",
        },
        {
          group_id: "g1",
          product_id: "p1",
          gedu_id: "gedu-1",
          display_order: 0,
          gedu_display_name: "Alice",
          gedu_email: "alice@test.com",
          gamer_id: "gamer-2",
          gamer_display_name: "Kid B",
          enrollment_id: "e2",
          gamer_date_of_birth: null,
          gamer_gender: null,
        },
      ];

      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(flatRows));

      const result = await service.getProductGroups("p1");

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "get_product_groups_with_details",
        { p_product_id: "p1" },
      );

      // Should be sorted by displayOrder (g1=0 before g2=1)
      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBe("g1");
      expect(result[0].geduDisplayName).toBe("Alice");
      expect(result[0].gamers).toHaveLength(2);
      expect(result[0].gamers[0].gamerId).toBe("gamer-1");
      expect(result[0].gamers[0].dateOfBirth).toBe("2015-01-01");
      expect(result[0].gamers[1].gamerId).toBe("gamer-2");

      expect(result[1].groupId).toBe("g2");
      expect(result[1].gamers).toHaveLength(0);
    });

    it("returns empty array when RPC returns empty", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess([]));

      const result = await service.getProductGroups("p1");

      expect(result).toEqual([]);
    });

    it("returns empty array when RPC returns empty array", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess([]));

      const result = await service.getProductGroups("p1");

      expect(result).toEqual([]);
    });

    it("throws on RPC error", async () => {
      mockSupabase.rpc.mockResolvedValue(mockSupabaseError("Function not found"));

      await expect(service.getProductGroups("p1")).rejects.toEqual(
        expect.objectContaining({ message: "Function not found" }),
      );
    });

    it("skips rows with null gamer_id (groups with no enrollments)", async () => {
      const rows = [
        {
          group_id: "g1",
          product_id: "p1",
          gedu_id: "gedu-1",
          display_order: 0,
          gedu_display_name: "Alice",
          gedu_email: "alice@test.com",
          gamer_id: null,
          gamer_display_name: null,
          enrollment_id: null,
          gamer_date_of_birth: null,
          gamer_gender: null,
        },
      ];

      mockSupabase.rpc.mockResolvedValue(mockSupabaseSuccess(rows));

      const result = await service.getProductGroups("p1");

      expect(result).toHaveLength(1);
      expect(result[0].gamers).toHaveLength(0);
    });
  });
});
