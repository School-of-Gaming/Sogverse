import { describe, it, expect, vi } from "vitest";
import { GroupsService } from "@/services/groups/groups.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

function makeMockClient(rows: Record<string, unknown>[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
  } as unknown as SupabaseClient<Database>;
}

describe("GroupsService.getGeduGroups()", () => {
  it("reshapes flat rows into nested groups", async () => {
    const rows = [
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "Product A",
        product_description: "Test product",
        product_image_url: null,
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
        gedu_display_name: "Ms. Smith",
        voice_room_id: "vr-1",
        gamer_id: "gamer1",
        gamer_display_name: "Alice",
        gamer_date_of_birth: "2015-01-01",
        gamer_gender: "girl",
        enrollment_id: "e1",
      },
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "Product A",
        product_description: "Test product",
        product_image_url: null,
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
        gedu_display_name: "Ms. Smith",
        voice_room_id: "vr-1",
        gamer_id: "gamer2",
        gamer_display_name: "Bob",
        gamer_date_of_birth: "2014-06-15",
        gamer_gender: "boy",
        enrollment_id: "e2",
      },
      {
        group_id: "g2",
        product_id: "p2",
        product_name: "Product B",
        product_description: "Test product",
        product_image_url: "https://example.com/img.png",
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
        gedu_display_name: "Mr. Jones",
        voice_room_id: "vr-2",
        gamer_id: null,
        gamer_display_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,
      },
    ];

    const client = makeMockClient(rows);
    const service = new GroupsService(client);
    const groups = await service.getGeduGroups();

    expect(groups).toHaveLength(2);

    // First group (display_order 0)
    expect(groups[0].groupId).toBe("g1");
    expect(groups[0].productName).toBe("Product A");
    expect(groups[0].geduName).toBe("Ms. Smith");
    expect(groups[0].gamers).toHaveLength(2);
    expect(groups[0].gamers[0].gamerId).toBe("gamer1");
    expect(groups[0].gamers[1].gamerId).toBe("gamer2");
    expect(groups[0].voiceRoomId).toBe("vr-1");

    // Second group (display_order 1, no gamers)
    expect(groups[1].groupId).toBe("g2");
    expect(groups[1].productName).toBe("Product B");
    expect(groups[1].productImageUrl).toBe("https://example.com/img.png");
    expect(groups[1].geduName).toBe("Mr. Jones");
    expect(groups[1].gamers).toHaveLength(0);
    expect(groups[1].voiceRoomId).toBe("vr-2");
  });

  it("returns empty array when RPC returns no data", async () => {
    const client = makeMockClient([]);
    const service = new GroupsService(client);
    const groups = await service.getGeduGroups();

    expect(groups).toEqual([]);
  });

  it("sorts groups by display_order", async () => {
    const rows = [
      {
        group_id: "g2",
        product_id: "p1",
        product_name: "B",
        product_description: "Test product",
        product_image_url: null,
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
        gedu_display_name: "Gedu B",
        voice_room_id: "vr-2",
        gamer_id: null,
        gamer_display_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,
      },
      {
        group_id: "g1",
        product_id: "p1",
        product_name: "A",
        product_description: "Test product",
        product_image_url: null,
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
        gedu_display_name: "Gedu A",
        voice_room_id: "vr-1",
        gamer_id: null,
        gamer_display_name: null,
        gamer_date_of_birth: null,
        gamer_gender: null,
        enrollment_id: null,
      },
    ];

    const client = makeMockClient(rows);
    const service = new GroupsService(client);
    const groups = await service.getGeduGroups();

    expect(groups[0].groupId).toBe("g1");
    expect(groups[1].groupId).toBe("g2");
  });
});
