"use client";

import { useState } from "react";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { BADGE_FRAME } from "./session-card-badge";

/**
 * Corner button on a `WaitlistCard` that lets the parent give up their place in
 * line. Shares the session cards' corner geometry (`BADGE_FRAME`) with
 * `PaymentProblemBadge` / `SubscriptionEndingBadge`, so the three read as one
 * system — and, living over the corner rather than in the card body, it can
 * never reflow card content (the "rendered content must not move" rule).
 *
 * **Muted, not destructive.** `PaymentProblemBadge` is filled `destructive`
 * because the *state* it reports is bad. Nothing is wrong with a waitlist spot,
 * so a red corner here would read as "there's a problem with your place in
 * line". The red belongs on the dialog's confirm button, where an actually
 * destructive choice is being made — not on the affordance that opens it.
 *
 * **Why an ellipsis and not an X.** An X in a card's top-right corner
 * conventionally means "dismiss this card". A parent tidying their dashboard
 * would click it expecting the card to disappear, and the only thing standing
 * between them and losing their place in line is the confirm dialog. The
 * ellipsis carries no such promise. The accessible name is the real action
 * ("Leave waitlist"), not "options" — the icon stays neutral, the label stays
 * honest, and screen-reader and hover users get the truth up front. If this
 * card ever grows a second action, this becomes a real menu and the label
 * generalises.
 *
 * Parent-only by convention — `WaitlistCard` gates on `audience`, the same way
 * it does for `SubscriptionEndingBadge`. A gamer shouldn't be able to give up
 * their own spot.
 *
 * `leaving` only *locks* this button — it deliberately doesn't show a spinner.
 * A spinner here would conflate the two things the corner is doing: this glyph
 * is an affordance ("there's an action here"), and swapping it for a status
 * indicator mid-action reads as "something is loading in the corner" rather
 * than "the thing you asked for is happening". The in-flight signal belongs to
 * the whole card, which dims — see `WaitlistCard`. The button can't fire twice
 * regardless: confirming closes the dialog.
 */
export function LeaveWaitlistBadge({
  /** Product name, named in the confirm dialog. */
  productName,
  /** First name, named in the confirm dialog ("{name} will lose their place"). */
  gamerFirstName,
  /**
   * The leave is in flight — locks the button (the card carries the visible
   * signal). Held by the caller across the row's removal — see the "Loading &
   * Disabled State" rule.
   */
  leaving = false,
  /** Fires when the parent confirms. The dialog closes itself afterwards. */
  onConfirm,
  className,
}: {
  productName: string;
  gamerFirstName: string;
  leaving?: boolean;
  onConfirm: () => void;
  className?: string;
}) {
  const t = useTranslations("parent.waitlist.leave");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={leaving}
        title={t("trigger")}
        aria-label={t("trigger")}
        className={cn(
          BADGE_FRAME,
          "w-7 bg-muted text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // No `disabled:opacity-*` — the card wrapper already dims while
          // leaving, and stacking a second fade on top just makes the badge
          // murky.
          "disabled:cursor-default disabled:hover:bg-muted disabled:hover:text-muted-foreground",
          className,
        )}
      >
        <MoreHorizontal className="h-4 w-4 shrink-0" />
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={t("confirmDescription", {
          name: gamerFirstName,
          product: productName,
        })}
        confirmLabel={t("confirmCta")}
        onConfirm={onConfirm}
      >
        {/* The part a parent won't think of on their own: leaving isn't
            reversible by re-joining. Same destructive callout treatment the
            admin groups panel uses for its no-refund warning. */}
        <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("backOfLineWarning")}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
