"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  IMAGE_CROP_ACCEPT,
  ImageCropDialog,
  decodeImageForCrop,
  type ImageCropSource,
} from "@/components/ui/image-crop-dialog";

export interface ImageCrop {
  /** Open the file picker; a picked file goes straight into the crop step. */
  choose: () => void;
  /** Crop a file the caller already has — a drop. */
  crop: (file: File) => void;
  /** The hidden file input and the crop dialog. Render it once, anywhere. */
  element: ReactNode;
}

/**
 * **The crop step's whole lifecycle, from pick to cropped JPEG.** A picked (or
 * dropped) file is decoded, cropped in `ImageCropDialog` at exactly `width` ×
 * `height`, and handed to `onCropped` as a JPEG blob together with the file it
 * was cropped from, so a caller can name the result after it.
 *
 * **The picked file's object URL is owned here**: it lives as long as the crop
 * dialog does and is revoked when it closes, or at once when the file turns out
 * unreadable. **Only the latest pick lands**: a slow decode of a file the
 * reader has already abandoned — by cancelling, or by picking another — is
 * dropped rather than opening in the frame.
 */
export function useImageCrop(
  { width, height }: { width: number; height: number },
  onCropped: (cropped: Blob, picked: File) => void,
  copy: { title?: string; confirmLabel?: string } = {},
): ImageCrop {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ImageCropSource | null>(null);
  /** The picked file's URL, revoked when the dialog lets go of it. */
  const sourceUrl = useRef<string | null>(null);
  /** Which pick is current, so a slow decode of an abandoned file lands nowhere. */
  const pick = useRef(0);
  /** The file being cropped, handed back beside the result. */
  const picked = useRef<File | null>(null);

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
    picked.current = file;
    const thisPick = ++pick.current;
    setSource({ kind: "decoding" });

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
        outputWidth={width}
        outputHeight={height}
        title={copy.title}
        confirmLabel={copy.confirmLabel}
        onCancel={close}
        onChooseAnother={() => input.current?.click()}
        onConfirm={(blob) => {
          const file = picked.current;
          close();
          if (file !== null) onCropped(blob, file);
        }}
      />
    </>
  );

  return { choose: () => input.current?.click(), crop, element };
}
