"use client";

import { useMemo } from "react";
import { useGeduGroups } from "@/services/groups";
import type { GeduGroup } from "@/services/groups";
import { useAvailableVoiceRooms } from "@/services/voice";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";
import { computeSessionWindow } from "@/lib/voice-schedule";

export interface GeduGroupWithVoice extends GeduGroup {
  voiceRoomId: string | null;
  voiceRoomDailyName: string | null;
  voiceIsOpen: boolean;
  voiceNextSessionStart: Date | null;
}

export function useGeduGroupsPage() {
  const { data: groups, isLoading: groupsLoading, error: groupsError } = useGeduGroups();
  const { data: rooms, isLoading: roomsLoading } = useAvailableVoiceRooms();

  const isLoading = groupsLoading || roomsLoading;

  const result = useMemo(() => {
    if (!groups) return { groups: [] as GeduGroupWithVoice[], loungeRoom: null as AvailableVoiceRoomWithWindow | null };

    // Build a map of group_id → voice room
    const roomByGroupId = new Map<string, AvailableVoiceRoomWithWindow>();
    let loungeRoom: AvailableVoiceRoomWithWindow | null = null;

    if (rooms) {
      for (const room of rooms) {
        if (room.room_type === "gedu_only") {
          loungeRoom = room;
        } else if (room.group_id) {
          roomByGroupId.set(room.group_id, room);
        }
      }
    }

    const enrichedGroups: GeduGroupWithVoice[] = groups.map((group) => {
      const room = roomByGroupId.get(group.groupId);

      // Compute voice status from the group's own schedule data
      let voiceIsOpen = false;
      let voiceNextSessionStart: Date | null = null;

      if (group.dayOfWeek != null && group.startTime && group.timezone && group.durationMinutes) {
        const window = computeSessionWindow({
          day_of_week: group.dayOfWeek,
          start_time: group.startTime,
          timezone: group.timezone,
          duration_minutes: group.durationMinutes,
        });
        voiceIsOpen = window.isOpen;
        voiceNextSessionStart = window.nextSessionStart;
      }

      return {
        ...group,
        voiceRoomId: room?.id ?? null,
        voiceRoomDailyName: room?.daily_room_name ?? null,
        voiceIsOpen,
        voiceNextSessionStart,
      };
    });

    // Sort: live groups first, then upcoming by soonest session start
    const liveGroups = enrichedGroups
      .filter((g) => g.voiceIsOpen)
      .sort((a, b) => (a.voiceNextSessionStart?.getTime() ?? 0) - (b.voiceNextSessionStart?.getTime() ?? 0));
    const upcomingGroups = enrichedGroups
      .filter((g) => !g.voiceIsOpen)
      .sort((a, b) => (a.voiceNextSessionStart?.getTime() ?? 0) - (b.voiceNextSessionStart?.getTime() ?? 0));

    return { groups: [...liveGroups, ...upcomingGroups], loungeRoom };
  }, [groups, rooms]);

  return {
    groups: result.groups,
    loungeRoom: result.loungeRoom,
    isLoading,
    error: groupsError,
  };
}
