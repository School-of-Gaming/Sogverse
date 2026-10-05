"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { NotificationChannel, NotificationKind } from "@/types";
import { NotificationPreferencesService } from "./notification-preferences.service";

export const notificationPreferenceKeys = {
  all: ["notification-preferences"] as const,
  mine: () => [...notificationPreferenceKeys.all, "mine"] as const,
};

/**
 * The signed-in person's own notification preferences. A bounded, indexed
 * read, so a consumer renders nothing while it flies — but must keep any
 * control seeded from it disabled until it lands, or a save could write the
 * opposite of what is on file.
 */
export function useMyNotificationPreferences() {
  const supabase = getClient();
  const service = new NotificationPreferencesService(supabase);

  return useQuery({
    queryKey: notificationPreferenceKeys.mine(),
    queryFn: () => service.getMine(),
  });
}

/** Turn one kind on or off on one channel for the signed-in person. */
export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new NotificationPreferencesService(supabase);

  return useMutation({
    mutationFn: ({
      kind,
      channel,
      enabled,
    }: {
      kind: NotificationKind;
      channel: NotificationChannel;
      enabled: boolean;
    }) => service.setMine(kind, channel, enabled),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: notificationPreferenceKeys.all }),
  });
}
