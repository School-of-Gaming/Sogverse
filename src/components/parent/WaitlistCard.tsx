"use client";

import { useTranslations } from "next-intl";
import { Hourglass } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { LeaveWaitlistBadge } from "./LeaveWaitlistBadge";
import { cn } from "@/lib/utils";
import type { SessionAudience } from "@/types";

/**
 * A club the viewer has joined the *waitlist* for — a `participations` row with
 * `status = 'waitlisted'`, which has no scheduled session yet and so never
 * appears among the `NextSessionCard` / `UpcomingSessionCard` stack (that list
 * is filtered to `status = 'active'`). This card is its home on My SOG.
 *
 * Header deliberately mirrors the session cards: same gamer identicon avatar,
 * same product-name-over-attribution layout — so a waitlisted club reads as the
 * same gamer's "thing" as their scheduled sessions, just in a waiting state.
 * The waiting state is carried by an amber (primary) hourglass status pip on
 * the avatar and a solid purple (secondary) position badge, which also ties the
 * card back to the post-signup confirmation page's `Hourglass` + `#{position}`
 * treatment. Rendered inside the Sessions section under an "On the waitlist"
 * band — see `SessionsSection`.
 *
 * The one thing a parent can do from here is give up the spot — a muted corner
 * badge (`LeaveWaitlistBadge`) in the same slot the session cards use for their
 * payment/cancellation badges, opening a confirm dialog. It only renders for a
 * parent who passed `onLeave`.
 *
 * Presentational only: the caller supplies the product name, gamer, a live
 * 1-based `position`, and the leave handler. Both dashboards (`/parent`,
 * `/gamer`) render the same card; `audience` toggles the "For {name}"
 * attribution, the reassurance voice (about vs. to the child), and whether the
 * leave badge renders at all.
 */

export interface WaitlistCardProps {
  /** Product name (the waitlisted club). */
  productName: string;
  /** First name shown in the "For {name}" attribution (parent audience only). */
  gamerFirstName: string;
  /** Stable seed for the identicon (usually the gamer's UUID). Falls back to the first name. */
  gamerSeed?: string;
  /**
   * 1-based position in line. Always known here: the dashboard lists the
   * viewer's *own* waitlisted participations, so each row's position comes
   * back with it — there's no separate RLS-gated lookup that can miss (unlike
   * the confirmation page's single-row revisit in `PurchaseConfirmationView`).
   */
  position: number;
  /**
   * Whose dashboard this renders on. `"customer"` (default) shows the "For
   * {name}" line and speaks *about* the child in the reassurance copy;
   * `"gamer"` drops the attribution (single implicit gamer) and speaks *to*
   * the child. Mirrors the audience split the session cards use.
   */
  audience?: SessionAudience;
  /**
   * Give up this waitlist spot. When omitted, no corner badge renders — so a
   * caller that hasn't wired the mutation yet simply gets the read-only card.
   * Parent-only: ignored for `audience="gamer"` (see `LeaveWaitlistBadge`).
   */
  onLeave?: () => void;
  /**
   * The leave is in flight — the card fades and the badge locks. Flip this
   * synchronously *before* firing the mutation and hold it until the row
   * disappears from the list; clear it only on outcomes the parent has to
   * retry, which un-dims the card where it stands. See the "Loading & Disabled
   * State" rule.
   */
  leaving?: boolean;
}

export function WaitlistCard({
  productName,
  gamerFirstName,
  gamerSeed,
  position,
  audience = "customer",
  onLeave,
  leaving = false,
}: WaitlistCardProps) {
  const t = useTranslations("parent.waitlist");
  const reassurance = t(
    audience === "gamer" ? "reassuranceGamer" : "reassuranceCustomer",
  );

  return (
    // `relative` shell, not the Card itself: the corner badge hangs off the
    // edge and a Card that ever gains `overflow-hidden` would clip it. Same
    // shape the session cards use.
    //
    // Once the parent confirms, the whole card fades rather than the badge
    // sprouting a spinner — it reads as "on its way out" instead of "something
    // is loading in the corner", and it's the same greyed-while-saving model
    // the admin groups panel uses for its destructive actions. The card is not
    // optimistically removed: with no toast anywhere in the app, a failed leave
    // would snap the card back into the list with nothing to explain why — and
    // that reappearance is a reflow of rendered content with no user
    // interaction behind it. Fading in place keeps the failure silent-but-
    // visible instead: the card simply un-dims where it already was.
    <div
      aria-busy={leaving}
      className={cn("relative transition-opacity", leaving && "opacity-50")}
    >
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            {/* Gamer identicon with an hourglass status pip — matches the
                session cards' avatar header. The pip lives on a `relative`
                wrapper (not the Avatar, which is `overflow-hidden` and would
                clip it) and is ringed in the card surface color so it reads as
                sitting on top of the avatar rather than inside it. */}
            <div className="relative shrink-0">
              <Avatar className="h-12 w-12">
                <Identicon id={gamerSeed ?? gamerFirstName} size={48} />
              </Avatar>
              <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary ring-2 ring-card">
                <Hourglass className="h-3.5 w-3.5 text-primary-foreground" />
              </span>
            </div>
            {/* `pr-6` keeps the product name clear of the corner badge. It's
                unconditional: the reserved gutter costs nothing when no badge
                renders, and making it conditional would shift the title
                sideways the moment a leave handler appears. */}
            <div className="min-w-0 flex-1 space-y-0.5 pr-6">
              <p className="text-lg font-semibold leading-tight">
                {productName}
              </p>
              {audience === "customer" && (
                <p className="truncate text-sm font-medium text-muted-foreground">
                  {t("forLabel", { name: gamerFirstName })}
                </p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex items-center gap-3">
            {/* Solid secondary badge so the number is the hero and pairs with
                the amber pip above. `tabular-nums` + fixed min width keep a
                live position change (people ahead leaving) from reflowing the
                copy beside it — the layout-stability rule. `min-w-14` keeps
                single digits square; `px-3` lets 3+ digits grow without
                clipping. */}
            <div className="flex h-14 min-w-14 items-center justify-center rounded-lg bg-secondary px-3">
              <span className="text-2xl font-bold tabular-nums text-secondary-foreground">
                {t("positionValue", { position })}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("positionLabel")}</p>
              <p className="text-xs text-muted-foreground">{reassurance}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parent-only, and only when the caller can actually action it. A gamer
          can't give up their own place in line — same split as the session
          cards' `SubscriptionEndingBadge`. */}
      {onLeave && audience === "customer" && (
        <LeaveWaitlistBadge
          productName={productName}
          gamerFirstName={gamerFirstName}
          leaving={leaving}
          onConfirm={onLeave}
        />
      )}
    </div>
  );
}
