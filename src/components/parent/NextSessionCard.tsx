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
import { cn, formatDate, formatTime } from "@/lib/utils";

/**
 * Prominent card for the soonest joinable session in the parent's list.
 *
 * Used once per section, at the top — shows the live/locked join button,
 * a per-minute countdown, and the reports link. Every session below this
 * one is rendered as a `UpcomingSessionCard` instead (no CTAs, no
 * countdown).
 *
 * Live state ("can the parent click Join?") is owned upstream by
 * `computeSessionWindow` (lib/session-schedule.ts). The card takes
 * `voiceIsOpen` as-is — the same value the rest of the app uses, so
 * liveness is consistent everywhere.
 *
 * The locked-button label intentionally shows the *official session start*,
 * not the (earlier) buffer-window open time. The room silently becomes
 * joinable at `sessionStart - SESSION_WINDOW_BEFORE_MINUTES`, at which
 * point the button flips to the Join state — letting eager parents and
 * gamers slip in early to get settled, while everyone still sees the
 * advertised start time on the locked label.
 */

/**
 * Localized "next session at" line — short weekday + day + long month +
 * 24h start–end time range. Abbreviating just the weekday is enough to fit
 * a Finnish long-form on a single row of the narrow column layout
 * ("lauantai" → "la"); the month word stays long since "toukokuuta" reads
 * naturally and most other locales keep month words short anyway. `formatTime`
 * normalizes the time column to 24h regardless of locale default.
 *
 * We format start and end separately rather than via `formatRange`: when
 * the session crosses midnight (start and end fall on different calendar
 * days), `formatRange` auto-promotes to "5/15/2026, 19:45 – 5/16/2026,
 * 01:45" to disambiguate. The date anchor on this card already tells the
 * reader which day we mean, so the bare time range reads correctly.
 *   en → "Mon, May 1 · 16:00 – 18:00"
 *   fi → "ma 1. toukokuuta · 16.00 – 18.00"
 *   sv → "mån 1 maj · 16:00 – 18:00"
 */
function formatSessionDateTimeRange(
  start: Date,
  end: Date,
  locale: string,
): string {
  const datePart = formatDate(start, locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return `${datePart} · ${formatTime(start, locale)} – ${formatTime(end, locale)}`;
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
  /** When the session officially starts. Drives the date label and countdown. */
  sessionStart: Date;
  /** When the session ends. Drives the start–end time range label. */
  sessionEnd: Date;
  /**
   * Whether the voice room is currently joinable. Pass
   * `computeSessionWindow(schedule, now).isOpen` — the same value the rest
   * of the app uses, so liveness is consistent everywhere.
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
  sessionStart,
  sessionEnd,
  voiceIsOpen,
  voiceHref,
  reportsHref,
}: NextSessionCardProps) {
  const t = useTranslations("parent.nextSession");
  const locale = useLocale();

  // `now` stays null until after mount so the SSR-rendered HTML and the
  // first client render produce the same countdown text (a non-breaking-space
  // placeholder). Seeding `Date.now()` only on the client avoids the
  // hydration mismatch we'd otherwise get from the server's clock differing
  // from the client's. 30s cadence matches the section-level `voiceIsOpen`
  // ticker upstream (use-groups-page) so the countdown and the Join/locked
  // flip stay roughly in sync.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration init: `now` is intentionally null during SSR so the countdown text doesn't depend on the server clock. See TODO.md "Audit setState-in-effect violations from eslint-plugin-react-hooks@7"
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // NBSP placeholder reserves the line height without copy — the
  // Reports button on the right stays put between SSR and post-mount.
  let countdownLine = " ";
  if (now !== null) {
    const msUntil = sessionStart.getTime() - now;
    countdownLine = msUntil <= 0
      ? t("inProgress")
      : t("startsIn", { countdown: formatCountdownCompound(msUntil, locale) });
  }

  const sessionTimeLabel = formatSessionDateTimeRange(
    sessionStart,
    sessionEnd,
    locale,
  );
  // The locked label intentionally advertises the session-start time, not
  // the buffer-window open time. See the file header.
  const opensDate = formatDate(sessionStart, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const opensTime = formatTime(sessionStart, locale);

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
              {t("locked", { date: opensDate, time: opensTime })}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{countdownLine}</p>
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
