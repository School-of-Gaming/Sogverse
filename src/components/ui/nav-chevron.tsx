import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavChevronProps {
  size?: "sm" | "md";
  /**
   * Overrides for the caller's context — in practice the colour. The default
   * muted tone suits a chevron sitting alone in a corner; one paired with a
   * worded hint has to match that word's colour instead, or the pair reads as
   * two unrelated marks rather than one affordance.
   */
  className?: string;
}

/**
 * Animated chevron-right icon for clickable rows/cards.
 * Nudges right on parent `group-hover`. Requires a `group` class on an ancestor.
 */
export function NavChevron({ size = "md", className }: NavChevronProps) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
        className,
      )}
    />
  );
}
