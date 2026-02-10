"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { VoiceService } from "./voice.service";
import { VOICE_CONFIG } from "@/lib/constants/voice";

export const voiceKeys = {
  all: ["voice"] as const,
  rooms: () => [...voiceKeys.all, "rooms"] as const,
  openRooms: () => [...voiceKeys.rooms(), "open"] as const,
  myRoom: () => [...voiceKeys.all, "myRoom"] as const,
};

/** List open voice rooms — for gamer dashboard */
export function useOpenVoiceRooms() {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useQuery({
    queryKey: voiceKeys.openRooms(),
    queryFn: () => service.getOpenRooms(),
    refetchInterval: VOICE_CONFIG.REALTIME_POLL_INTERVAL_MS,
  });
}

/** Get the current gedu's voice room */
export function useMyVoiceRoom() {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useQuery({
    queryKey: voiceKeys.myRoom(),
    queryFn: () => service.getMyRoom(),
  });
}

/** Open a voice room (gedu) */
export function useOpenRoom() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useMutation({
    mutationFn: (name?: string) => service.openRoom(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voiceKeys.myRoom() });
      queryClient.invalidateQueries({ queryKey: voiceKeys.openRooms() });
    },
  });
}

/** Close a voice room (gedu) */
export function useCloseRoom() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useMutation({
    mutationFn: () => service.closeRoom(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: voiceKeys.myRoom() });
      queryClient.invalidateQueries({ queryKey: voiceKeys.openRooms() });
    },
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
