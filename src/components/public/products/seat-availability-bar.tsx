"use client";

import { Hourglass, Users } from "lucide-react";
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
 * full it is." Color escalates with scarcity (harmony → warning at ≤2 left). At
 * zero there's no fill to color, so fullness is communicated by the right-side
 * indicator instead.
 *
 * When full, the bar surfaces only the *actionable* state: a club with a
 * waiting list reads "Waitlist" (there's still something to do), while a full
 * club without one shows no chip at all — the "Full" label sitting beside the
 * bar already says so, and repeating it here is just noise. That makes this a
 * two-part arrangement rather than a self-contained one: a host that drops the
 * label has to bring the chip back, or a full club stops saying it anywhere.
 * The indicator sits on the seats-remaining row, right-aligned, in a
 * fixed-height row so the component's height never changes whether or not one
 * is present.
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

  // Room in a club is a community fact — how many other children fit — so the
  // normal state is harmony's. Scarcity is functional urgency rather than
  // grammar, so it keeps the warning token; and at 0 left there is no fill to
  // colour, so the escalation tops out there and fullness is shown by the
  // indicator below instead.
  const barColor = left <= 2 ? "bg-warning" : "bg-yty-harmony-strong";

  const remainingLabel = t("remaining", { count: left, total: seatCount });

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      {/* Fixed-height row: seats text on the left, full/waitlist indicator
          right-aligned. The min-height reserves the indicator's space so the
          component is the same height with or without one. */}
      <div className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        {/* min-w-0 + truncate (not whitespace-nowrap): the chip beside this is
            shrink-0, so when a locale makes both long ("0 / 8 places restantes"
            + "Liste d'attente") something must lose width — it has to be this
            text, degrading to an ellipsis, never the chip spilling out of the
            card. */}
        <span className="flex min-w-0 items-center gap-1">
          {/* The community fact wears one family top to bottom: the meter below
              fills harmony-strong, so its glyph here is harmony-soft and the
              count beside it stays muted — glyph carries the family, prose
              stays prose. */}
          <Users className="h-3 w-3 shrink-0 text-yty-harmony-soft" aria-hidden />
          <span className="truncate tabular-nums">{remainingLabel}</span>
        </span>
        {isFull && waitlistEnabled && (
          /* Harmony, not amber. The chip is a *label* on the community fact —
             every seat is taken, and there is still a queue you can ask to
             stand in — not a control, so the act family has no claim on it;
             the seat row's glyph and the meter it sits on say the same word.
             (The panel's actual waitlist button stays in the neutral emphasis
             tier: it is a lesser action than a signup, and a second coloured
             fill there would compete with the reading column's jump button.) */
          <StatusChip
            tone="harmony"
            icon={Hourglass}
            className="ml-auto shrink-0"
          >
            {t("waitlistAvailable")}
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
