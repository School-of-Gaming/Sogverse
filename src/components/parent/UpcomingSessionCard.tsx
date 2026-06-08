"use client";

import { useLocale, useTranslations } from "next-intl";
import { UserRoundSearch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { PaymentProblemBadge } from "./PaymentProblemBadge";
import { SubscriptionEndingBadge } from "./SubscriptionEndingBadge";
import type { SessionCancellation } from "./NextSessionCard";
import { useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Compact, purely-informational sibling of `NextSessionCard`.
 *
 * The parent Sessions section renders the soonest session as a
 * `NextSessionCard` (live/locked CTA, countdown, reports link) and every
 * session after that as one of these — gamer attribution, product name,
 * start date/time, nothing clickable. Strips the join + reports surfaces
 * so the list reads as "here's what's next, and here's what comes after."
 */

export interface UpcomingSessionCardProps {
  /** First name shown in the "for {name}" attribution line. */
  gamerFirstName: string;
  /** Stable seed for the identicon (usually the gamer's UUID). Falls back to the first name. */
  gamerSeed?: string;
  /** Product name (club / camp / event). */
  productName: string;
  /** When the session starts — drives the date/time label. */
  sessionStart: Date;
  /**
   * The gamer is purchased but not yet placed in a group. The card still
   * shows the real schedule; this just adds a small "you're in — group coming"
   * caption so a not-yet-joinable session isn't mistaken for a normal one.
   * Defaults to `false`. See `NextSessionCard` for the prominent variant.
   */
  awaiting?: boolean;
  /**
   * Whose dashboard this renders on — drives the audience-specific awaiting
   * badge (`"gamer"` speaks to the child). Defaults to `"customer"`.
   */
  audience?: SessionAudience;
  /**
   * The club's subscription has a payment problem (`past_due`). Shows the
   * corner payment-problem badge (audience-aware). Defaults to `false`.
   */
  paymentProblem?: boolean;
  /**
   * Present when the parent has cancelled this club's subscription. Renders the
   * muted "Won't renew" / "Last session" badge — parent only (see `audience`);
   * gamer cards show no badge. `null`/undefined otherwise.
   */
  cancellation?: SessionCancellation | null;
}

export function UpcomingSessionCard({
  gamerFirstName,
  gamerSeed,
  productName,
  sessionStart,
  awaiting = false,
  audience = "customer",
  paymentProblem = false,
  cancellation = null,
}: UpcomingSessionCardProps) {
  const t = useTranslations("parent.upcomingSession");
  const tAwaiting = useTranslations("parent.awaiting");
  const locale = useLocale();
  const timeZone = useTimezone();
  const dateLabel = formatDate(sessionStart, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const timeLabel = formatTime(sessionStart, locale, timeZone);

  return (
    <div className="relative">
      <Card>
        <CardContent className="flex items-center gap-3 p-3 pt-3">
          <Avatar className="h-8 w-8">
            <Identicon id={gamerSeed ?? gamerFirstName} size={32} />
          </Avatar>
          <div className="min-w-0 flex-1 pr-6">
            <p className="truncate text-sm font-medium">{productName}</p>
            <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">
                {t("gamerLabel", { name: gamerFirstName })}
              </span>
              <span className="shrink-0">{`${dateLabel} · ${timeLabel}`}</span>
            </div>
            {/* Not-yet-placed: keep the real schedule above, explain that the
                gamer will be sorted into a group before the session. Only the
                icon carries the info color (the sentence stays muted), matching
                `NextSessionCard`. Static icon (no animation) — placement isn't
                necessarily imminent. */}
            {awaiting && (
              <div className="mt-1 flex items-start gap-1.5">
                <UserRoundSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                <span className="text-xs text-muted-foreground">
                  {tAwaiting(audience === "gamer" ? "gamer" : "customer", {
                    name: gamerFirstName,
                  })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      {/* Shown only when the club's sub is past_due. Audience-aware: clickable
          money badge for parents, non-interactive "ask a parent" alert for
          gamers. */}
      {paymentProblem && <PaymentProblemBadge audience={audience} />}
      {/* Parent-only "Won't renew" / "Last session" note for a cancelled sub
          (mutually exclusive with past_due). Gamer cards are just clamped, no
          badge. */}
      {cancellation && audience === "customer" && (
        <SubscriptionEndingBadge
          accessUntil={cancellation.accessUntil}
          lastSessionStart={cancellation.lastSessionStart}
          isLastSession={cancellation.isLastSession}
          gamerFirstName={gamerFirstName}
        />
      )}
    </div>
  );
}
