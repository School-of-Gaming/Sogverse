"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ChatImageRef } from "./types";

/**
 * A chat image, opened over the room it was sent in.
 *
 * Built on the shared `Dialog` primitive at its fullscreen size, exactly as the
 * session-photo viewer is and for the same reasons: the portal, the backdrop,
 * the z-layer and an Escape answered by exactly one dialog are the parts that
 * are easy to get subtly wrong, and there must go on being one answer to each.
 *
 * It holds the whole burst rather than one picture, and pages through it with
 * arrows and the arrow keys, wrapping at both ends — somebody who opened one
 * image of five is looking at the five.
 */
export function ChatImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: readonly ChatImageRef[];
  /** Which image is open, as a 0-based position — `null` when closed. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("chat.images");
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const count = images.length;
  // Read through the position rather than holding the image itself: the list
  // can shorten underneath an open viewer (a moderator removing a picture),
  // and landing on the neighbour beats a blank screen.
  const image = index === null ? null : (images[index] ?? null);
  const open = image !== null;

  // Focus the one control the overlay always owns, once, as it opens. Not on
  // every page — that would take focus off the arrow being pressed.
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

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
          aria-label={t("viewer", { index: index + 1, count })}
          onClick={onClose}
          className="relative flex h-full w-full items-center justify-center bg-background/80"
        >
          <Image
            src={image.src}
            alt=""
            width={image.width}
            height={image.height}
            sizes="100vw"
            // Blob and fixture URLs alike: the optimizer has nothing to do with
            // a picture the browser already holds, and would refuse an origin
            // it does not know.
            unoptimized
            className="h-auto max-h-[calc(100vh-2rem)] w-auto max-w-full rounded-lg object-contain"
          />

          {count > 1 && (
            <>
              <ViewerNavButton
                side="left"
                label={t("previous")}
                onActivate={() => step(-1)}
              />
              <ViewerNavButton
                side="right"
                label={t("next")}
                onActivate={() => step(1)}
              />
            </>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("close")}
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
 * picture's edge — and stopping the click, because everything else in the
 * overlay closes it.
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
