"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import { cn } from "@/lib/utils";
import type { SessionPhoto } from "./types";

/**
 * A session's photos, opened over the page they were tapped on.
 *
 * **Built on the `Dialog` primitive rather than beside it.** Dialog is the
 * repo's only full-viewport overlay and it already owns the parts that are easy
 * to get subtly wrong: the portal into `document.body`, the backdrop, the
 * z-layer, and an Escape key answered by exactly one dialog when several are
 * stacked. A lightbox that rolled its own would be a second answer to all four,
 * free to disagree with the first. The near-fullscreen box it opens at is a
 * *size* on that primitive for the same reason — a picture opened to be looked
 * at wants the whole screen, and that is a width cap, not a new overlay.
 *
 * **It holds the whole set, not one photo.** Somebody who opened a photo to
 * look at it is looking at the report's photos, not at that one file, and
 * closing the overlay to reach the next thumbnail costs a gesture and puts the
 * reader back on a page they had deliberately left. So the overlay pages, and
 * because it pages it needs the list.
 *
 * **The ends wrap.** At a cap of five the whole set is a short ring: wrapping
 * keeps both arrows live at every position, which means no control that sits
 * there unable to act — the same reasoning that hides the arrows entirely for a
 * single photo, where paging could never do anything at all.
 *
 * **Anything outside the picture closes it; the arrows do not.** Touch has no
 * hover and no Escape, so the forgiving gesture has to be the ordinary one: the
 * backdrop closes (Dialog's own), the margins beside a portrait photo close
 * (this component's), the image closes, and the corner button closes. The three
 * controls stop the click from reaching that handler, so pressing next is never
 * also a request to leave.
 *
 * **The picture is `contain`ed and sized from its own stored dimensions**, so it
 * is never cropped and never upscaled past its master, and the box is the right
 * shape before the JPEG decodes.
 */
export function SessionPhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  /** The set being browsed, in the order the gallery drew it. */
  photos: readonly SessionPhoto[];
  /** Which photo is open, as a 0-based index — or `null` for a closed viewer. */
  index: number | null;
  /** Page to another photo. The open index lives with the gallery. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("sessionFeed");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const count = photos.length;
  // An index is a claim about a list that can change underneath it, and the one
  // thing this must never do is resolve to nothing while the overlay is up. A
  // photo removed from another tab shortens the array; reading through it here
  // means a removal from the middle lands on the neighbour rather than on a
  // blank screen.
  //
  // The `?? null` is the backstop and not the handling: a position past the end
  // of the list has no neighbour to fall back to, and an overlay that "closed"
  // by rendering nothing would leave whoever owns the position still holding it
  // — so a list that grew back would put it up again unasked. That case is
  // dropped by the owner of the position, which is the only half that can.
  const photo = index === null ? null : (photos[index] ?? null);
  const open = photo !== null;

  // Focus the one control the overlay always owns as it opens. Without it a
  // keyboard or screen-reader user stays parked on the thumbnail *behind* the
  // overlay, with nothing announcing that anything happened. It deliberately
  // does not re-run on a page — moving focus back to Close every time somebody
  // pressed Next would take it off the button they are pressing. Where focus
  // goes on the way back out is the gallery's business: it is the half that
  // knows which thumbnail was pressed.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // The arrows are the pointer's way through the set and these are the
  // keyboard's. On `document` rather than on the dialog box, because the box is
  // not what holds focus after a page: the pressed arrow button does, and a
  // reader who clicked the picture holds nothing at all.
  const paging = open && count > 1;
  useEffect(() => {
    if (!paging || index === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange((index - 1 + count) % count);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndexChange((index + 1) % count);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paging, index, count, onIndexChange]);

  const step = (delta: number) => {
    if (index === null || count === 0) return;
    onIndexChange((index + delta + count) % count);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fullscreen"
    >
      {photo && index !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("photos.viewer", { index: index + 1, count })}
          onClick={onClose}
          // The dark ground the picture is read against — the theme's own
          // background over the primitive's backdrop, filling the whole box so
          // a 16:9 screenshot on a tall screen sits in darkness rather than in
          // a bright band of dashboard.
          className="relative flex h-full w-full items-center justify-center bg-background/80"
        >
          <Image
            src={sessionImageUrl(photo.id)}
            alt=""
            width={photo.width}
            height={photo.height}
            // `h-auto w-auto` with both caps is the replaced-element shrink-to-
            // fit: the browser scales the picture down to whichever of the two
            // bounds binds first and keeps the ratio from the attributes above,
            // so nothing is cropped and nothing is stretched. Both caps are the
            // viewport less the Dialog wrapper's own `p-4`.
            sizes="100vw"
            className="h-auto max-h-[calc(100vh-2rem)] w-auto max-w-full rounded-lg object-contain"
          />

          {/* Hidden outright for a set of one: an arrow that can never move is
              dead space, and the layout it would sit in is the picture. */}
          {count > 1 && (
            <>
              <ViewerNavButton
                side="left"
                label={t("photos.previous")}
                onActivate={() => step(-1)}
              />
              <ViewerNavButton
                side="right"
                label={t("photos.next")}
                onActivate={() => step(1)}
              />
            </>
          )}

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

/**
 * One of the two arrows, pinned to its side of the screen rather than to the
 * picture's edge — a portrait photo leaves margins wide enough to lose a button
 * in, and a reader reaching for "next" reaches for the side of the screen.
 *
 * **It stops the click.** Everything else in the overlay closes it, which is
 * what makes a stray tap forgiving; an arrow that also closed would make the
 * one deliberate gesture the exception nobody expects.
 */
function ViewerNavButton({
  side,
  label,
  onActivate,
}: {
  side: "left" | "right";
  label: string;
  onActivate: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}
