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
import {
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_WIDTH,
} from "@/services/team-profiles/team-profiles.types";

/** The file types the photo picker offers, and the only ones it accepts. */
export const TEAM_PHOTO_ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * The picked file as the dialog sees it: still being decoded, ready to crop,
 * or refused. The object URL belongs to the caller, which made it and revokes
 * it when the dialog closes.
 */
export type TeamPhotoSource =
  | { kind: "decoding"; url: string }
  | { kind: "ready"; url: string }
  | { kind: "unreadable" };

/**
 * Decode a picked file, so a format the browser cannot draw is refused in the
 * dialog rather than failing silently on the canvas. A type outside the three
 * accepted is refused without trying: the picker's filter is a suggestion the
 * reader can switch off.
 */
export async function decodeTeamPhoto(url: string, type: string) {
  if (!TEAM_PHOTO_ACCEPT.includes(type)) return false;
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
 * **The crop step between picking a photo and seeing it on the profile.**
 *
 * A fixed 4:5 frame, the photo dragged to position under it and zoomed with
 * the slider, the wheel or a pinch. Confirming draws the framed area onto a
 * canvas at the stored size, so what the preview shows is exactly what would
 * be uploaded, and hands the caller the result as a JPEG blob.
 *
 * **The footer is settled before the file is decoded**, as a dialog footer
 * has to be: decoding lands after first paint, so the two buttons are there
 * from the start and "Use photo" waits disabled. A file that cannot be read
 * replaces the frame's contents with the reason and a way to pick another;
 * the frame keeps its size throughout, so nothing below it moves.
 */
export function TeamPhotoCropDialog({
  source,
  onCancel,
  onChooseAnother,
  onConfirm,
}: {
  /** `null` closes the dialog. */
  source: TeamPhotoSource | null;
  onCancel: () => void;
  onChooseAnother: () => void;
  onConfirm: (cropped: Blob) => void;
}) {
  const t = useTranslations("team.edit.photo.crop");
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
      const blob = await cropToBlob(readyUrl, area);
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
          <DialogTitle>{t("title")}</DialogTitle>
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
              aspect={TEAM_PHOTO_WIDTH / TEAM_PHOTO_HEIGHT}
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
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Draw the framed area of the image onto a canvas at the stored size and
 * encode it. The area is in the image's own pixels, which is what the cropper
 * reports, so the output is the same whatever size the frame was on screen.
 */
async function cropToBlob(url: string, area: Area): Promise<Blob> {
  const image = new window.Image();
  image.src = url;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = TEAM_PHOTO_WIDTH;
  canvas.height = TEAM_PHOTO_HEIGHT;
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
    TEAM_PHOTO_WIDTH,
    TEAM_PHOTO_HEIGHT,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
      "image/jpeg",
      0.9,
    );
  });
}
