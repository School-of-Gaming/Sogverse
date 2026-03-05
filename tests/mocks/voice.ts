import type { VoiceRoom, AvailableVoiceRoom } from "@/types";

export function createMockVoiceRoom(
  overrides: Partial<VoiceRoom> = {},
): VoiceRoom {
  return {
    id: "room-uuid-1234",
    group_id: "group-uuid-1234",
    room_type: "group",
    creator_id: null,
    name: "Test Room",
    daily_room_name: "group-abcd1234",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockAvailableVoiceRoom(
  overrides: Partial<AvailableVoiceRoom> = {},
): AvailableVoiceRoom {
  return {
    id: "room-uuid-1234",
    group_id: "group-uuid-1234",
    room_type: "group",
    name: "Test Room",
    daily_room_name: "group-abcd1234",
    product_name: "Test Product",
    day_of_week: 1,
    start_time: "14:00",
    timezone: "Europe/Helsinki",
    duration_minutes: 60,
    gedu_display_name: "Test Educator",
    gedu_id: "gedu-user-id",
    ...overrides,
  };
}
