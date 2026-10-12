"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { SpotlightsService } from "./spotlights.service";
import type { SpotlightInput } from "./spotlights.contracts";

export const spotlightKeys = {
  all: ["spotlights"] as const,
  admin: () => [...spotlightKeys.all, "admin"] as const,
  adminList: () => [...spotlightKeys.admin(), "list"] as const,
  adminDetail: (id: string) => [...spotlightKeys.admin(), "detail", id] as const,
};

/**
 * Every spotlight for the admin list, newest first. Admin-only by RLS: a
 * non-admin caller gets an empty list rather than an error.
 */
export function useAdminSpotlights() {
  const service = new SpotlightsService(getClient());

  return useQuery({
    queryKey: spotlightKeys.adminList(),
    queryFn: () => service.listAdminSpotlights(),
  });
}

/** One spotlight. Nullable id so a caller can mount first. */
export function useAdminSpotlight(id: string | null | undefined) {
  const service = new SpotlightsService(getClient());

  return useQuery({
    queryKey: spotlightKeys.adminDetail(id ?? ""),
    queryFn: () => service.getAdminSpotlight(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Every spotlight write invalidates the whole `spotlights` tree: a save, a
 * switch or a removal changes the list and the detail alike. Returned rather
 * than fired and forgotten, so a caller awaiting `mutateAsync` never acts on a
 * stale list.
 */
function useSpotlightInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: spotlightKeys.all });
  };
}

export function useCreateSpotlight() {
  const service = new SpotlightsService(getClient());
  const invalidate = useSpotlightInvalidation();

  return useMutation({
    mutationFn: (input: SpotlightInput) => service.createSpotlight(input),
    onSuccess: () => invalidate(),
  });
}

export function useSaveSpotlight() {
  const service = new SpotlightsService(getClient());
  const invalidate = useSpotlightInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SpotlightInput }) =>
      service.saveSpotlight(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useSetSpotlightEnabled() {
  const service = new SpotlightsService(getClient());
  const invalidate = useSpotlightInvalidation();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      service.setSpotlightEnabled(id, enabled),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSpotlight() {
  const service = new SpotlightsService(getClient());
  const invalidate = useSpotlightInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.deleteSpotlight(id),
    onSuccess: () => invalidate(),
  });
}
