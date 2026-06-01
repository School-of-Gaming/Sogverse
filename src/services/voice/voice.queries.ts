"use client";

import { useMutation } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { VoiceService } from "./voice.service";

export const voiceKeys = {
  all: ["voice"] as const,
};

/**
 * Get a Daily.co meeting token for a product group
 * (`product_groups.id`). The token endpoint derives the Daily room name
 * from the group + current session window and get-or-creates the room on
 * demand — no DB-side voice room table.
 */
export function useVoiceToken() {
  const supabase = getClient();
  const service = new VoiceService(supabase);

  return useMutation({
    mutationFn: (groupId: string) => service.getToken(groupId),
  });
}
