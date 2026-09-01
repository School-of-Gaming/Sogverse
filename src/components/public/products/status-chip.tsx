import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Rounded outline chip with an optional tinted icon + label. Quiet enough to
// sit next to a busy thumbnail or a progress bar but legible at a glance.
// Shared by the seat-availability bar (`sm`) and the browse-card price block
// (`md`) so those surfaces speak with one visual voice.
export type ChipTone = "primary" | "warning" | "info" | "muted";

// Two sizes: `sm` rides the seat-availability bar (text-xs, matching the
// seats-remaining row beside it); `md` stands in for a price-row badge — sized
// at `text-base` to line up with the €-price line it replaces (e.g. a free
// product's chip next to a paid one's "€250").
export type ChipSize = "sm" | "md";

// Semantic tone per chip. Keeps the colour decision in one place.
//
// Every tone's edge is at its authored value. An outline chip carries no filled
// ground, so the edge is most of its area and is what makes the tone readable;
// a low-alpha edge is the hue mixed toward the page behind it, which is a
// different colour rather than a quieter one.
const TONE_OUTLINE: Record<ChipTone, string> = {
  primary: "border-primary text-primary",
  warning: "border-warning text-warning",
  info: "border-info text-info",
  muted: "border-border text-muted-foreground",
};

const SIZE_CHIP: Record<ChipSize, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-3 py-1 text-base",
};

const SIZE_ICON: Record<ChipSize, string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
};

export function StatusChip({
  tone,
  size = "sm",
  icon: Icon,
  children,
  className,
}: {
  tone: ChipTone;
  size?: ChipSize;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-background font-medium",
        SIZE_CHIP[size],
        TONE_OUTLINE[tone],
        className,
      )}
    >
      {Icon && <Icon className={SIZE_ICON[size]} aria-hidden />}
      {children}
    </span>
  );
}
