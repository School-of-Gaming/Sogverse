"use client";

import type { ReactNode } from "react";
import { CalendarX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { SessionLabels } from "./session-labels";

/**
 * A cancelled session, as both feeds draw it: a quiet line in its dated place,
 * carrying the date and a neutral "Cancelled" tag.
 *
 * **A line, not a card**, for the same reason a session with nothing written on
 * it is one: there is nothing to read about an evening that did not happen. It
 * is not dashed, though — the dashed line means "nothing was recorded", and a
 * cancelled session is not a gap in anybody's paperwork.
 *
 * **Neutral, never a warning.** A cancellation is news, not a fault, and nothing
 * on the reader's side is owed about it; the time is struck through and the tag
 * wears the muted ink, so the line reads as "this one is off" at a glance
 * without competing with a session that needs attention.
 *
 * `trailing` lands after the tag in the same right-packed cluster (the admin's
 * `⋯`), and `children` below the date row (the admin's reason and stamp). The
 * family feed passes neither.
 */
export function SessionCancelledLine({
  labels,
  trailing = null,
  children = null,
}: {
  labels: SessionLabels;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const b = useTranslations("sessionBadge");

  return (
    <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 tabular-nums">
          <span>{labels.date}</span>
          <span className="line-through">{labels.timeRange}</span>
        </span>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
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
