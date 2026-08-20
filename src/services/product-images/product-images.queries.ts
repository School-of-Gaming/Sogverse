"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { productKeys } from "@/services/products/products.queries";
import { ProductImagesService } from "./product-images.service";

export const productImageKeys = {
  all: ["product-images"] as const,
  list: () => [...productImageKeys.all, "list"] as const,
};

/**
 * Which products use which entry. Derived from a products read, so its key
 * lives under the **products** keys rather than the catalogue's: a product
 * saved anywhere else in the admin UI can change this answer, and a key that
 * says where the data comes from is the one that gets invalidated when it does.
 */
export const productImageUsageKey = [
  ...productKeys.all,
  "image-usage",
] as const;

/**
 * The catalogue. A small indexed read of a table in the low hundreds of rows,
 * so the caller renders nothing rather than a skeleton while it lands.
 *
 * Mounted only from inside the dialog body — an admin who opens a product's
 * edit page without opening the catalogue issues neither this read nor the
 * usage one.
 */
export function useProductImages() {
  const service = new ProductImagesService(getClient());

  return useQuery({
    queryKey: productImageKeys.list(),
    queryFn: () => service.listImages(),
  });
}

/** Usage per entry. Same shape and same lifetime as the catalogue read. */
export function useProductImageUsage() {
  const service = new ProductImagesService(getClient());

  return useQuery({
    queryKey: productImageUsageKey,
    queryFn: () => service.getUsage(),
  });
}

/**
 * What every catalogue mutation invalidates, and the one key it must not.
 *
 * The catalogue list, because an entry was added, renamed or removed. The
 * usage map, because a replace or a remove moves products between entries. The
 * products **list** keys, because those surfaces paint `image_path` and a
 * repoint changes it under them.
 *
 * Never `productKeys.all` and never the admin **detail** key: the product form
 * seeds its state once from that query, so refetching it mid-edit would throw
 * away a half-filled form. Invalidating the parent key would cascade into it,
 * which is why the three keys are listed individually rather than swept.
 */
function useCatalogueInvalidation(): () => Promise<void> {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: productImageKeys.all }),
      queryClient.invalidateQueries({ queryKey: productImageUsageKey }),
      queryClient.invalidateQueries({ queryKey: productKeys.lists() }),
    ]);
  };
}

/**
 * Add a picture, or find the entry already holding those bytes. Resolves with
 * `{ status, image }`; `status: "existing"` is the dedup answering, not a
 * failure.
 */
export function useUploadProductImage() {
  const service = new ProductImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ file, label }: { file: File; label?: string }) =>
      service.uploadImage(file, label),
    // Returned rather than fired and forgotten: React Query awaits a promise
    // returned from onSuccess, so a caller using mutateAsync cannot act on a
    // new entry while the list that has to show it is still stale.
    onSuccess: () => invalidate(),
  });
}

/** Repoint every product using `id` at the entry holding the new bytes. */
export function useReplaceProductImage() {
  const service = new ProductImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      service.replaceImage(id, file),
    onSuccess: () => invalidate(),
  });
}

/** Rename an entry — the only mutable thing about one. */
export function useRenameProductImage() {
  const service = new ProductImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      service.renameImage(id, label),
    onSuccess: () => invalidate(),
  });
}

/** Retire an entry: row and object go, every linked product loses its picture. */
export function useDeleteProductImage() {
  const service = new ProductImagesService(getClient());
  const invalidate = useCatalogueInvalidation();

  return useMutation({
    mutationFn: (id: string) => service.deleteImage(id),
    onSuccess: () => invalidate(),
  });
}
