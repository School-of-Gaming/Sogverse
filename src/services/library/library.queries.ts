"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { catalogueImageUsageKey } from "@/services/catalogue-images/catalogue-images.keys";
import { LibraryService } from "./library.service";
import type { LibraryArticleInput } from "./library.contracts";

export const libraryKeys = {
  all: ["library"] as const,
  admin: () => [...libraryKeys.all, "admin"] as const,
  adminList: () => [...libraryKeys.admin(), "list"] as const,
  adminDetail: (id: string) => [...libraryKeys.admin(), "detail", id] as const,
  published: () => [...libraryKeys.all, "published"] as const,
};

/**
 * Every article for the admin list. Admin-only by RLS: a non-admin caller gets
 * an empty list rather than an error.
 */
export function useAdminLibraryArticles() {
  const service = new LibraryService(getClient());

  return useQuery({
    queryKey: libraryKeys.adminList(),
    queryFn: () => service.listAdminArticles(),
  });
}

/** One article's working and published copies. Nullable id so a caller can mount first. */
export function useAdminLibraryArticle(id: string | null | undefined) {
  const service = new LibraryService(getClient());

  return useQuery({
    queryKey: libraryKeys.adminDetail(id ?? ""),
    queryFn: () => service.getAdminArticle(id ?? ""),
    enabled: !!id,
  });
}

/**
 * Everything live, without bodies — what an article's public address is
 * judged against. Disabled until `enabled`, so a page that has nothing live
 * to link never reads it.
 */
export function usePublishedLibraryArticles(enabled: boolean) {
  const service = new LibraryService(getClient());

  return useQuery({
    queryKey: libraryKeys.published(),
    queryFn: () => service.listPublishedArticles(),
    enabled,
  });
}

/**
 * Every Library write invalidates the whole `library` tree: each one changes
 * the admin list's status or "unpublished changes" flag, and the detail. It
 * also invalidates the image
 * catalogue's usage map, which is read partly from the articles' working and
 * published covers: left cached, it would show a cover an article has just
 * taken up as unused, and removable without warning. Returned rather than
 * fired and forgotten, so a caller awaiting `mutateAsync` never acts on a
 * stale list.
 */
function useLibraryInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: libraryKeys.all }),
      queryClient.invalidateQueries({ queryKey: catalogueImageUsageKey }),
    ]);
  };
}

export function useCreateLibraryArticle() {
  const service = new LibraryService(getClient());
  const invalidate = useLibraryInvalidation();

  return useMutation({
    mutationFn: (input: LibraryArticleInput) => service.createArticle(input),
    onSuccess: () => invalidate(),
  });
}

export function useSaveLibraryArticle() {
  const service = new LibraryService(getClient());
  const invalidate = useLibraryInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LibraryArticleInput }) =>
      service.saveArticle(id, input),
    onSuccess: () => invalidate(),
  });
}

export function usePublishLibraryArticle() {
  const service = new LibraryService(getClient());
  const invalidate = useLibraryInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.publishArticle(id),
    onSuccess: () => invalidate(),
  });
}

export function useUnpublishLibraryArticle() {
  const service = new LibraryService(getClient());
  const invalidate = useLibraryInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.unpublishArticle(id),
    onSuccess: () => invalidate(),
  });
}
