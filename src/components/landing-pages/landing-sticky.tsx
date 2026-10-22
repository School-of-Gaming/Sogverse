"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { usePublishedHeight } from "@/hooks/use-published-height";
import { scrollToAnchor } from "@/lib/navigation/scroll-to-anchor";
import { cn } from "@/lib/cn";

/**
 * The two client halves of a landing page's sticky section: the column that
 * holds it, and the button that jumps down to it. The page body places both
 * and owns every breakpoint they switch at.
 */

/**
 * The element holding the sticky section, its own height published as
 * `--landing-rail-height` so its sticky inset can clamp at both ends, as the
 * product page's signup rail does: a column taller than the window scrolls
 * with the page until its bottom meets the viewport's, so its button is never
 * out of reach. The classes, and with them where it is sticky at all, are the
 * page body's.
 */
export function LandingStickyRail({
  id,
  className,
  children,
}: {
  /** What the jump button scrolls to. */
  id: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref, "--landing-rail-height");
  return (
    <div id={id} ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * **The way down to the sticky section where it sits at the page's end.**
 * Text only, in the section's own button's words, so it names the action the
 * reader is going to take in the word they will meet there. It renders with
 * the page — no measurement, no reveal once something has scrolled past — and
 * its scroll is the direct result of the tap; where the target lands is the
 * target's own `scroll-mt`.
 */
export function LandingStickyJump({
  target,
  label,
  className,
}: {
  target: string;
  label: string;
  /** Its spacing, and the width from which it is withdrawn: the page's. */
  className: string;
}) {
  return (
    <Button
      type="button"
      size="lg"
      // Outlined: the hero's own button keeps the page's one act fill, and
      // this is a way down the page rather than the page's ask.
      variant="outline"
      // Full width at phone width, where a thumb should not have to find it;
      // natural width from `sm`, where a full-width button reads as a banner.
      className={cn("w-full sm:w-auto", className)}
      onClick={() => scrollToAnchor(target)}
    >
      {label}
    </Button>
  );
}
