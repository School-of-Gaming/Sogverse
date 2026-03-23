"use client";

import { useMemo, useState, useEffect } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { GeduGroup } from "@/services/groups";
import { computeSessionWindow } from "@/lib/session-schedule";

/** Re-evaluate session windows every 30 seconds so the Live badge and Join button update in real-time. */
const SESSION_TICK_MS = 30_000;

export interface GroupWithVoice extends GeduGroup {
  voiceIsOpen: boolean;
  voiceNextSessionStart: Date;
}

/**
 * Shared hook that enriches a groups query with voice session window state.
 * Ticks every 30s and sorts live-first, then by soonest upcoming session.
 */
export function useGroupsWithVoice(groupsQuery: UseQueryResult<GeduGroup[], Error>) {
  const { data: groups, isLoading, error } = groupsQuery;

  // Tick every 30s so computeSessionWindow() picks up window open/close transitions
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), SESSION_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const enrichedGroups = useMemo(() => {
    if (!groups) return [] as GroupWithVoice[];

    const mapped: GroupWithVoice[] = groups.map((group) => {
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
    isLoading,
    error,
  };
}
