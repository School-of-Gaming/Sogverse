"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatTime } from "@/lib/utils";
import {
  formatCountdownCompound,
  formatSessionDateTimeRange,
} from "@/lib/session-format";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";

/**
 * Prominent card for the soonest upcoming session in the gedu dashboard's
 * Sessions section. Mirrors the parent's `NextSessionCard` — shared
 * date/countdown formatting via `src/lib/session-format.ts` keeps the
 * two surfaces in lockstep — minus the gamer attribution + reports
 * link, plus the product-wide group/gamer counts and a "View details"
 * chevron.
 *
 * Live state ("can the gedu click Join?") comes from `voiceIsOpen`,
 * computed upstream by `expandAssignedSessionsToCards`. Only the
 * soonest item ever has it set to `true`; every session after that
 * renders as `UpcomingGroupSessionCard` instead.
 *
 * Whole-card click navigates to the gedu's session-details page via a
 * "stretched link": the "View details" Link at the bottom-right is the
 * only card-level anchor, and its `::after` pseudo-element covers the
 * entire Card so any click on the card lands on that Link. The Join
 * button is promoted with `relative z-10` so it sits above the overlay
 * and receives its own clicks. Both card and Join are real anchors —
 * Ctrl/middle-click opens either in a new tab, Next.js prefetching
 * works, and there's no `<a>` inside `<a>` (which a wrapping Link
 * would produce). The Join button navigates to the shared
 * `/voice/group/[id]` page (same page the gamer side uses);
 * `openGroupHref` is built upstream by `expandAssignedSessionsToCards`
 * via `ROUTES.gedu.assignedProduct` so the prefix matches the product
 * type (clubs / camps / events).
 */

export interface GroupCardProps {
  /** The gedu's assigned group_id for this product (used by the join handler later). */
  groupId: string;
  /** Translated product name. */
  productName: string;
  /** Total groups in the product (every group, not just the gedu's). */
  groupCount: number;
  /** Active participations across every group in the product. */
  gamerCount: number;
  /** Soonest joinable session start (in product-local time, returned as UTC). */
  sessionStart: Date;
  /** End of that session — drives the start-end range label. */
  sessionEnd: Date;
  /** Whether the voice room is currently joinable (same window math as gamers). */
  voiceIsOpen: boolean;
  /** Where the Join button navigates. `"#"` keeps the button inert. */
  voiceHref: string;
  /** Where a click anywhere on the card navigates — the gedu's session-details page. */
  openGroupHref: string;
}

export function GroupCard({
  productName,
  groupCount,
  gamerCount,
  sessionStart,
  sessionEnd,
  voiceIsOpen,
  voiceHref,
  openGroupHref,
}: GroupCardProps) {
  const t = useTranslations("gedu.myGroups");
  const locale = useLocale();
  const timeZone = useTimezone();
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
        "relative overflow-hidden",
        voiceIsOpen &&
          "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
      )}
    >
      <CardHeader className="pb-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-lg font-semibold leading-tight">{productName}</p>
          <p className="text-sm text-muted-foreground">
            {t("counts", { groupCount, gamerCount })}
          </p>
          <p className="text-sm text-muted-foreground">{sessionTimeLabel}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* `relative z-10` lifts the Join button above the stretched link's
            ::after so the button receives its own clicks. */}
        <div className="relative z-10 flex justify-center">
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={voiceHref}
            opensDate={opensDate}
            opensTime={opensTime}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{countdownLine}</p>
          {/* Stretched link — `after:absolute after:inset-0` makes the whole
              Card the click target for this anchor. Focus ring renders on
              the ::after so the entire card lights up on keyboard focus. */}
          <Link
            href={openGroupHref}
            prefetch={false}
            onClick={(e) => {
              if (openGroupHref === "#") e.preventDefault();
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {t("viewDetails")}
            <NavChevron size="sm" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
