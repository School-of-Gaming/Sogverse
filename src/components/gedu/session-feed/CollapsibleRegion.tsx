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
 * textareas and checkboxes can't be tabbed into or read out.
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
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
