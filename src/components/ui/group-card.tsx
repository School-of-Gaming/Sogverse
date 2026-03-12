"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, PhoneCall, Radio, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
  isOpen: boolean;
  nextSessionStart?: Date | null;
  joinHref: string;
  locale?: string;
}

/**
 * Voice status display: Live badge + Join button when open,
 * a self-updating "Next session" line when upcoming, or nothing when offline.
 * Used inside GroupCard and on group detail pages.
 */
export function GroupVoiceStatus({
  isOpen,
  nextSessionStart,
  joinHref,
  locale,
}: GroupVoiceStatusProps) {
  const [now, setNow] = useState(Date.now);

  // Self-updating tick keeps countdown accurate while the page is open
  useEffect(() => {
    if (isOpen || !nextSessionStart) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [isOpen, nextSessionStart]);

  if (isOpen) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-success/10 text-success text-xs shrink-0">
          <Radio className="mr-1 h-3 w-3" />
          Live
        </Badge>
        <Link
          href={joinHref}
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
          onClick={(e) => e.stopPropagation()}
        >
          <PhoneCall className="h-4 w-4" />
          Join
        </Link>
      </div>
    );
  }

  if (nextSessionStart) {
    const msUntil = nextSessionStart.getTime() - now;
    if (msUntil <= 0) return null;
    const totalMinutes = Math.floor(msUntil / TICK_MS);
    const countdown = formatCountdown(msUntil);

    const dateStr = nextSessionStart.toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    return (
      <p className="text-sm">
        Next session {dateStr}{" "}
        <span
          className={cn(
            totalMinutes < HIGHLIGHT_MINUTES
              ? "font-medium text-warning"
              : "text-muted-foreground",
          )}
        >
          (starts in {countdown})
        </span>
      </p>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  GroupCard                                                           */
/* ------------------------------------------------------------------ */

interface GroupCardProps {
  productName: string;
  geduName: string;
  gamerCount: number;
  schedule: { localDay: string; localTime: string; tzAbbrev: string };
  voiceIsOpen: boolean;
  voiceNextSessionStart?: Date | null;
  locale?: string;
  /** Where the Join button navigates (e.g. /gedu/voice/[id]). */
  joinHref: string;
  /** Where clicking the card navigates (e.g. /gedu/groups/[id]). */
  detailHref: string;
}

/**
 * Shared group card used across all roles (gedu, gamer, parent, admin).
 * Shows product name, gedu name, gamer count, schedule, and voice status.
 */
export function GroupCard({
  productName,
  geduName,
  gamerCount,
  schedule,
  voiceIsOpen,
  voiceNextSessionStart,
  locale,
  joinHref,
  detailHref,
}: GroupCardProps) {
  const router = useRouter();

  return (
    <Card
      className="group cursor-pointer transition-colors hover:bg-accent/50"
      onClick={() => router.push(detailHref)}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{productName}</p>
            {voiceIsOpen && (
              <Badge className="bg-success/10 text-success text-xs shrink-0">
                <Radio className="mr-1 h-3 w-3" />
                Live
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground truncate">{geduName}</p>

          <div className="mt-1 flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {gamerCount} gamer{gamerCount !== 1 && "s"}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Every {schedule.localDay}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {schedule.localTime} {schedule.tzAbbrev}
            </span>
          </div>

          {!voiceIsOpen && voiceNextSessionStart && (
            <div className="mt-1">
              <GroupVoiceStatus
                isOpen={false}
                nextSessionStart={voiceNextSessionStart}
                joinHref=""
                locale={locale}
              />
            </div>
          )}
        </div>

        {voiceIsOpen && (
          <Link
            href={joinHref}
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 shrink-0")}
            onClick={(e) => e.stopPropagation()}
          >
            <PhoneCall className="h-4 w-4" />
            Join
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
