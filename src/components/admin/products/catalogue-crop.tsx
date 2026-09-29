"use client";

import { useImageCrop, type ImageCrop } from "@/components/ui/use-image-crop";
import { CATALOGUE_IMAGE_PURPOSES } from "@/services/catalogue-images";
import type { CatalogueImagePurpose } from "@/types";

export type CatalogueCrop = ImageCrop;

/**
 * **Every picture enters the catalogue through the crop step.** Whatever the
 * admin picks, what reaches `onCropped` is a JPEG exactly the size `purpose`
 * is stored at — the only thing the upload routes accept — named after the
 * picked file so a new entry's label still comes from it.
 */
export function useCatalogueCrop(
  purpose: CatalogueImagePurpose,
  onCropped: (file: File) => void,
): CatalogueCrop {
  return useImageCrop(CATALOGUE_IMAGE_PURPOSES[purpose], (blob, picked) => {
    const name = `${picked.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
    // The dialog always encodes a JPEG, and the blob says so.
    onCropped(new File([blob], name, { type: blob.type }));
  });
}
