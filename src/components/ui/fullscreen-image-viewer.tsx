"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * One picture, as this overlay needs it: already-servable source plus the
 * stored dimensions. What produces the `src` — a storage helper, a blob URL,
 * fixture art — is the calling surface's business and never this one's.
 */
export interface FullscreenViewerImage {
  src: string;
  width: number;
  height: number;
}

/**
 * The four strings the overlay says, handed in by whoever opened it.
 *
 * **Labels are props rather than a namespace of this component's own**, because
 * the surfaces genuinely word them differently — a session card is showing
 * *photos* and a chat log is showing *images* — and each surface already owns a
 * namespace those strings live in. A shared namespace would either force one
 * vocabulary on both or hold two spellings of the same key; a prop lets each
 * caller keep its own words and keeps this component out of `messages/`
 * entirely.
 *
 * `viewer` is a function rather than a string because the name changes as the
 * overlay pages, and the position it names is the one this component resolved.
 */
export interface FullscreenImageViewerLabels {
  /** The overlay's accessible name, from the 1-based position and the count. */
  viewer: (position: number, count: number) => string;
  previous: string;
  next: string;
  close: string;
}

/**
 * A set of pictures, opened over whatever they were tapped on.
 *
 * **One viewer, two collections.** The session feed hands it a report's photo
 * set and the chat log hands it one send's burst; what differs between those
 * surfaces is which pictures belong together and where their URLs come from,
 * and neither of those is a fullscreen overlay's business. Everything that *is*
 * — opening, paging, wrapping, the counter, closing, where focus lands — is one
 * set of expectations on both, so it is one component. The two galleries keep
 * their own rows and their own notion of a set.
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
 * **It holds the whole set, not one picture.** Somebody who opened a photo to
 * look at it is looking at the set it belongs to, not at that one file, and
 * closing the overlay to reach the next thumbnail costs a gesture and puts the
 * reader back on a page they had deliberately left. So the overlay pages, and
 * because it pages it needs the list.
 *
 * **The ends wrap.** A short set is a ring: wrapping keeps both arrows live at
 * every position, which means no control that sits there unable to act — the
 * same reasoning that hides the arrows entirely for a single picture, where
 * paging could never do anything at all.
 *
 * **Anything outside the picture closes it; the controls do not.** Touch has no
 * hover and no Escape, so the forgiving gesture has to be the ordinary one: the
 * backdrop closes (Dialog's own), the margins beside a portrait picture close
 * (this component's), the image closes, and the corner button closes. The three
 * controls stop the click from reaching that handler, so pressing next is never
 * also a request to leave.
 *
 * **The picture is `contain`ed and sized from its own stored dimensions**, so it
 * is never cropped and never upscaled past its master, and the box is the right
 * shape before the JPEG decodes.
 */
export function FullscreenImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  labels,
  unoptimized = false,
}: {
  /** The set being browsed, in the order the gallery drew it. */
  images: readonly FullscreenViewerImage[];
  /** Which picture is open, as a 0-based index — or `null` for a closed viewer. */
  index: number | null;
  /** Page to another picture. The open index lives with the gallery. */
  onIndexChange: (index: number) => void;
  onClose: () => void;
  labels: FullscreenImageViewerLabels;
  /**
   * Whether to bypass Next's image optimizer.
   *
   * A decision only the calling surface can make, because it is the half that
   * knows where a `src` came from: stored session photos are exactly what the
   * optimizer is for, while a blob URL or fixture art is something it cannot
   * fetch at all. The overlay is handed a URL somebody else produced and could
   * not tell one kind from the other.
   */
  unoptimized?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const count = images.length;
  // An index is a claim about a list that can change underneath it, and the one
  // thing this must never do is resolve to nothing while the overlay is up. A
  // picture removed from another tab shortens the array; reading through it
  // here means a removal from the middle lands on the neighbour rather than on
  // a blank screen.
  //
  // The `?? null` is the backstop and not the handling: a position past the end
  // of the list has no neighbour to fall back to, and an overlay that "closed"
  // by rendering nothing would leave whoever owns the position still holding it
  // — so a list that grew back would put it up again unasked. That case is
  // dropped by the owner of the position, which is the only half that can.
  const image = index === null ? null : (images[index] ?? null);
  const open = image !== null;

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
      {image !== null && index !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.viewer(index + 1, count)}
          onClick={onClose}
          // The dark ground the picture is read against — the theme's own
          // background over the primitive's backdrop, filling the whole box so
          // a 16:9 screenshot on a tall screen sits in darkness rather than in
          // a bright band of dashboard.
          className="relative flex h-full w-full items-center justify-center bg-background/80"
        >
          <Image
            src={image.src}
            alt=""
            width={image.width}
            height={image.height}
            // `h-auto w-auto` with both caps is the replaced-element shrink-to-
            // fit: the browser scales the picture down to whichever of the two
            // bounds binds first and keeps the ratio from the attributes above,
            // so nothing is cropped and nothing is stretched. Both caps are the
            // viewport less the Dialog wrapper's own `p-4`.
            sizes="100vw"
            unoptimized={unoptimized}
            className="h-auto max-h-[calc(100vh-2rem)] w-auto max-w-full rounded-lg object-contain"
          />

          {/* Hidden outright for a set of one: an arrow that can never move is
              dead space, and the layout it would sit in is the picture. */}
          {count > 1 && (
            <>
              <ViewerNavButton
                side="left"
                label={labels.previous}
                onActivate={() => step(-1)}
              />
              <ViewerNavButton
                side="right"
                label={labels.next}
                onActivate={() => step(1)}
              />
            </>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="absolute right-2 top-2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
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
 * picture's edge — a portrait picture leaves margins wide enough to lose a
 * button in, and a reader reaching for "next" reaches for the side of the
 * screen.
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
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </button>
  );
}
