"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AudioLines, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatTime } from "@/lib/utils";
import {
  formatCountdownCompound,
  formatSessionDateTimeRange,
} from "@/lib/session-format";

/**
 * Card on the gedu dashboard's "My Groups" section.
 *
 * The dashboard sees a list of *products* the gedu is assigned to (one
 * card per product, since `(gedu_id, product_id)` is unique); the gedu
 * thinks of them as their *groups* — both naming conventions are
 * deliberate. Code follows the data, UI follows the mental model.
 *
 * Layout mirrors the parent `NextSessionCard` (date / countdown
 * formatting is shared via `src/lib/session-format.ts`):
 *   - Product name + `{groupCount} groups · {gamerCount} gamers` line
 *   - Session date/time range
 *   - Join Voice button (live → joinVoice, locked → `Opens {date} {time}`)
 *   - Countdown ("Starts in …" / "Session in progress")
 *   - Chevron link to the per-group detail page
 *
 * The whole card is wrapped in a Link to the per-group detail page so a
 * click anywhere except the Join button navigates. The Join button stops
 * propagation. Both destinations are currently `"#"` no-ops: the gedu
 * voice room page and the per-group detail page are out of scope for
 * this pass.
 */

export interface GroupCardProps {
  /** Stable card key. */
  productId: string;
  /** The gedu's assigned group on this product (used by the join handler later). */
  groupId: string;
  /** Translated product name. */
  productName: string;
  /** Total groups in the product (every group, not just the gedu's). */
  groupCount: number;
  /** Active participations across every group in the product. */
  gamerCount: number;
  /** Soonest joinable session start (in product-local time, returned as UTC). */
  sessionStart: Date;
  /** End of that session — drives the start–end range label. */
  sessionEnd: Date;
  /** Whether the voice room is currently joinable (same window math as gamers). */
  voiceIsOpen: boolean;
  /** Where the Join button navigates. `"#"` keeps the button inert. */
  voiceHref: string;
  /** Where a click anywhere else on the card navigates. `"#"` for now. */
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

  // The Join button needs to suppress the wrapping Link's navigation so a
  // click on the button doesn't also navigate to the group page. `stopPropagation`
  // alone leaves the Link's default click handler intact via event delegation;
  // we also `preventDefault()` to neutralize the anchor's own navigation for
  // the `voiceHref === "#"` no-op case.
  const stopCardNav = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (voiceHref === "#") e.preventDefault();
  };

  return (
    <Link
      href={openGroupHref}
      onClick={(e) => {
        if (openGroupHref === "#") e.preventDefault();
      }}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card
        className={cn(
          "overflow-hidden",
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
          <div className="flex justify-center">
            {voiceIsOpen ? (
              <Link
                href={voiceHref}
                onClick={stopCardNav}
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
              >
                <AudioLines className="h-4 w-4" />
                {t("joinVoice")}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                onClick={stopCardNav}
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
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {t("viewDetails")}
              <NavChevron size="sm" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
