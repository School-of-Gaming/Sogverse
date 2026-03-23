"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { VoiceService } from "./voice.service";
import { VOICE_CONFIG } from "@/lib/constants/voice";

export const voiceKeys = {
  all: ["voice"] as const,
  rooms: () => [...voiceKeys.all, "rooms"] as const,
  lounge: (roomType: string) => [...voiceKeys.all, "lounge", roomType] as const,
};

/** List available voice rooms with computed session windows — polls every 30s */
export function useAvailableVoiceRooms() {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useQuery({
    queryKey: voiceKeys.rooms(),
    queryFn: () => service.getAvailableRooms(),
    refetchInterval: VOICE_CONFIG.REALTIME_POLL_INTERVAL_MS,
  });
}

/** Get the voice room ID for a lounge room by type. Cached indefinitely — lounge IDs never change. */
export function useLoungeRoomId(roomType: string) {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useQuery({
    queryKey: voiceKeys.lounge(roomType),
    queryFn: () => service.getLoungeRoomId(roomType),
    staleTime: Infinity,
  });
}

/** Get a Daily.co meeting token */
export function useVoiceToken() {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useMutation({
    mutationFn: (roomId: string) => service.getToken(roomId),
  });
}
