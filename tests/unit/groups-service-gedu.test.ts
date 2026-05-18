import { describe, it, expect, vi } from "vitest";
import { GroupsService } from "@/services/groups/groups.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MyGroupWithDetails } from "@/types";

function makeMockClient(rows: MyGroupWithDetails[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
  } as unknown as SupabaseClient<Database>;
}

describe("GroupsService.getMyGroups()", () => {
  it("reshapes flat rows into nested groups", async () => {
    const rows = [
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "Product A",
        product_description: "Test product",
        product_image_path: "default.jpg",
        product_padlet_url: null,
        product_min_age: 8,
        product_max_age: 14,
        game_id: "game1",
        game_name: "Test Game",
        day_of_week: 1,
        start_time: "14:00:00",
        timezone: "America/New_York",
        duration_minutes: 60,
        display_order: 0,
        gedu_id: "gedu1",
        gedu_first_name: "Ms. Smith",
        gamer_id: "gamer1",
        gamer_first_name: "Alice",
        gamer_date_of_birth: "2015-01-01",
        gamer_gender: "girl",
        enrollment_id: "e1",


      },
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "Product A",
        product_description: "Test product",
        product_image_path: "default.jpg",
        product_padlet_url: null,
        product_min_age: 8,
        product_max_age: 14,
        game_id: "game1",
        game_name: "Test Game",
        day_of_week: 1,
        start_time: "14:00:00",
        timezone: "America/New_York",
        duration_minutes: 60,
        display_order: 0,
        gedu_id: "gedu1",
        gedu_first_name: "Ms. Smith",
        gamer_id: "gamer2",
        gamer_first_name: "Bob",
        gamer_date_of_birth: "2014-06-15",
        gamer_gender: "boy",
        enrollment_id: "e2",


      },
      {
        group_id: "g2",
        product_id: "p2",
        product_name: "Product B",
        product_description: "Test product",
        product_image_path: "img.jpg",
        product_padlet_url: null,
        product_min_age: 8,
        product_max_age: 14,
        game_id: "game1",
        game_name: "Test Game",
        day_of_week: 3,
        start_time: "10:00:00",
        timezone: "Europe/London",
        duration_minutes: 45,
        display_order: 1,
        gedu_id: "gedu2",
        gedu_first_name: "Mr. Jones",
        gamer_id: null,
        gamer_first_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,


      },
    ];

    const client = makeMockClient(rows);
    const service = new GroupsService(client);
    const groups = await service.getMyGroups();

    expect(groups).toHaveLength(2);

    // First group (display_order 0)
    expect(groups[0].groupId).toBe("g1");
    expect(groups[0].productName).toBe("Product A");
    expect(groups[0].geduName).toBe("Ms. Smith");
    expect(groups[0].gamers).toHaveLength(2);
    expect(groups[0].gamers[0].gamerId).toBe("gamer1");
    expect(groups[0].gamers[1].gamerId).toBe("gamer2");

    // Second group (display_order 1, no gamers)
    expect(groups[1].groupId).toBe("g2");
    expect(groups[1].productName).toBe("Product B");
    expect(groups[1].productImagePath).toBe("img.jpg");
    expect(groups[1].geduName).toBe("Mr. Jones");
    expect(groups[1].gamers).toHaveLength(0);
  });

  it("returns empty array when RPC returns no data", async () => {
    const client = makeMockClient([]);
    const service = new GroupsService(client);
    const groups = await service.getMyGroups();

    expect(groups).toEqual([]);
  });

  it("sorts groups by display_order", async () => {
    const rows = [
      {
        group_id: "g2",
        product_id: "p1",
        product_name: "B",
        product_description: "Test product",
        product_image_path: "default.jpg",
        product_padlet_url: null,
        product_min_age: 8,
        product_max_age: 14,
        game_id: "game1",
        game_name: "Test Game",
        day_of_week: 0,
        start_time: "09:00:00",
        timezone: "UTC",
        duration_minutes: 30,
        display_order: 5,
        gedu_id: "gedu-b",
        gedu_first_name: "Gedu B",
        gamer_id: null,
        gamer_first_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,


      },
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "A",
        product_description: "Test product",
        product_image_path: "default.jpg",
        product_padlet_url: null,
        product_min_age: 8,
        product_max_age: 14,
        game_id: "game1",
        game_name: "Test Game",
        day_of_week: 0,
        start_time: "09:00:00",
        timezone: "UTC",
        duration_minutes: 30,
        display_order: 1,
        gedu_id: "gedu-a",
        gedu_first_name: "Gedu A",
        gamer_id: null,
        gamer_first_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,


      },
    ];

    const client = makeMockClient(rows);
    const service = new GroupsService(client);
    const groups = await service.getMyGroups();

    expect(groups[0].groupId).toBe("g1");
    expect(groups[1].groupId).toBe("g2");
  });
});
