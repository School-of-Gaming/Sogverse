"use client";

import { useEffect, useRef, useState } from "react";
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
 * How long to wait before each re-attempt at a picture that would not load.
 *
 * **A row lands before its bytes.** The upload route writes the message row
 * first — that is what keeps the send guard in front of the storage write — and
 * the row reaches every other subscriber over realtime the instant it exists,
 * which can be before the object has finished landing. No second event
 * corrects it: there is nothing to fire when an upload completes. So the
 * renderer retries a handful of times over a couple of seconds, which is the
 * whole width of the window that can be open, and then stops.
 *
 * Three attempts totalling ~2.4 s, and bounded on purpose: past that the
 * picture is not late, it is missing (a hidden message's mint refused, an
 * upload that failed and left a tombstone), and a renderer hammering a URL that
 * will never answer is worse than a blank box. The box is arithmetic from the
 * stored dimensions either way, so none of this can move the log.
 */
const IMAGE_RETRY_DELAYS_MS = [300, 700, 1400];

/**
 * One thumbnail, at its arithmetic size, with that bounded retry.
 *
 * The retried URL carries a `retry` parameter it did not have before. That is
 * cache-busting rather than addressing — a browser that has just cached a 404
 * would otherwise answer every re-attempt itself — and it is added only to a
 * real http(s) URL: a blob URL cannot take a query string, and it also cannot
 * 404, so neither half of this applies to one.
 */
function ChatThumbnail({ image }: { image: ChatImageRef }) {
  // The attempt count is held *with* the URL it belongs to, and reset during
  // render when they disagree — the same shape the open-index guard below uses.
  // A different `src` is a different question (a re-minted URL, a picture that
  // finally resolved), so it starts over rather than carrying the previous
  // URL's failures into it; an effect that reset it afterwards would be a
  // render's worth of retrying the wrong thing.
  const [retry, setRetry] = useState({ src: image.src, attempt: 0 });
  const timerRef = useRef<number | null>(null);

  if (retry.src !== image.src) {
    setRetry({ src: image.src, attempt: 0 });
  }

  // **A pending re-attempt belongs to the URL that failed, and dies with it.**
  // The cleanup runs on a changed `src` as well as on unmount, because a timer
  // left running would fire against the NEW URL, bump the attempt count and
  // hand a working picture a cache-busted one — a fresh download of something
  // the reader is already looking at. The callback below re-checks the src it
  // was scheduled for as well, which is what covers the window between the
  // render that changed it and this cleanup.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [image.src],
  );

  const attempt = retry.src === image.src ? retry.attempt : 0;
  const retryable = image.src.startsWith("http");
  const src =
    attempt === 0 || !retryable
      ? image.src
      : `${image.src}${image.src.includes("?") ? "&" : "?"}retry=${attempt}`;

  return (
    <Image
      src={src}
      alt=""
      width={chatThumbnailWidth(image.width, image.height)}
      height={CHAT_IMAGE_THUMB_HEIGHT}
      unoptimized
      onError={() => {
        if (!retryable || attempt >= IMAGE_RETRY_DELAYS_MS.length) return;
        // One timer at a time: overwriting the handle without clearing it would
        // strand a timeout nothing can cancel afterwards.
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        const failed = image.src;
        timerRef.current = window.setTimeout(() => {
          setRetry((current) =>
            // The URL this was scheduled for, or nothing: a picture that has
            // since resolved to a different one is not the question that failed.
            current.src === failed
              ? { ...current, attempt: current.attempt + 1 }
              : current,
          );
        }, IMAGE_RETRY_DELAYS_MS[attempt]);
      }}
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
          read through a SIGNED URL, which is minted per viewer and rotates, so
          the optimizer would cache nothing it could ever serve twice — and
          bypassing it is also what keeps the private `chat-images` bucket out
          of `images.remotePatterns`, where a pattern would be an optimizer
          permission on a bucket whose whole read boundary is a storage policy.
          The other two kinds of `src` this component meets, a blob URL and
          fixture art, the optimizer cannot fetch at all. */}
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
