"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import { cn } from "@/lib/utils";
import {
  SESSION_PHOTO_THUMB_HEIGHT,
  sessionThumbnailWidth,
} from "./session-photo-geometry";
import { SessionPhotoViewer } from "./SessionPhotoViewer";
import type { SessionPhoto } from "./types";

/**
 * A session's photos, as both feeds draw them: a wrapping row of thumbnails
 * that share a height and keep their own shapes, each opening full-screen when
 * tapped.
 *
 * **Shared because it has to be.** A family surface cannot import gedu code —
 * that line is enforced, not promised — so the one component both the staff
 * card and the family card render lives here, taking a structural photo type
 * that either document's rows satisfy. Photos are *content*, like the report
 * beside them, which is why this renders in a card's read state on both feeds
 * regardless of whether an editor is open.
 *
 * **Centred in its row.** A wrapping run of natural widths almost never fills
 * its last line, and a left-packed remainder reads as a row that failed to
 * finish rather than as a set. Centring costs nothing — every box keeps its own
 * width and the wrap points are unchanged — and it puts the slack where it
 * belongs, split evenly outside the pictures.
 *
 * **Fixed height, natural width, uncropped.** Photos arrive as mixed ratios —
 * 16:9 screenshots mostly, with the odd 1:1 or portrait — and cropping them to
 * a common box would cut a build in half to make a grid tidy. Sharing a
 * *height* instead gives the row a baseline and a cap, lets each picture keep
 * its own width, and makes wrapping the only thing that has to happen when the
 * row runs out of room. At the 360 px floor that usually means one photo per
 * line and a portrait sharing its line with a landscape; on a desktop card the
 * whole set sits in one row.
 *
 * **Every number comes from the stored dimensions, none from a decoded image.**
 * The box is already the right shape in the server's HTML, so the feed does not
 * shuffle itself as five JPEGs land — the same discipline the report clamp
 * beside it follows.
 *
 * **Which photo is open lives here**, because the answer is per-gallery and
 * nothing outside one has any use for it: a card renders a gallery, the gallery
 * owns its overlay, and no page has to thread viewer state through a feed. The
 * overlay pages through the same list this row draws, so the open *position*
 * is the state and the viewer is handed both — a controlled overlay with no
 * second copy of the list to fall out of step with this one. Closing puts focus
 * back on the thumbnail that was pressed — the overlay cannot do that itself,
 * since the trigger is this component's.
 */
export function SessionPhotoGallery({
  photos,
  className,
}: {
  /** The session's photos in stored order — oldest first, as both feeds emit. */
  photos: readonly SessionPhoto[];
  className?: string;
}) {
  const t = useTranslations("sessionFeed");
  // Which photo is open, as a position in the list — because the overlay pages
  // through that list, and a position is the only thing "the next one" can be
  // said against. The risk an index carries is that the list changes underneath
  // it; the viewer reads through it defensively for exactly that reason, and a
  // list that empties takes the whole gallery (and its overlay) off the page at
  // the guard below.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The thumbnail that opened the viewer, so focus has somewhere to land when
  // it closes. A ref rather than state: nothing renders differently for it.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // No photos, no row. An empty strip would be a slot held open for something
  // that is not coming — the layout rule's own corollary — and the card's other
  // blocks would sit a gap further apart for nothing.
  if (photos.length === 0) return null;

  return (
    <>
      <ul
        aria-label={t("photos.list")}
        className={cn("flex flex-wrap justify-center gap-2", className)}
      >
        {photos.map((photo, index) => (
          // `shrink-0` so a row that runs out of width wraps instead of
          // squeezing its pictures narrower than their own shape.
          <li key={photo.id} className="max-w-full shrink-0">
            <button
              type="button"
              aria-label={t("photos.open", {
                index: index + 1,
                count: photos.length,
              })}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setOpenIndex(index);
              }}
              // `inline-flex`, so the button is exactly the size of the one
              // picture inside it. A block button would take the whole row's
              // width and put a focus ring around empty space beside a
              // portrait photo.
              className="inline-flex max-w-full rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src={sessionImageUrl(photo.id)}
                // The button carries the accessible name — a photo with no
                // caption has nothing of its own to say, and repeating the
                // button's label as alt text would announce it twice.
                alt=""
                // The box, not the master: these two are what the optimizer
                // sizes its variant from, so a 2048 px screenshot is fetched at
                // thumbnail scale rather than whole. The width is derived from
                // the stored ratio, which is also what the browser lays the box
                // out from — `w-auto` against a fixed height reads the ratio
                // straight off these attributes, before any decode.
                width={sessionThumbnailWidth(photo.width, photo.height)}
                height={SESSION_PHOTO_THUMB_HEIGHT}
                // `contain` rather than `cover`: uncropped is the whole point,
                // and it is also what makes the two places the box can disagree
                // with the picture — a rounded half-pixel, a clamped extreme
                // ratio — letterbox harmlessly instead of cutting an edge off.
                // The fixed height and the auto width are the layout: the
                // browser reads the ratio off the two attributes above and
                // resolves the width from it, so the box is right before the
                // JPEG decodes and the row wraps on real widths. `max-w-full`
                // is the narrow-viewport backstop, and `contain` is what turns
                // it into a letterbox rather than a crop.
                className="h-28 w-auto max-w-full rounded-md border border-border bg-muted object-contain sm:h-36"
              />
            </button>
          </li>
        ))}
      </ul>

      <SessionPhotoViewer
        photos={photos}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => {
          setOpenIndex(null);
          // Back to the thumbnail that was pressed — not to whichever one the
          // overlay ended on. The trigger is where the reader's place on the
          // page is, and paging inside an overlay never moved it.
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
