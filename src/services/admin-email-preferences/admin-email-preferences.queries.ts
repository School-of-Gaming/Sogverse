"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { AdminEmailKind } from "@/types";
import { AdminEmailPreferencesService } from "./admin-email-preferences.service";

export const adminEmailPreferenceKeys = {
  all: ["admin-email-preferences"] as const,
  mine: () => [...adminEmailPreferenceKeys.all, "mine"] as const,
};

/**
 * The signed-in admin's own email preferences. A bounded, indexed read, so a
 * consumer renders nothing while it flies — but must keep any control seeded
 * from it disabled until it lands, or a save could write the opposite of what
 * is on file. Switch it off for anyone who is not an admin.
 */
export function useMyAdminEmailPreferences({ enabled = true } = {}) {
  const supabase = getClient();
  const service = new AdminEmailPreferencesService(supabase);

  return useQuery({
    queryKey: adminEmailPreferenceKeys.mine(),
    queryFn: () => service.getMine(),
    enabled,
  });
}

/** Turn one kind of staff email on or off for the signed-in admin. */
export function useSetAdminEmailPreference() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new AdminEmailPreferencesService(supabase);

  return useMutation({
    mutationFn: ({ kind, enabled }: { kind: AdminEmailKind; enabled: boolean }) =>
      service.setMine(kind, enabled),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminEmailPreferenceKeys.all }),
  });
}
