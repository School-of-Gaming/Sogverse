"use client";

import Link from "next/link";
import { CalendarClock, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { SessionFeedAlertBadge } from "@/components/gedu/session-feed";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatTime } from "@/lib/utils";
import {
  formatCountdownCompound,
  formatSessionDateTimeRange,
} from "@/lib/session-format";
import type { GeduAssignmentSummary } from "@/lib/gedu-assignment-rollup";

interface GeduAssignmentCardProps {
  assignment: GeduAssignmentSummary;
  /**
   * Ready-made schedule lines for this product — the recurring cadence for a
   * club, the date range plus running days for a camp. Built by the caller with
   * the shared product-schedule formatter, because that formatter needs the
   * whole product row and this card only carries the roll-up.
   */
  scheduleLines: readonly string[];
}

/**
 * One card per **assignment** (a product × the gedu's group in it) on the gedu
 * dashboard.
 *
 * This is a roll-up, not a session. The dashboard used to list every upcoming
 * occurrence, which meant eight nearly identical rows for one weekly club; now
 * that the product page's feed owns per-session detail, the dashboard answers a
 * shorter question — which rooms do I run, which is next, and where am I behind.
 * So the card carries the product's identity, the group's identity, one next-
 * session line, the cadence in words rather than as a list of dates, and the
 * outstanding-write-up badge.
 *
 * The Join affordance lives here because this is now the only place a gedu meets
 * their next session before opening it, and the whole card is a doorway into the
 * feed. Both are real anchors via a stretched link: the "open" link at the
 * bottom-right covers the card with an `::after`, and the Join button is lifted
 * above it with `relative z-10` so it receives its own clicks. No `<a>` inside
 * `<a>`, so middle-click and prefetch both behave.
 */
export function GeduAssignmentCard({
  assignment,
  scheduleLines,
}: GeduAssignmentCardProps) {
  const t = useTranslations("gedu.myGroups");
  const d = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const {
    productName,
    productType,
    groupName,
    groupGamerCount,
    nextSessionStart,
    nextSessionEnd,
    voiceIsOpen,
    voiceHref,
    openHref,
    attentionCount,
  } = assignment;

  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  const msUntil = hasNext ? nextSessionStart.getTime() - now.getTime() : 0;

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        voiceIsOpen &&
          "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {d(`typeLabel.${productType}`)}
            </p>
            <p className="text-lg font-semibold leading-tight">{productName}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {groupName ?? d("untitledGroup")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs tabular-nums">
                <Users className="h-3 w-3" aria-hidden />
                {d("gamerCount", { count: groupGamerCount })}
              </span>
            </div>
          </div>
          <SessionFeedAlertBadge count={attentionCount} className="shrink-0" />
        </div>

        {hasNext ? (
          <div className="space-y-1">
            <p className="text-sm">
              {formatSessionDateTimeRange(
                nextSessionStart,
                nextSessionEnd,
                locale,
                timeZone,
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {msUntil <= 0
                ? t("inProgress")
                : t("startsIn", {
                    countdown: formatCountdownCompound(msUntil, locale),
                  })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noNextSession")}</p>
        )}

        {/* The cadence in words. A roll-up card can't enumerate dates without
            becoming the list it replaced, and "Mondays 16:30–18:00" tells the
            gedu more per line than eight Mondays ever did. */}
        {scheduleLines.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {scheduleLines.map((line) => (
                <span key={line} className="block tabular-nums">
                  {line}
                </span>
              ))}
            </span>
          </div>
        )}

        {hasNext && (
          // `relative z-10` lifts Join above the stretched link's ::after so
          // the button receives its own clicks.
          <div className="relative z-10 flex justify-center">
            <JoinVoiceButton
              voiceIsOpen={voiceIsOpen}
              voiceHref={voiceHref}
              opensDate={formatDate(nextSessionStart, locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone,
              })}
              opensTime={formatTime(nextSessionStart, locale, timeZone)}
            />
          </div>
        )}

        <div className="flex items-center justify-end">
          {/* Stretched link — `after:absolute after:inset-0` makes the whole
              Card the click target. The focus ring renders on the ::after so
              the entire card lights up on keyboard focus. */}
          <Link
            href={openHref}
            onClick={(e) => {
              if (openHref === "#") e.preventDefault();
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {t("openFeed")}
            <NavChevron size="sm" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
