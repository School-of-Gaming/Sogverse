"use client";

import { useId, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { ImageOff, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The file types a cropped upload's picker offers, and the only ones it
 * accepts. One list for every cropped upload; whatever goes in, what comes out
 * is a JPEG.
 */
export const IMAGE_CROP_ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * The picked file as the dialog sees it: still being decoded, ready to crop,
 * or refused. The object URL belongs to the caller, which made it and revokes
 * it when the dialog closes.
 */
export type ImageCropSource =
  | { kind: "decoding" }
  | { kind: "ready"; url: string }
  | { kind: "unreadable" };

/**
 * Decode a picked file, so a format the browser cannot draw is refused in the
 * dialog rather than failing silently on the canvas. A type outside the
 * accepted list is refused without trying: the picker's filter is a suggestion
 * the reader can switch off.
 */
export async function decodeImageForCrop(url: string, type: string) {
  if (!IMAGE_CROP_ACCEPT.includes(type)) return false;
  const image = new window.Image();
  image.src = url;
  try {
    await image.decode();
    return true;
  } catch {
    return false;
  }
}

/**
 * **The crop step between picking an image and seeing it where it will be
 * shown.**
 *
 * A fixed frame, the image dragged to position under it and zoomed with the
 * slider, the wheel or a pinch. The frame's aspect ratio is derived from the
 * output size the caller passes, so the two cannot disagree. Confirming draws
 * the framed area onto a canvas at exactly that size, so what the preview
 * shows is exactly what would be uploaded, and hands the caller the result as
 * a JPEG blob.
 *
 * **The footer is settled before the file is decoded**, as a dialog footer
 * has to be: decoding lands after first paint, so the two buttons are there
 * from the start and the confirm button waits disabled. A file that cannot be
 * read replaces the frame's contents with the reason and a way to pick
 * another; the frame keeps its size throughout, so nothing below it moves.
 */
export function ImageCropDialog({
  source,
  outputWidth,
  outputHeight,
  title,
  confirmLabel,
  onCancel,
  onChooseAnother,
  onConfirm,
}: {
  /** `null` closes the dialog. */
  source: ImageCropSource | null;
  /** The output's size in pixels; the frame's aspect ratio follows from it. */
  outputWidth: number;
  outputHeight: number;
  /** The heading, where the neutral "crop the image" undersells the surface. */
  title?: string;
  /** The confirm button's label, where the neutral "use image" undersells it. */
  confirmLabel?: string;
  onCancel: () => void;
  onChooseAnother: () => void;
  onConfirm: (cropped: Blob) => void;
}) {
  const t = useTranslations("imageCrop");
  const tCommon = useTranslations("common");
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [area, setArea] = useState<Area | null>(null);
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const zoomId = useId();

  const ready = source?.kind === "ready";
  const readyUrl = source?.kind === "ready" ? source.url : null;

  /** The next file starts centred and unzoomed, not where the last one was left. */
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setArea(null);
    setCommitting(false);
    setFailed(false);
  }

  async function confirm() {
    if (readyUrl === null || area === null) return;
    setCommitting(true);
    try {
      const blob = await cropToBlob(readyUrl, area, outputWidth, outputHeight);
      reset();
      onConfirm(blob);
    } catch {
      setCommitting(false);
      setFailed(true);
    }
  }

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="relative mt-4 h-80 overflow-hidden rounded-md border border-border bg-lifted sm:h-96">
          {readyUrl !== null && (
            <Cropper
              image={readyUrl}
              crop={crop}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              aspect={outputWidth / outputHeight}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          )}
          {source?.kind === "unreadable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p role="alert" className="max-w-sm text-sm">
                {t("unreadable")}
              </p>
              <Button variant="outline" size="sm" onClick={onChooseAnother}>
                <Upload aria-hidden />
                {t("chooseAnother")}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label
            htmlFor={zoomId}
            className="shrink-0 text-sm text-muted-foreground"
          >
            {t("zoom")}
          </label>
          <input
            id={zoomId}
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!ready}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-act disabled:opacity-50"
          />
        </div>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {t("failed")}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            {tCommon("cancel")}
          </Button>
          <Button disabled={!ready || area === null || committing} onClick={confirm}>
            {confirmLabel ?? t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Draw the framed area of the image onto a canvas at the output size and
 * encode it. The area is in the image's own pixels, which is what the cropper
 * reports, so the output is the same whatever size the frame was on screen.
 */
async function cropToBlob(
  url: string,
  area: Area,
  width: number,
  height: number,
): Promise<Blob> {
  const image = new window.Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No 2D canvas context");
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    width,
    height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      "image/jpeg",
      0.9,
    );
  });
}
