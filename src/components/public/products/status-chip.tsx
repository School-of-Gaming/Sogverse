import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Small rounded outline chip with a tinted icon + label. Quiet enough to sit
// next to a busy thumbnail or a progress bar but legible at a glance. Shared by
// the registration pill (browse card) and the seat-availability bar so the two
// surfaces speak with one visual voice.
export type ChipTone = "primary" | "warning" | "info" | "muted";

// Semantic tone per chip. Keeps the colour decision in one place.
const TONE_OUTLINE: Record<ChipTone, string> = {
  primary: "border-primary/40 text-primary",
  warning: "border-warning/50 text-warning",
  info: "border-info/40 text-info",
  muted: "border-border text-muted-foreground",
};

export function StatusChip({
  tone,
  icon: Icon,
  children,
  className,
}: {
  tone: ChipTone;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium",
        TONE_OUTLINE[tone],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}
