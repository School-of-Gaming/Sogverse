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
 */
export function CollapsibleRegion({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="-mx-1 overflow-hidden px-1">{children}</div>
    </div>
  );
}
