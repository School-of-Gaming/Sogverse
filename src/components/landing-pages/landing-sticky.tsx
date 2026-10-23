"use client";

import { useRef, type ReactNode } from "react";
import { usePublishedHeight } from "@/hooks/use-published-height";

/**
 * The element holding one sticky section, its own height published as
 * `--landing-rail-height` on itself so its sticky inset can clamp at both
 * ends, as the product page's signup rail does: a column taller than the
 * window scrolls with the page until its bottom meets the viewport's, so its
 * button is never out of reach. The property is written on this element, so a
 * page with a card on each side has two rails each reading its own height. The
 * classes, and with them where it is sticky at all, are the page body's.
 */
export function LandingStickyRail({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref, "--landing-rail-height");
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
