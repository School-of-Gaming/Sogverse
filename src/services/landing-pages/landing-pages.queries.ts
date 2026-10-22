"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { catalogueImageUsageKey } from "@/services/catalogue-images/catalogue-images.keys";
import { testimonialKeys } from "@/services/testimonials/testimonials.keys";
import { LandingPageService } from "./landing-pages.service";

export const landingPageKeys = {
  all: ["landing-pages"] as const,
  admin: () => [...landingPageKeys.all, "admin"] as const,
  adminList: () => [...landingPageKeys.admin(), "list"] as const,
  adminDetail: (id: string) => [...landingPageKeys.admin(), "detail", id] as const,
};

/**
 * Every page for the admin list. Admin-only by RLS: a non-admin caller gets an
 * empty list rather than an error.
 */
export function useAdminLandingPages() {
  const service = new LandingPageService(getClient());

  return useQuery({
    queryKey: landingPageKeys.adminList(),
    queryFn: () => service.listAdminPages(),
  });
}

/** One page's working and published copies. Nullable id so a caller can mount first. */
export function useAdminLandingPage(id: string | null | undefined) {
  const service = new LandingPageService(getClient());

  return useQuery({
    queryKey: landingPageKeys.adminDetail(id ?? ""),
    queryFn: () => service.getAdminPage(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Every landing page write invalidates the whole `landing-pages` tree — each
 * one changes the admin list's status or "unpublished changes" flag, and the
 * detail — the image catalogue's usage map, which a page's pictures are
 * part of, and the testimonials tree, whose "where it is used" says which
 * copy of a page places each one. Returned rather than fired and forgotten, so a caller awaiting
 * `mutateAsync` never acts on a stale list.
 */
function useLandingPageInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: landingPageKeys.all }),
      queryClient.invalidateQueries({ queryKey: catalogueImageUsageKey }),
      queryClient.invalidateQueries({ queryKey: testimonialKeys.all }),
    ]);
  };
}

export function usePublishLandingPage() {
  const service = new LandingPageService(getClient());
  const invalidate = useLandingPageInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.publishPageViaRoute(id),
    onSuccess: () => invalidate(),
  });
}

export function useUnpublishLandingPage() {
  const service = new LandingPageService(getClient());
  const invalidate = useLandingPageInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.unpublishPageViaRoute(id),
    onSuccess: () => invalidate(),
  });
}
