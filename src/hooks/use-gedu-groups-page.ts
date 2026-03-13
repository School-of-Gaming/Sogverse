"use client";

import { useMemo } from "react";
import { useGeduGroups } from "@/services/groups";
import type { GeduGroup } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { computeSessionWindow } from "@/lib/voice-schedule";

export interface GeduGroupWithVoice extends GeduGroup {
  voiceIsOpen: boolean;
  voiceNextSessionStart: Date;
}

export function useGeduGroupsPage() {
  const { data: groups, isLoading: groupsLoading, error: groupsError } = useGeduGroups();
  const { data: loungeRoomId, isLoading: loungeLoading } = useLoungeRoomId("gedu_only");

  const isLoading = groupsLoading || loungeLoading;

  const enrichedGroups = useMemo(() => {
    if (!groups) return [] as GeduGroupWithVoice[];

    const mapped: GeduGroupWithVoice[] = groups.map((group) => {
      const window = computeSessionWindow({
        day_of_week: group.dayOfWeek,
        start_time: group.startTime,
        timezone: group.timezone,
        duration_minutes: group.durationMinutes,
      });

      return {
        ...group,
        voiceIsOpen: window.isOpen,
        voiceNextSessionStart: window.nextSessionStart,
      };
    });

    // Sort: live groups first, then upcoming by soonest session start
    const liveGroups = mapped
      .filter((g) => g.voiceIsOpen)
      .sort((a, b) => a.voiceNextSessionStart.getTime() - b.voiceNextSessionStart.getTime());
    const upcomingGroups = mapped
      .filter((g) => !g.voiceIsOpen)
      .sort((a, b) => a.voiceNextSessionStart.getTime() - b.voiceNextSessionStart.getTime());

    return [...liveGroups, ...upcomingGroups];
  }, [groups]);

  return {
    groups: enrichedGroups,
    loungeRoomId: loungeRoomId ?? null,
    isLoading,
    error: groupsError,
  };
}
