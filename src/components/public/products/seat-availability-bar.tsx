"use client";

import { Hourglass, Users, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { StatusChip } from "./status-chip";

export interface SeatAvailabilityBarProps {
  /** Total capacity. `null` means no cap is set — the component renders nothing. */
  seatCount: number | null;
  /** Seats still open. Clamped to [0, seatCount] internally. */
  seatsLeft: number;
  /** Whether a waiting list opens once the club is full. */
  waitlistEnabled: boolean;
  className?: string;
}

/**
 * Shared seat-availability bar for product cards and the product detail panel.
 *
 * The bar tracks seats *remaining*: an empty club starts full and drains toward
 * empty as it fills — so the visual maps to "how much room is left," not "how
 * full it is." Color escalates with scarcity (green → yellow at ≤2 left). At
 * zero there's no fill to color, so fullness is communicated by the right-side
 * indicator instead.
 *
 * Full vs. waitlist are mutually exclusive: a full club with a waiting list
 * reads "Waiting list available" (there's still an action), and only a full
 * club without one reads "Full". The indicator sits on the seats-remaining row,
 * right-aligned, in a fixed-height row so the component's height never changes
 * whether or not an indicator is present.
 */
export function SeatAvailabilityBar({
  seatCount,
  seatsLeft,
  waitlistEnabled,
  className,
}: SeatAvailabilityBarProps) {
  const t = useTranslations("seatAvailability");

  // No cap set → nothing to show (matches the card's null-seat behavior).
  if (seatCount === null) return null;

  const left = Math.max(0, Math.min(seatsLeft, seatCount));
  const isFull = left === 0;
  const pct = seatCount > 0 ? (left / seatCount) * 100 : 0;

  // No red: at 0 left the bar has no fill to color, so scarcity tops out at
  // yellow (≤2 seats), and fullness is shown by the indicator below instead.
  const barColor = left <= 2 ? "bg-warning" : "bg-success";

  const remainingLabel = t("remaining", { count: left, total: seatCount });

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      {/* Fixed-height row: seats text on the left, full/waitlist indicator
          right-aligned. The min-height reserves the indicator's space so the
          component is the same height with or without one. */}
      <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          <span className="whitespace-nowrap tabular-nums">{remainingLabel}</span>
        </span>
        {isFull && (
          <StatusChip
            tone="primary"
            icon={waitlistEnabled ? Hourglass : XCircle}
            className="ml-auto shrink-0"
          >
            {waitlistEnabled ? t("waitlistAvailable") : t("full")}
          </StatusChip>
        )}
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={remainingLabel}
        aria-valuenow={left}
        aria-valuemin={0}
        aria-valuemax={seatCount}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            barColor,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
