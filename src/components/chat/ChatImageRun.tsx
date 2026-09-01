"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FullscreenImageViewer } from "@/components/ui/fullscreen-image-viewer";
import { cn } from "@/lib/utils";
import {
  CHAT_IMAGE_THUMB_HEIGHT,
  chatThumbnailWidth,
} from "./chat-image-geometry";
import type { ChatDelivery, ChatImageRef } from "./types";

/**
 * One thumbnail, at its arithmetic size.
 *
 * **No retry machinery, deliberately — a `src` this component is handed is
 * never early.** The container resolves a stored picture's URL only once the
 * row itself says the bytes have landed (`image_stored_at`, whose realtime
 * arrival is the announcement), so by the time an address reaches this element
 * the object provably exists; until then the run draws the container's
 * always-loadable placeholder inside the same arithmetic box. A load failure
 * here is therefore the ordinary kind every image on the platform can meet —
 * a network blip, a session that expired under the tab — and it degrades to
 * the quiet empty box rather than to a re-attempt loop. A bounded retry used
 * to live here to paper over the row-before-bytes window; the window is closed
 * where it was opened, and the renderer stays dumb.
 */
function ChatThumbnail({ image }: { image: ChatImageRef }) {
  return (
    <Image
      src={image.src}
      alt=""
      width={chatThumbnailWidth(image.width, image.height)}
      height={CHAT_IMAGE_THUMB_HEIGHT}
      unoptimized
      style={{ height: CHAT_IMAGE_THUMB_HEIGHT }}
      className="w-auto max-w-full rounded-md border border-border bg-muted object-contain"
    />
  );
}

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
  deliveries,
  overlay,
  footer,
  className,
}: {
  images: readonly ChatImageRef[];
  /**
   * Where each picture is in its own round trip, positionally.
   *
   * A burst is one message per picture, so a photo the server never took is a
   * *failed message* — and a run with no delivery at all would draw a pending
   * upload as a finished one. Omitted where the caller already answers for
   * delivery a level up, which is the single-image case inside a message row.
   */
  deliveries?: readonly ChatDelivery[];
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
  /**
   * Per-thumbnail content *below* the picture — the reactions standing on that
   * one message, and its retry line when it did not go.
   *
   * Under the picture rather than over it because both of those are content a
   * reader acts on rather than an affordance that appears on hover, and a pill
   * floating over the photograph it counts would cover the thing being reacted
   * to. It grows the thumbnail's own cell downward, which in a wrapping row
   * moves nothing already drawn to the left of it.
   */
  footer?: (index: number) => React.ReactNode;
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
      <ul
        aria-label={t("row")}
        className={cn("flex flex-wrap items-start gap-1.5", className)}
      >
        {images.map((image, index) => (
          <li key={image.id} className="group/thumb relative max-w-full shrink-0">
            <button
              type="button"
              aria-label={t("open", { index: index + 1, count: images.length })}
              onClick={(event) => {
                triggerRef.current = event.currentTarget;
                setOpenIndex(index);
              }}
              className={cn(
                "inline-flex max-w-full rounded-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // The same dimming a pending text bubble wears, on the one
                // thing a pending picture has to show it with.
                deliveries?.[index] === "pending" && "opacity-60",
              )}
            >
              <ChatThumbnail image={image} />
            </button>
            {overlay?.(index)}
            {footer?.(index)}
          </li>
        ))}
      </ul>

      {/* The overlay is the shared one, handed this burst and this surface's
          own words. A chat image already carries a servable `src` — the
          container resolved it — so there is nothing to adapt between the run
          and the viewer.

          `unoptimized` is set here and on every thumbnail above, and the
          wire-up settled why rather than inheriting it: a stored chat image is
          served by an authenticated app route that answers on the viewer's own
          session COOKIES, which the optimizer's server-side fetch does not
          carry — so an optimized request could only ever 404 — and bypassing
          it is also what keeps the private chat-images surface out of
          `images.remotePatterns`, where a pattern would be an optimizer
          permission on a boundary that is one storage policy. The other two
          kinds of `src` this component meets, a blob URL and fixture art, the
          optimizer cannot fetch at all. */}
      <FullscreenImageViewer
        images={images}
        index={openIndex}
        onIndexChange={setOpenIndex}
        unoptimized
        labels={{
          viewer: (position, count) => t("viewer", { index: position, count }),
          previous: t("previous"),
          next: t("next"),
          close: t("close"),
        }}
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
