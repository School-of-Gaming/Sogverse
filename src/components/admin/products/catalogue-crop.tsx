"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  IMAGE_CROP_ACCEPT,
  ImageCropDialog,
  decodeImageForCrop,
  type ImageCropSource,
} from "@/components/ui/image-crop-dialog";
import { CATALOGUE_IMAGE_PURPOSES } from "@/services/catalogue-images";
import type { CatalogueImagePurpose } from "@/types";

export interface CatalogueCrop {
  /** Open the file picker; a picked file goes straight into the crop step. */
  choose: () => void;
  /** Crop a file the caller already has — a drop. */
  crop: (file: File) => void;
  /** The hidden file input and the crop dialog. Render it once, anywhere. */
  element: ReactNode;
}

/**
 * **Every picture enters the catalogue through the crop step.** Whatever the
 * admin picks, what reaches `onCropped` is a JPEG exactly the size `purpose`
 * is stored at — the only thing the upload routes accept — named after the
 * picked file so a new entry's label still comes from it.
 *
 * **Object URLs are owned here**: the picked file's lives as long as the crop
 * dialog does and is revoked when it closes, and a slow decode of a file the
 * admin has already abandoned lands nowhere.
 */
export function useCatalogueCrop(
  purpose: CatalogueImagePurpose,
  onCropped: (file: File) => void,
): CatalogueCrop {
  const size = CATALOGUE_IMAGE_PURPOSES[purpose];
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ImageCropSource | null>(null);
  /** The picked file's URL, revoked when the dialog lets go of it. */
  const sourceUrl = useRef<string | null>(null);
  /** Which pick is current, so a slow decode of an abandoned file lands nowhere. */
  const pick = useRef(0);
  /** The name the cropped file is given: the picked file's stem, as a JPEG. */
  const outputName = useRef("image.jpg");

  function release() {
    if (sourceUrl.current !== null) URL.revokeObjectURL(sourceUrl.current);
    sourceUrl.current = null;
  }

  function close() {
    pick.current += 1;
    release();
    setSource(null);
  }

  function crop(file: File) {
    void open(file);
  }

  async function open(file: File) {
    release();
    outputName.current = `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
    const thisPick = ++pick.current;
    setSource({ kind: "decoding", url: "" });

    const url = URL.createObjectURL(file);
    sourceUrl.current = url;
    const readable = await decodeImageForCrop(url, file.type);
    if (pick.current !== thisPick) return;
    if (!readable) release();
    setSource(readable ? { kind: "ready", url } : { kind: "unreadable" });
  }

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_CROP_ACCEPT.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared at once, so picking the same file again still fires.
          e.target.value = "";
          if (file !== undefined) crop(file);
        }}
      />
      <ImageCropDialog
        source={source}
        outputWidth={size.width}
        outputHeight={size.height}
        onCancel={close}
        onChooseAnother={() => input.current?.click()}
        onConfirm={(blob) => {
          const name = outputName.current;
          close();
          // The dialog always encodes a JPEG, and the blob says so.
          onCropped(new File([blob], name, { type: blob.type }));
        }}
      />
    </>
  );

  return { choose: () => input.current?.click(), crop, element };
}
