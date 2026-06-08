"use client";

import { Hourglass, RefreshCwOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTimezone } from "@/providers";
import { cn, formatDate } from "@/lib/utils";
import { BADGE_FRAME } from "./session-card-badge";

/**
 * Muted corner pill shown on a session card when the parent has cancelled this
 * club's subscription (Stripe `cancel_at_period_end` → our `canceling` status)
 * and the card falls within the remaining paid window.
 *
 * Deliberately low-key, grey, non-interactive: a cancellation is not a problem
 * to fix (unlike `PaymentProblemBadge`), it's confirmation that the parent's
 * own action was fulfilled — so it reads identically on the prominent
 * `NextSessionCard` and the compact `UpcomingSessionCard`, with no amplified
 * variant (contrast `PaymentProblemBadge`'s `showAlert`).
 *
 * Face copy is session-anchored, never billing-anchored. The card it sits on
 * is a session the gamer still attends, so it must never read as "this session
 * is canceled". Two states, driven by whether this card is the participation's
 * final remaining occurrence:
 *   - `isLastSession` → "Last session" (hourglass): this is the end of the road.
 *   - otherwise       → "Won't renew" (no-renew icon): the membership lapses,
 *                       this session is unaffected.
 *
 * The billing `current_period_end` deliberately stays OFF the face — it's the
 * subscription system's number, not the parent's, and it can land a few days
 * past the last session (the period end rarely coincides with a session). A
 * parent tracks sessions, not billing instants, so showing "Until Jul 15" when
 * the last club day is Jul 12 manufactures a "where's the 15th?" question. The
 * period-end date lives in the tooltip, where it *explains* the gap ("last
 * session Jul 12, access runs through Jul 15") rather than creating it — and is
 * dropped entirely when the two coincide.
 *
 * Parent-only: the gamer dashboard never renders this (gamer cards are simply
 * clamped to the paid window with no badge — billing is the parent's concern).
 * Callers gate on `audience === "customer"` before rendering.
 *
 * Shares corner geometry with `PaymentProblemBadge` via `BADGE_FRAME`; the two
 * never co-occur on one card because `canceling` and `past_due` are mutually
 * exclusive subscription statuses.
 */
export function SubscriptionEndingBadge({
  /** The instant paid access ends (`current_period_end`). Tooltip only. */
  accessUntil,
  /** Start of the participation's final remaining session. Tooltip only. */
  lastSessionStart,
  /** Whether THIS card is that final session — drives the face copy + icon. */
  isLastSession,
  /** First name for the tooltip ("{name}'s last session is …"). */
  gamerFirstName,
  className,
}: {
  accessUntil: Date;
  lastSessionStart: Date;
  isLastSession: boolean;
  gamerFirstName: string;
  className?: string;
}) {
  const t = useTranslations("parent.subscriptionEnding");
  const locale = useLocale();
  const timeZone = useTimezone();

  const dateLabel = (d: Date) =>
    formatDate(d, locale, { month: "short", day: "numeric", timeZone });
  // Calendar-day key in the viewer's zone — used to decide whether the
  // access-through date is worth mentioning (only when it differs from the
  // last session; otherwise the parenthetical is noise).
  const dayKey = (d: Date) =>
    formatDate(d, locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });

  const lastSession = dateLabel(lastSessionStart);
  const sameDay = dayKey(lastSessionStart) === dayKey(accessUntil);
  const tooltip = sameDay
    ? t("tooltipSameDay", { name: gamerFirstName, lastSession })
    : t("tooltip", {
        name: gamerFirstName,
        lastSession,
        accessUntil: dateLabel(accessUntil),
      });

  return (
    <div
      role="img"
      aria-label={tooltip}
      title={tooltip}
      className={cn(
        BADGE_FRAME,
        "gap-1 cursor-default bg-muted px-2 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      {isLastSession ? (
        <Hourglass aria-hidden className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <RefreshCwOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
      )}
      {isLastSession ? t("lastSession") : t("wontRenew")}
    </div>
  );
}
