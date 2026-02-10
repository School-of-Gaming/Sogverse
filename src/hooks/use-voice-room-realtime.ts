"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { voiceKeys } from "@/services/voice";

/**
 * Subscribe to Supabase Realtime changes on the voice_rooms table.
 * On any change, invalidates React Query cache so UI updates live.
 *
 * IMPORTANT: Only invalidates queries — no Supabase data queries in the callback
 * to avoid GoTrueClient lock deadlocks.
 */
export function useVoiceRoomRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getClient();
    // Unique channel name per effect run — avoids stale state after
    // strict mode cleanup or hot module reload
    const channelName = `voice_rooms_${crypto.randomUUID()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_rooms" },
        (payload) => {
          console.log("[Realtime] voice_rooms change:", payload.eventType);
          // Safe: only cache invalidation, no Supabase data queries
          queryClient.invalidateQueries({ queryKey: voiceKeys.rooms() });
          queryClient.invalidateQueries({ queryKey: voiceKeys.myRoom() });
        }
      )
      .subscribe((status, err) => {
        console.log("[Realtime] status:", status, err ?? "");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
