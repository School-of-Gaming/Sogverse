"use client";

import { cn } from "@/lib/utils";

/**
 * A region that animates open and closed by growing **downward**, leaving
 * everything above it exactly where it was.
 *
 * The `grid-rows-[0fr] → [1fr]` trick (same one the voice room uses for its
 * screen-share panel) is what makes that possible: the row track animates from
 * zero to the content's natural height without anyone having to measure it, so
 * there is no `max-height` guess to overshoot and no jump at the end. Content
 * stays mounted across the transition — that's what gives the close animation
 * something to shrink — and is marked `inert` while closed so collapsed
 * textareas and radios can't be tabbed into or read out.
 *
 * **Why the inner box is padded and then pulled back out.** The clip that makes
 * the animation work (`overflow-hidden`, unavoidable: CSS has no way to clip one
 * axis and not the other) also shaves the focus ring off any field that reaches
 * the region's edge — a full-width textarea inside loses the left and right of
 * its ring. Clipping happens at the *padding* box, so `px-1` buys exactly the
 * ring's width back and `-mx-1` puts the content down where it was; the region
 * looks identical and the ring has somewhere to live. It is horizontal only:
 * vertical padding would survive the collapse to `0fr` and leave a sliver of
 * content showing when the region is shut. Content whose **top or bottom** row
 * is focusable adds its own `pt-*`/`pb-*` for the same reason.
 *
 * **`instant` drops the transition and keeps everything else.** A region whose
 * height change is being chased by a scroll correction cannot animate: the
 * correction runs once, before paint, and geometry that is still moving after
 * that would need it to re-run every frame. Such a region still wants this
 * component for the rest of what it does — staying mounted while shut, going
 * `inert`, clipping its own overflow — so the animation is a flag rather than a
 * reason to hand-roll the region somewhere else.
 */
export function CollapsibleRegion({
  open,
  instant = false,
  className,
  children,
}: {
  open: boolean;
  /** Skip the open/close transition; the new height is final immediately. */
  instant?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      inert={!open}
      className={cn(
        "grid",
        !instant &&
          "transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="-mx-1 overflow-hidden px-1">{children}</div>
    </div>
  );
}
