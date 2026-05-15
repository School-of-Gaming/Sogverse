"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AudioLines, ExternalLink, FileText, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";

/**
 * Prominent card for the soonest joinable session in the parent's list.
 *
 * Used once per section, at the top — shows the live/locked join button,
 * a per-minute countdown, and the reports link. Every session below this
 * one is rendered as a `UpcomingSessionCard` instead (no CTAs, no
 * countdown).
 */

/**
 * Long localized "next session at" line — long weekday + day + long month
 * + 24h start–end time range. Intl handles weekday/month words per locale;
 * forcing `hour12: false` keeps the time column 24h regardless of locale
 * default, matching the rest of the schedule UI.
 *
 * We format start and end separately rather than via `formatRange`: when
 * the session crosses midnight (start and end fall on different calendar
 * days), `formatRange` auto-promotes to "5/15/2026, 19:45 – 5/16/2026,
 * 01:45" to disambiguate. The date anchor on this card already tells the
 * reader which day we mean, so the bare time range reads correctly.
 *   en → "Monday, May 1 · 16:00 – 18:00"
 *   fi → "maanantai 1. toukokuuta · 16.00 – 18.00"
 *   sv → "måndag 1 maj · 16:00 – 18:00"
 */
/**
 * Short localized date + clock-time pair for the locked voice button.
 * Splits into two pieces so the translation template can place the
 * locale-specific preposition between them — English "at", Finnish "klo",
 * Swedish "kl." — instead of forcing a single language's word order.
 *   en → { date: "Mon, May 18", time: "16:00" }  → "Opens Mon, May 18 at 16:00"
 *   fi → { date: "ma 18.5.",   time: "16.00" }  → "Avautuu ma 18.5. klo 16.00"
 *   sv → { date: "mån 18 maj", time: "16:00" }  → "Öppnas mån 18 maj kl. 16:00"
 */
function formatVoiceOpensDateTime(
  when: Date,
  locale: string,
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(when);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(when);
  return { date, time };
}

function formatSessionDateTimeRange(
  start: Date,
  end: Date,
  locale: string,
): string {
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);

  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${datePart} · ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
}

/**
 * Compound countdown formatter. The card shows the two largest non-empty
 * units so the countdown reads naturally as the session approaches:
 *   ≥1 day → "2 days, 5 hours"
 *   ≥1 hour <1 day → "8 hours, 12 minutes"
 *   <1 hour → "37 minutes"
 * Drops the secondary unit when it's zero so we don't show "2 days, 0 hours".
 * Stops at the minute — sub-minute precision adds noise without value.
 */
function formatCountdownCompound(ms: number, locale: string): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;

  const unit = (
    value: number,
    u: "day" | "hour" | "minute",
  ): string =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: u,
      unitDisplay: "long",
    }).format(value);

  const list = new Intl.ListFormat(locale, { type: "unit", style: "narrow" });

  if (days > 0) {
    return hours > 0
      ? list.format([unit(days, "day"), unit(hours, "hour")])
      : unit(days, "day");
  }
  if (hours > 0) {
    return minutes > 0
      ? list.format([unit(hours, "hour"), unit(minutes, "minute")])
      : unit(hours, "hour");
  }
  return unit(minutes, "minute");
}

export interface NextSessionCardProps {
  /** First name shown in the header — "{name}'s next session". */
  gamerFirstName: string;
  /** Stable seed for the identicon (usually the gamer's UUID). Falls back to the first name. */
  gamerSeed?: string;
  /** Product name (club / camp / event). */
  productName: string;
  /** When the next session starts. Drives the countdown and the in-progress flip. */
  nextSessionStart: Date;
  /** When the next session ends. Used for the start–end time range label. */
  nextSessionEnd: Date;
  /**
   * Whether the voice room is currently joinable. Open = active CTA;
   * closed = locked button labelled with the time until it opens.
   * The adapter decides what "open" means (typically buffer window).
   */
  voiceIsOpen: boolean;
  /** Where the active "Join voice room" link navigates. */
  voiceHref: string;
  /** External reports URL — opens in a new tab. */
  reportsHref: string;
}

export function NextSessionCard({
  gamerFirstName,
  gamerSeed,
  productName,
  nextSessionStart,
  nextSessionEnd,
  voiceIsOpen,
  voiceHref,
  reportsHref,
}: NextSessionCardProps) {
  const t = useTranslations("parent.nextSession");
  const locale = useLocale();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const msUntil = nextSessionStart.getTime() - now;
  const isStarted = msUntil <= 0;
  const countdown = formatCountdownCompound(msUntil, locale);
  const sessionTimeLabel = formatSessionDateTimeRange(
    nextSessionStart,
    nextSessionEnd,
    locale,
  );
  const opensAt = formatVoiceOpensDateTime(nextSessionStart, locale);

  return (
    <Card
      className={cn(
        "overflow-hidden",
        voiceIsOpen &&
          "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
      )}
    >
      <CardHeader className="pb-1">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <Identicon id={gamerSeed ?? gamerFirstName} size={48} />
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-lg font-semibold leading-tight">
              {productName}
            </p>
            <p className="truncate text-sm font-medium text-muted-foreground">
              {t("title", { name: gamerFirstName })}
            </p>
            <p className="text-sm text-muted-foreground">{sessionTimeLabel}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="flex justify-center">
          {voiceIsOpen ? (
            <Link
              href={voiceHref}
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              <AudioLines className="h-4 w-4" />
              {t("joinVoice")}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className={cn(
                buttonVariants({ size: "sm", variant: "secondary" }),
                "gap-1.5",
              )}
            >
              <Lock className="h-4 w-4" />
              {t("locked", { date: opensAt.date, time: opensAt.time })}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {isStarted ? t("inProgress") : t("startsIn", { countdown })}
          </p>
          <Link
            href={reportsHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "gap-1.5",
            )}
          >
            <FileText className="h-4 w-4" />
            {t("reports")}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
