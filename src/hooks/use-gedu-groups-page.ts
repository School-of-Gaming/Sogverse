"use client";

import { useMemo, useState, useEffect } from "react";
import { useGeduGroups } from "@/services/groups";
import type { GeduGroup } from "@/services/groups";
import { useLoungeRoomId } from "@/services/voice";
import { computeSessionWindow } from "@/lib/voice-schedule";

/** Re-evaluate session windows every 30 seconds so the Live badge and Join button update in real-time. */
const SESSION_TICK_MS = 30_000;

export interface GeduGroupWithVoice extends GeduGroup {
  voiceIsOpen: boolean;
  voiceNextSessionStart: Date;
}

export function useGeduGroupsPage() {
  const { data: groups, isLoading: groupsLoading, error: groupsError } = useGeduGroups();
  const { data: loungeRoomId, isLoading: loungeLoading } = useLoungeRoomId("gedu_only");

  const isLoading = groupsLoading || loungeLoading;

  // Tick every 30s so computeSessionWindow() picks up window open/close transitions
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), SESSION_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const enrichedGroups = useMemo(() => {
    if (!groups) return [] as GeduGroupWithVoice[];

    const mapped: GeduGroupWithVoice[] = groups.map((group) => {
      const window = computeSessionWindow(
        {
          day_of_week: group.dayOfWeek,
          start_time: group.startTime,
          timezone: group.timezone,
          duration_minutes: group.durationMinutes,
        },
        now,
      );

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
  }, [groups, now]);

  return {
    groups: enrichedGroups,
    loungeRoomId: loungeRoomId ?? null,
    isLoading,
    error: groupsError,
  };
}
