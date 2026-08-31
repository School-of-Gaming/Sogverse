"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  CHAT_IMAGE_THUMB_HEIGHT,
  chatThumbnailWidth,
} from "./chat-image-geometry";
import { ChatImageViewer } from "./ChatImageViewer";
import type { ChatImageRef } from "./types";

/**
 * A burst of images, as one wrapping row.
 *
 * The composer stages and the send fans out, so a set of pictures arrives as
 * several messages a millisecond apart; the grouping folds them back into one
 * visual unit and this draws it. Shared height, natural widths, wrapping,
 * left-packed — the same row the session gallery draws, with one deliberate
 * difference: it is **not** centred here. A session card's gallery is the
 * card's content and sits in the middle of it; a chat run hangs off a sender's
 * column and has to line up with the words above and below it.
 *
 * **Every box is arithmetic from the stored dimensions**, so the log does not
 * reshuffle as the pictures decode — which in a scrolling, auto-sticking log is
 * not a nicety: a row that grew after paint would move everything a reader was
 * looking at.
 */
export function ChatImageRun({
  images,
  overlay,
  className,
}: {
  images: readonly ChatImageRef[];
  /**
   * Per-thumbnail controls, drawn over the picture's top-right corner.
   *
   * The seam exists because a burst is *several messages* wearing one visual
   * unit: a moderator removes one picture, not the set, and a reader replies to
   * one picture. So the run stays a pure row and whoever knows about messages
   * hands it the controls, positioned by the run so every thumbnail's sit the
   * same. Absolutely positioned, so a control appearing on hover moves nothing.
   */
  overlay?: (index: number) => React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("chat.images");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // A list that shortens past the open position closes the overlay in the
  // render that notices, rather than leaving a position nothing can resolve.
  if (openIndex !== null && openIndex >= images.length) {
    setOpenIndex(null);
  }

  if (images.length === 0) return null;

  return (
    <>
      <ul aria-label={t("row")} className={cn("flex flex-wrap gap-1.5", className)}>
        {images.map((image, index) => (
          <li key={image.id} className="group/thumb relative max-w-full shrink-0">
            <button
              type="button"
              aria-label={t("open", { index: index + 1, count: images.length })}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setOpenIndex(index);
              }}
              className="inline-flex max-w-full rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Image
                src={image.src}
                alt=""
                width={chatThumbnailWidth(image.width, image.height)}
                height={CHAT_IMAGE_THUMB_HEIGHT}
                unoptimized
                style={{ height: CHAT_IMAGE_THUMB_HEIGHT }}
                className="w-auto max-w-full rounded-md border border-border bg-muted object-contain"
              />
            </button>
            {overlay?.(index)}
          </li>
        ))}
      </ul>

      <ChatImageViewer
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => {
          setOpenIndex(null);
          // Back to the thumbnail that was pressed, never to whichever one the
          // overlay ended on: that is where the reader's place is.
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
