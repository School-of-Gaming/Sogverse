"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { landingPageKeys } from "@/services/landing-pages/landing-pages.queries";
import { GuidesService } from "./guides.service";
import { guideKeys } from "./guides.keys";

export { guideKeys };

/**
 * Every guide for the admin list, most recently saved first, with its files
 * and where each is offered. Admin-only by RLS: a non-admin caller gets an
 * empty list.
 */
export function useAdminGuides() {
  const service = new GuidesService(getClient());

  return useQuery({
    queryKey: guideKeys.adminList(),
    queryFn: () => service.listAdminGuides(),
  });
}

/** One guide. Nullable id so a caller can mount first. */
export function useAdminGuide(id: string | null | undefined) {
  const service = new GuidesService(getClient());

  return useQuery({
    queryKey: guideKeys.adminDetail(id ?? ""),
    queryFn: () => service.getAdminGuide(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Every guide write invalidates the whole `guides` tree, list and detail
 * alike, and the landing pages' tree, whose pages show the files of the
 * guides each places. Returned rather than fired and forgotten, so a caller
 * awaiting `mutateAsync` never acts on a stale list. An upload, which runs
 * through a route, invalidates with this same hook once it answers.
 */
export function useGuideInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: guideKeys.all }),
      queryClient.invalidateQueries({ queryKey: landingPageKeys.all }),
    ]);
  };
}

export function useSaveGuideLabel() {
  const service = new GuidesService(getClient());
  const invalidate = useGuideInvalidation();

  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      service.saveGuideLabel(id, label),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveGuideFile() {
  const service = new GuidesService(getClient());
  const invalidate = useGuideInvalidation();

  return useMutation({
    mutationFn: ({ id, locale }: { id: string; locale: string }) =>
      service.removeGuideFile(id, locale),
    onSuccess: () => invalidate(),
  });
}
