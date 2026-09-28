"use client";

import type { ReactNode } from "react";
import { CalendarX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { SessionLabels } from "./session-labels";

/**
 * A cancelled session, as both feeds draw it, in its dated place.
 *
 * **Its shape follows which side of the present it is on.** A date still ahead
 * is news somebody has to act on — a family who misses it turns up for a
 * session that is not running — so it is drawn as the kit's warning panel,
 * with the calendar cross the My SOG card's cancellation notice carries: the
 * edge and the glyph in the hue, "Cancelled" as the panel's title, and the date
 * with its time struck through beneath it. It is the same construct the card
 * uses for the same news, so a family meets one look for "a session ahead is
 * off" wherever they meet it, and it takes the panel whole rather than
 * restyling anything to resemble it. The panel *is* the entry — it replaces the
 * plain line rather than nesting inside one — so the timeline still reads one
 * entry per date.
 *
 * A date already behind us is history with nothing left to do about it, so it
 * stays a quiet line: muted ink, a neutral "Cancelled" tag, the time struck
 * through. It is not dashed — the dashed line means "nothing was recorded",
 * and a cancelled session is not a gap in anybody's paperwork.
 *
 * `trailing` lands in the right-packed cluster of the date row (the admin's
 * `⋯`), and `children` below it (the admin's reason and stamp). The family
 * feed passes neither.
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

  if (upcoming) {
    return (
      // No live-region role: this is one entry in a list read in order, and a
      // status or alert role on every cancelled date would have a screen reader
      // announce them all as the feed loads.
      <Alert
        variant="warning"
        icon={CalendarX}
        role={undefined}
        data-tone="warning"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <AlertTitle>{b("cancelled")}</AlertTitle>
            {trailing}
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs tabular-nums">
            <span className="font-semibold">{labels.date}</span>
            <span className="text-muted-foreground line-through">
              {labels.timeRange}
            </span>
          </p>
          {children}
        </div>
      </Alert>
    );
  }

  return (
    <div
      data-tone="muted"
      className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
    >
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
