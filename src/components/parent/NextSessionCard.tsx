"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink, FileText, UserRoundSearch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { PaymentProblemBadge } from "./PaymentProblemBadge";
import { SubscriptionEndingBadge } from "./SubscriptionEndingBadge";
import type { SessionCancellation } from "./session-card-badge";
import { useNow, useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
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
   * Whether the session's voice *window* is currently open. Pass
   * `computeSessionWindow(schedule, now).isOpen` — the same value the rest
   * of the app uses, so liveness is consistent everywhere. This drives the
   * live card styling + the active Join CTA. For a placed gamer it's also
   * join-ability; an `awaiting` gamer's window still opens on schedule (live
   * card) but the Join button is gated separately — see `awaiting`.
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
  /**
   * The gamer is purchased but not yet placed in a group (`group_id IS
   * NULL`). The full schedule still renders — the schedule lives on the
   * product, not the group — and the card still goes "live" on schedule
   * (`voiceIsOpen` styling + "in progress"), but the Join button is always
   * gated: a future session shows the locked "Opens …" label, and an
   * in-progress one shows a disabled "matching with a Gedu" button (there's
   * no room to join until placement). A friendly "you're in — your instructor
   * will place you in a group" caption appears beneath it either way, so a
   * fresh purchase reads as "we're on it" rather than an empty section.
   * Defaults to `false`.
   */
  awaiting?: boolean;
  /**
   * Whose dashboard this renders on. Only the `awaiting` caption differs:
   * `"customer"` speaks *about* the child ("{name} is in! Their instructor
   * will place them…"), `"gamer"` speaks *to* the child ("you're all signed
   * up! We'll put you in your group…"). Mirrors the audience split the empty
   * state already uses. Defaults to `"customer"`.
   */
  audience?: SessionAudience;
  /**
   * The club's subscription has a payment problem (`past_due`). Shows the
   * corner payment-problem badge — a clickable money badge for parents, a
   * non-interactive "ask a parent" alert for gamers. Defaults to `false`.
   */
  paymentProblem?: boolean;
  /**
   * Present when the parent has cancelled this club's subscription. Renders the
   * muted "Won't renew" / "Last session" badge — parent only (see `audience`);
   * gamer cards are just clamped to the paid window with no badge.
   * `null`/undefined for healthy and non-subscription products.
   */
  cancellation?: SessionCancellation | null;
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
  awaiting = false,
  audience = "customer",
  paymentProblem = false,
  cancellation = null,
}: NextSessionCardProps) {
  const t = useTranslations("parent.nextSession");
  const tAwaiting = useTranslations("parent.awaiting");
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

  // `relative` shell so the corner badge can hang off the card without being
  // clipped by the card's own `overflow-hidden`.
  return (
    <div className="relative">
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
            <div className="min-w-0 flex-1 space-y-0.5 pr-6">
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
            <JoinVoiceButton
              voiceIsOpen={voiceIsOpen}
              voiceHref={voiceHref}
              opensDate={opensDate}
              opensTime={opensTime}
              onJoinClick={onJoinClick}
              awaiting={awaiting}
            />
          </div>

          {/* Purchased-but-not-yet-placed: the Join button above stays
              disabled, this explains *why* in a reassuring, human way — the
              instructor will sort the gamer into a group before the session.
              Deliberately static (no animation): placement can take up to a day,
              so a pulsing/loading cue would wrongly imply it's seconds away. */}
          {awaiting && (
            <div className="flex items-start gap-2 text-left">
              <UserRoundSearch className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <p className="text-xs text-muted-foreground">
                {tAwaiting(audience === "gamer" ? "gamer" : "customer", {
                  name: gamerFirstName,
                })}
              </p>
            </div>
          )}

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
      {/* Shown only when the club's sub is past_due. The badge adapts to
          audience: parents get a clickable money badge, gamers a
          non-interactive alert that tells them to ask a parent. */}
      {paymentProblem && <PaymentProblemBadge audience={audience} showAlert />}
      {/* Shown only when the parent cancelled the sub (mutually exclusive with
          past_due). Parent-only and informational — the gamer's cards are just
          clamped to the paid window. */}
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
