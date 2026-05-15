"use client";

import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";

/**
 * Compact, purely-informational sibling of `NextSessionCard`.
 *
 * The parent Sessions section renders the soonest session as a
 * `NextSessionCard` (live/locked CTA, countdown, reports link) and every
 * session after that as one of these — gamer attribution, product name,
 * start date/time, nothing clickable. Strips the join + reports surfaces
 * so the list reads as "here's what's next, and here's what comes after."
 */
function formatStart(start: Date, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  return `${date} · ${time}`;
}

export interface UpcomingSessionCardProps {
  /** First name shown in the "for {name}" attribution line. */
  gamerFirstName: string;
  /** Stable seed for the identicon (usually the gamer's UUID). Falls back to the first name. */
  gamerSeed?: string;
  /** Product name (club / camp / event). */
  productName: string;
  /** When the session starts — drives the date/time label. */
  nextSessionStart: Date;
}

export function UpcomingSessionCard({
  gamerFirstName,
  gamerSeed,
  productName,
  nextSessionStart,
}: UpcomingSessionCardProps) {
  const t = useTranslations("parent.upcomingSession");
  const locale = useLocale();
  const startLabel = formatStart(nextSessionStart, locale);

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3 pt-3">
        <Avatar className="h-8 w-8">
          <Identicon id={gamerSeed ?? gamerFirstName} size={32} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{productName}</p>
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {t("gamerLabel", { name: gamerFirstName })}
            </span>
            <span className="shrink-0">{startLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
