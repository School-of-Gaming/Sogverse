"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PhoneCall, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCountdown } from "@/lib/enrollment";

/** Highlight threshold: sessions within 12 hours get warning color */
const HIGHLIGHT_MINUTES = 720;

/** Re-render interval for countdown accuracy */
const TICK_MS = 60_000;

interface GroupVoiceStatusProps {
  isOpen: boolean;
  nextSessionStart?: Date | null;
  joinHref: string;
}

/**
 * Shared voice status display for group cards across all roles.
 * Shows a Live badge + Join button when open, a self-updating countdown
 * when the next session is upcoming, or nothing when offline.
 */
export function GroupVoiceStatus({
  isOpen,
  nextSessionStart,
  joinHref,
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

    return (
      <p
        className={cn(
          "text-sm",
          totalMinutes < HIGHLIGHT_MINUTES
            ? "font-medium text-warning"
            : "text-muted-foreground",
        )}
      >
        starts in {countdown}
      </p>
    );
  }

  return null;
}
