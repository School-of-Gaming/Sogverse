import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavChevronProps {
  size?: "sm" | "md";
}

/**
 * Animated chevron-right icon for clickable rows/cards.
 * Nudges right on parent `group-hover`. Requires a `group` class on an ancestor.
 */
export function NavChevron({ size = "md" }: NavChevronProps) {
  return (
    <ChevronRight
      className={cn(
        "shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
      )}
    />
  );
}
