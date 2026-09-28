"use client";

import type { ReactNode } from "react";
import { CalendarX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SessionLabels } from "./session-labels";

/**
 * A cancelled session, as both feeds draw it: a line in its dated place,
 * carrying the date and a "Cancelled" tag.
 *
 * **A line, not a card**, for the same reason a session with nothing written on
 * it is one: there is nothing to read about an evening that did not happen. It
 * is not dashed, though — the dashed line means "nothing was recorded", and a
 * cancelled session is not a gap in anybody's paperwork.
 *
 * **Its tone follows which side of the present it is on.** A date still ahead
 * is news somebody has to act on — a family who misses it turns up for a
 * session that is not running — so it takes the warning tone the way the kit's
 * status panel does: the line's own edge in the hue, the tag's edge, glyph and
 * word in the hue, the date in bold ink, and no ground of its own. It is the
 * entry itself wearing the status, not a panel nested inside the entry, so the
 * timeline still reads one entry per date. A date already behind us is history
 * with nothing left to do about it, so it stays quiet: muted ink and a neutral
 * tag. The time is struck through on both.
 *
 * `trailing` lands after the tag in the same right-packed cluster (the admin's
 * `⋯`), and `children` below the date row (the admin's reason and stamp). The
 * family feed passes neither.
 */
export function SessionCancelledLine({
  labels,
  upcoming,
  trailing = null,
  children = null,
}: {
  labels: SessionLabels;
  /** Whether the session had not yet ended at the feed's `now`. */
  upcoming: boolean;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const b = useTranslations("sessionBadge");

  return (
    <div
      data-tone={upcoming ? "warning" : "muted"}
      className={cn(
        "rounded-md border px-3 py-2 text-xs text-muted-foreground",
        upcoming ? "border-warning" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 tabular-nums">
          <span className={cn(upcoming && "font-semibold text-foreground")}>
            {labels.date}
          </span>
          <span className="line-through">{labels.timeRange}</span>
        </span>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-[10px] uppercase tracking-wide",
              upcoming ? "border-warning text-warning" : "text-muted-foreground",
            )}
          >
            <CalendarX className="h-3 w-3" aria-hidden />
            {b("cancelled")}
          </Badge>
          {trailing}
        </div>
      </div>
      {children}
    </div>
  );
}
