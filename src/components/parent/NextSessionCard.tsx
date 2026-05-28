"use client";

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
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatTime } from "@/lib/utils";
import {
  formatCountdownCompound,
  formatSessionDateTimeRange,
} from "@/lib/session-format";

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
 *
 * Date / countdown formatting is shared with the gedu `GroupCard` via
 * `src/lib/session-format.ts` so the two surfaces can't drift.
 */

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
  /**
   * Optional click handler. When present, the Join button renders as a
   * `<button>` and `onJoinClick` fires instead of navigating to
   * `voiceHref`. Used by the parent dashboard, which intercepts the click
   * to open the switch-to-gamer dialog (the parent is signed in as
   * themselves; the voice room is gated by the gamer's enrollment). The
   * gamer dashboard omits this prop so the normal Link is used.
   */
  onJoinClick?: () => void;
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
  onJoinClick,
  reportsHref,
}: NextSessionCardProps) {
  const t = useTranslations("parent.nextSession");
  const locale = useLocale();
  const timeZone = useTimezone();
  // `useNow()` is seeded server-side at request time, so the first client
  // render produces the exact same countdown text the SSR HTML already has
  // — no NBSP placeholder gap, no hydration warning. The 30s tick keeps it
  // fresh after mount. Cadence matches `useGroupsWithVoice` so the
  // countdown and the Join/locked flip stay aligned across the app.
  const now = useNow();

  const msUntil = sessionStart.getTime() - now.getTime();
  const countdownLine =
    msUntil <= 0
      ? t("inProgress")
      : t("startsIn", { countdown: formatCountdownCompound(msUntil, locale) });

  const sessionTimeLabel = formatSessionDateTimeRange(
    sessionStart,
    sessionEnd,
    locale,
    timeZone,
  );
  // The locked label intentionally advertises the session-start time, not
  // the buffer-window open time. See the file header.
  const opensDate = formatDate(sessionStart, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const opensTime = formatTime(sessionStart, locale, timeZone);

  return (
    <Card
      className={cn(
        "overflow-hidden",
        voiceIsOpen &&
          "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
      )}
    >
      <CardHeader className="pb-4">
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
            onJoinClick ? (
              <button
                type="button"
                onClick={onJoinClick}
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <AudioLines className="h-4 w-4" />
                {t("joinVoice")}
              </button>
            ) : (
              <Link
                href={voiceHref}
                prefetch={false}
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <AudioLines className="h-4 w-4" />
                {t("joinVoice")}
              </Link>
            )
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
