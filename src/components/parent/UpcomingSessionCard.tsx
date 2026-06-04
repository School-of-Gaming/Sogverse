"use client";

import { useLocale, useTranslations } from "next-intl";
import { UserRoundSearch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Compact, purely-informational sibling of `NextSessionCard`.
 *
 * The parent Sessions section renders the soonest session as a
 * `NextSessionCard` (live/locked CTA, countdown, reports link) and every
 * session after that as one of these — gamer attribution, product name,
 * start date/time, nothing clickable. Strips the join + reports surfaces
 * so the list reads as "here's what's next, and here's what comes after."
 */

export interface UpcomingSessionCardProps {
  /** First name shown in the "for {name}" attribution line. */
  gamerFirstName: string;
  /** Stable seed for the identicon (usually the gamer's UUID). Falls back to the first name. */
  gamerSeed?: string;
  /** Product name (club / camp / event). */
  productName: string;
  /** When the session starts — drives the date/time label. */
  sessionStart: Date;
  /**
   * The gamer is purchased but not yet placed in a group. The card still
   * shows the real schedule; this just adds a small "matching with a Gedu"
   * badge so a not-yet-joinable session isn't mistaken for a normal one.
   * Defaults to `false`. See `NextSessionCard` for the prominent variant.
   */
  awaiting?: boolean;
  /**
   * Whose dashboard this renders on — drives the audience-specific awaiting
   * badge (`"gamer"` speaks to the child). Defaults to `"customer"`.
   */
  audience?: SessionAudience;
}

export function UpcomingSessionCard({
  gamerFirstName,
  gamerSeed,
  productName,
  sessionStart,
  awaiting = false,
  audience = "customer",
}: UpcomingSessionCardProps) {
  const t = useTranslations("parent.upcomingSession");
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
            <span className="shrink-0">{`${dateLabel} · ${timeLabel}`}</span>
          </div>
          {/* Not-yet-placed: keep the real schedule above, flag the pending
              Gedu match so this isn't read as a joinable session. Static icon
              (no animation) — placement isn't necessarily imminent. */}
          {awaiting && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-info">
              <UserRoundSearch className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t(audience === "gamer" ? "awaitingGeduGamer" : "awaitingGedu")}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
