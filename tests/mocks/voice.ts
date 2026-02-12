import type { VoiceRoom, OpenVoiceRoom, VoiceRoomStatus } from "@/types";

export function createMockVoiceRoom(
  overrides: Partial<VoiceRoom> = {}
): VoiceRoom {
  return {
    id: "room-uuid-1234",
    creator_id: "gedu-user-id",
    name: "Test Room",
    daily_room_name: "room-gedu-use",
    status: "open" as VoiceRoomStatus,
    opened_at: new Date().toISOString(),
    closed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockOpenVoiceRoom(
  overrides: Partial<OpenVoiceRoom> = {}
): OpenVoiceRoom {
  return {
    id: "room-uuid-1234",
    creator_id: "gedu-user-id",
    name: "Test Room",
    daily_room_name: "room-gedu-use",
    status: "open" as VoiceRoomStatus,
    opened_at: new Date().toISOString(),
    creator_display_name: "Test Educator",
    creator_role: "gedu",
    ...overrides,
  };
}
