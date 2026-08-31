"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import type { SessionPhoto } from "./types";

/**
 * One session photo, opened over the page it was tapped on.
 *
 * **Built on the `Dialog` primitive rather than beside it.** Dialog is the
 * repo's only full-viewport overlay and it already owns the parts that are easy
 * to get subtly wrong: the portal into `document.body`, the backdrop, the
 * z-layer, and an Escape key answered by exactly one dialog when several are
 * stacked. A lightbox that rolled its own would be a second answer to all four,
 * free to disagree with the first.
 *
 * **There is no previous/next.** At a cap of five photos every thumbnail is
 * visible in one row behind this overlay, so close-and-tap-the-next is the same
 * number of gestures as a next arrow — and it needs no arrows, no swipe
 * handling and no wrap-around rule.
 *
 * **Anything outside the picture closes it, and so does the picture.** Touch has
 * no hover and no Escape, so the forgiving gesture has to be the ordinary one:
 * the backdrop closes (Dialog's own), the margins beside a portrait photo close
 * (this component's), the image closes, and the corner button closes for anyone
 * looking for a control to press. With nothing to page through, a tap that
 * lands anywhere can only have meant "I am done".
 *
 * **The picture is `contain`ed and sized from its own stored dimensions**, so it
 * is never cropped and never upscaled past its master, and the box is the right
 * shape before the JPEG decodes.
 */
export function SessionPhotoViewer({
  photo,
  index,
  count,
  onClose,
}: {
  /** The photo to show, or `null` for a closed viewer. */
  photo: SessionPhoto | null;
  /** 1-based position in the gallery, for the spoken label. */
  index: number;
  /** How many photos the session has, for the same label. */
  count: number;
  onClose: () => void;
}) {
  const t = useTranslations("sessionFeed");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Focus the one control the overlay owns as it opens. Without it a keyboard
  // or screen-reader user stays parked on the thumbnail *behind* the overlay,
  // with nothing announcing that anything happened. Where focus goes on the way
  // back out is the gallery's business — it is the half that knows which
  // thumbnail was pressed.
  const open = photo !== null;
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="wide"
    >
      {photo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("photos.viewer", { index, count })}
          onClick={onClose}
          className="relative flex w-full items-center justify-center"
        >
          <Image
            src={sessionImageUrl(photo.id)}
            alt=""
            width={photo.width}
            height={photo.height}
            // `h-auto w-auto` with both caps is the replaced-element shrink-to-
            // fit: the browser scales the picture down to whichever of the two
            // bounds binds first and keeps the ratio from the attributes above,
            // so nothing is cropped and nothing is stretched. The 2rem is the
            // Dialog wrapper's own `p-4`, top and bottom.
            sizes="(min-width: 1200px) 1152px, 100vw"
            className="h-auto max-h-[calc(100vh-2rem)] w-auto max-w-full rounded-lg object-contain"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("photos.close")}
            className="absolute right-2 top-2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}
    </Dialog>
  );
}
