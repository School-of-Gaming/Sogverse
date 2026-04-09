"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Radio, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinButton } from "@/components/ui/join-button";
import { cn } from "@/lib/utils";
import { formatCountdown } from "@/lib/enrollment";

/* ------------------------------------------------------------------ */
/*  GroupVoiceStatus                                                    */
/* ------------------------------------------------------------------ */

/** Highlight threshold: sessions within 12 hours get warning color */
const HIGHLIGHT_MINUTES = 720;

/** Re-render interval for countdown accuracy */
const TICK_MS = 60_000;

interface GroupVoiceStatusProps {
  nextSessionStart: Date;
  locale?: string;
}

/**
 * Self-updating status text line for a voice session.
 * Shows a countdown when upcoming, or "Session in progress" when live.
 */
export function GroupVoiceStatus({
  nextSessionStart,
  locale,
}: GroupVoiceStatusProps) {
  const t = useTranslations('groups');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const msUntil = nextSessionStart.getTime() - now;

  if (msUntil > 0) {
    const totalMinutes = Math.floor(msUntil / TICK_MS);
    const dateStr = nextSessionStart.toLocaleDateString(locale, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    return (
      <p className="text-sm">
        {t('nextSession', { date: dateStr })}{" "}
        <span className={cn(
          totalMinutes < HIGHLIGHT_MINUTES ? "font-medium text-primary" : "text-muted-foreground",
        )}>
          {t('startsIn', { countdown: formatCountdown(msUntil) })}
        </span>
      </p>
    );
  }

  return <p className="text-sm font-medium text-primary">{t('sessionInProgress')}</p>;
}

/* ------------------------------------------------------------------ */
/*  GroupCard                                                           */
/* ------------------------------------------------------------------ */

interface GroupCardProps {
  productName: string;
  productImageUrl: string;
  geduName: string;
  gamerCount: number;
  schedule: { localDay: string; localTime: string; tzAbbrev: string };
  voiceIsOpen: boolean;
  voiceNextSessionStart: Date;
  locale?: string;
  /** Called when the Join button is clicked. Callers handle navigation or show a dialog. */
  onJoinClick: () => void;
  /** Where clicking the card navigates (e.g. /gedu/groups/[id]). */
  detailHref: string;
}

/**
 * Shared group card used across all roles (gedu, gamer, parent, admin).
 * Shows product image, product name, gedu name, gamer count, schedule, and voice status.
 */
export function GroupCard({
  productName,
  productImageUrl,
  geduName,
  gamerCount,
  schedule,
  voiceIsOpen,
  voiceNextSessionStart,
  locale,
  onJoinClick,
  detailHref,
}: GroupCardProps) {
  const t = useTranslations('groups');
  const router = useRouter();

  return (
    <Card
      className={cn(
        "group cursor-pointer transition-colors hover:bg-muted/50",
        voiceIsOpen && "border-primary/30 bg-gradient-to-r from-primary/5 to-transparent",
      )}
      role="button"
      tabIndex={0}
      onClick={() => router.push(detailHref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(detailHref);
        }
      }}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center">
          {/* Plain <img> — unoptimized external URLs get no benefit from next/image,
              and next/image warns when CSS constrains only one dimension */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productImageUrl}
            alt={productName}
            className="max-h-full max-w-full rounded-md"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{productName}</p>
            {voiceIsOpen && (
              <Badge className="bg-success/10 text-success text-xs shrink-0">
                <Radio className="mr-1 h-3 w-3" />
                {t('live')}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground truncate">{geduName}</p>

          <div className="mt-1 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {t('gamerCount', { count: gamerCount })}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {t('everyDay', { day: schedule.localDay })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {schedule.localTime} {schedule.tzAbbrev}
            </span>
          </div>

          <div className="mt-1">
            <GroupVoiceStatus
              nextSessionStart={voiceNextSessionStart}
              locale={locale}
            />
          </div>
        </div>

        {voiceIsOpen && (
          <JoinButton onClick={onJoinClick} stopPropagation />
        )}

        <NavChevron />
      </CardContent>
    </Card>
  );
}
