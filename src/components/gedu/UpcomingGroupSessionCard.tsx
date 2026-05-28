"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useTimezone } from "@/providers";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Compact sibling of `GroupCard` for the gedu's Sessions list.
 *
 * Sister to the parent's `UpcomingSessionCard` — used for every session
 * after the soonest. Differences from the parent's compact card:
 * no gamer attribution (the gedu IS the gedu of every session here),
 * and the whole card is a Link to the gedu's session-details page with
 * a "View details" chevron — same affordance as the prominent
 * `GroupCard` so any card in the list reads as a doorway into the
 * product the gedu serves on.
 */

export interface UpcomingGroupSessionCardProps {
  /** Translated product name. */
  productName: string;
  /** When the session starts — drives the date/time label. */
  sessionStart: Date;
  /** Where a click on the card navigates — the gedu's session-details page. */
  openGroupHref: string;
}

export function UpcomingGroupSessionCard({
  productName,
  sessionStart,
  openGroupHref,
}: UpcomingGroupSessionCardProps) {
  const t = useTranslations("gedu.myGroups");
  const locale = useLocale();
  const timeZone = useTimezone();
  const dateLabel = formatDate(sessionStart, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const timeLabel = formatTime(sessionStart, locale, timeZone);

  return (
    <Link
      href={openGroupHref}
      prefetch={false}
      onClick={(e) => {
        if (openGroupHref === "#") e.preventDefault();
      }}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card>
        <CardContent className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{productName}</p>
            <p className="text-xs text-muted-foreground">{`${dateLabel} · ${timeLabel}`}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {t("viewDetails")}
            <NavChevron size="sm" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
