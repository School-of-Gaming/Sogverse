"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { voiceKeys } from "@/services/voice";

/**
 * Subscribe to Supabase Realtime changes on voice_rooms and group_enrollments.
 * On any change, invalidates React Query cache so UI updates live.
 *
 * IMPORTANT: Only invalidates queries — no Supabase data queries in the callback
 * to avoid GoTrueClient lock deadlocks.
 */
export function useVoiceRoomRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getClient();
    const channelName = `voice_rooms_${crypto.randomUUID()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_rooms" },
        () => {
          queryClient.invalidateQueries({ queryKey: voiceKeys.rooms() });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_enrollments" },
        () => {
          queryClient.invalidateQueries({ queryKey: voiceKeys.rooms() });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
