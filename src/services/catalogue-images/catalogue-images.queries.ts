"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { landingPageKeys } from "@/services/landing-pages/landing-pages.queries";
import { libraryKeys } from "@/services/library/library.queries";
import { productKeys } from "@/services/products/products.queries";
import type { CatalogueImagePurpose } from "@/types";
import {
  catalogueImageKeys,
  catalogueImageUsageKey,
} from "./catalogue-images.keys";
import { CatalogueImagesService } from "./catalogue-images.service";

/**
 * The catalogue's entries of one purpose. A small indexed read of a table in the
 * low hundreds of rows, so the caller renders nothing rather than a skeleton
 * while it lands.
 *
 * Mounted only from inside the dialog body — an admin who opens a product's
 * edit page without opening the catalogue issues neither this read nor the
 * usage one.
 */
export function useCatalogueImages(purpose: CatalogueImagePurpose) {
  const service = new CatalogueImagesService(getClient());

  return useQuery({
    queryKey: catalogueImageKeys.list(purpose),
    queryFn: () => service.listImages(purpose),
  });
}

/** Usage per entry. Read the same way, and kept as long, as the catalogue. */
export function useCatalogueImageUsage() {
  const service = new CatalogueImagesService(getClient());

  return useQuery({
    queryKey: catalogueImageUsageKey,
    queryFn: () => service.getUsage(),
  });
}

/**
 * What every catalogue mutation invalidates, and the one key it must not.
 *
 * The catalogue list, because an entry was added, renamed or removed. The
 * usage map, because a replace or a remove moves products and articles between
 * entries. The products **list** keys, because those surfaces paint a derived
 * path and a repoint changes it under them. The
 * Library's whole admin tree, list and detail alike: a replace or a remove
 * moves an article's working-copy cover in the database, and a detail left
 * cached would keep the old cover id, so the editor would compare the form's
 * followed id against it and call the article unsaved. That refetch is safe
 * because the Library editor seeds its form once per article id, never from a
 * refetch. Landing pages' admin tree likewise, for the same reason: a replace
 * or a remove moves the pictures in a page's working structure, and the
 * landing editor seeds its form once per page id too.
 *
 * Never `productKeys.all` and never the product's admin **detail** key: the
 * product form seeds its state from that query, so refetching it mid-edit
 * would throw away a half-filled form. Invalidating a parent key would cascade
 * into it, which is why the product keys are listed individually rather than
 * swept.
 */
function useCatalogueInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogueImageKeys.all }),
      queryClient.invalidateQueries({ queryKey: catalogueImageUsageKey }),
      queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: libraryKeys.admin() }),
      queryClient.invalidateQueries({ queryKey: landingPageKeys.admin() }),
    ]);
  };
}

/**
 * Add a picture, or find the entry already holding those bytes. Resolves with
 * `{ status, image }`; `status: "existing"` is the dedup answering, not a
 * failure.
 */
export function useUploadCatalogueImage() {
  const service = new CatalogueImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({
      file,
      purpose,
      label,
    }: {
      file: File;
      purpose: CatalogueImagePurpose;
      label?: string;
    }) => service.uploadImage(file, purpose, label),
    // Returned rather than fired and forgotten: React Query awaits a promise
    // returned from onSuccess, so a caller using mutateAsync cannot act on a
    // new entry while the list that has to show it is still stale.
    onSuccess: () => invalidate(),
  });
}

/** Repoint every product using `id` at the entry holding the new bytes. */
export function useReplaceCatalogueImage() {
  const service = new CatalogueImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      service.replaceImage(id, file),
    onSuccess: () => invalidate(),
  });
}

/** Rename an entry — the only mutable thing about one. */
export function useRenameCatalogueImage() {
  const service = new CatalogueImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      service.renameImage(id, label),
    onSuccess: () => invalidate(),
  });
}

/** Retire an entry: row and object go, every linked product loses its picture. */
export function useDeleteCatalogueImage() {
  const service = new CatalogueImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.deleteImage(id),
    onSuccess: () => invalidate(),
  });
}
