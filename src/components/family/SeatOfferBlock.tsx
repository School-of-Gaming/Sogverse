"use client";

import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { SeatOfferState } from "@/lib/seat-offer-state";
import type { SeatOfferRespondResponse } from "@/services/participations/seat-offer.contracts";

/** What answering did, as far as this block is concerned. */
type Outcome = SeatOfferRespondResponse["outcome"];

interface SeatOfferBlockProps {
  /**
   * The offer as of this render. Only `live` and `expired` reach here — the
   * card decides whether to draw a block at all.
   */
  offer: Extract<SeatOfferState, { kind: "live" | "expired" }>;
  /**
   * Whose seat it is: the child's first name, or `null` when the parent is
   * answering for a place they queued for themselves.
   */
  gamerFirstName: string | null;
  /**
   * Answer, and say what the server made of it. Omitted on a child's own copy
   * of the card, which reads the offer but cannot act on it — the respond route
   * is authorized to the purchasing parent, and the database keys on the same
   * thing, so a button here would only ever produce a refusal.
   */
  onRespond?: (accept: boolean) => Promise<Outcome>;
}

/**
 * The offer, on the family's own card in My SOG.
 *
 * **The block is a mark that arrives late and therefore sits at the very end of
 * the card — do not move it up.** An offer lands on a card that is already
 * painted (a refetch, a page the parent left open), and anywhere above the
 * card's own footer it would shove the queue position and the schedule down the
 * viewport while somebody was reading them. At the end of the run it grows into
 * the card's own slack and nothing already on screen moves. It also reads
 * correctly there, as the one thing on the card there is to *do*.
 *
 * **Decline is behind a confirmation and accept is not**, exactly as on the
 * emailed landing page and for the same reason: accepting is recoverable, while
 * declining deletes a place in a queue that may have taken months to reach.
 *
 * **An offer that runs out under the reader's eyes does not disappear.** The
 * clock is not something the parent did, so vanishing the block would be a
 * change on time's own schedule, pulling everything below it up the page —
 * possibly out from under a finger already travelling towards Accept. Instead
 * the deadline sentence becomes the lapsed sentence and both buttons go inert:
 * same block, same buttons, same place, and a press that was already in flight
 * lands on nothing. The tolerance accepted here is that the two sentences may
 * set to different line counts in the widest locale, which would move the
 * buttons by one line — both are short, deliberately, and one line is a great
 * deal less than the whole block leaving.
 *
 * A parent who answers *after* the window closed gets the same treatment: the
 * server says `expired`, and that is the lapsed state, not an error. The only
 * thing that surfaces as a failure is a request that never landed, which is the
 * only case where pressing again is the right advice.
 */
export function SeatOfferBlock({
  offer,
  gamerFirstName,
  onRespond,
}: SeatOfferBlockProps) {
  const t = useTranslations("parent.waitlist.seatOffer");
  const locale = useLocale();
  const timeZone = useTimezone();

  const [confirmingDecline, setConfirmingDecline] = useState(false);
  // Set synchronously before the answer goes out and cleared only where the
  // parent has to try again. On every other outcome the card either stops being
  // a waitlist card at all (accepted), leaves the list (declined), or flips to
  // the lapsed state below — so the flag stays set and a second tap on a phone
  // cannot spend the seat twice.
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  // The server's own verdict, once it has one. It outranks the clock: a
  // `stale` answer (already used, or superseded by a fresh offer) is not
  // something a local deadline can work out.
  const [refused, setRefused] = useState(false);

  const lapsed = refused || offer.kind === "expired";

  // The deadline in the *viewer's* zone — a moment with a clock face converts.
  // The mail states the same instant in the product's zone, which is the right
  // answer there and would be the wrong one here, so the zone is named on both:
  // a parent holding the mail beside the page can see the two clocks agree.
  const deadline = formatDate(offer.deadline, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  });

  async function answer(accept: boolean) {
    if (!onRespond) return;
    setCommitting(true);
    setFailed(false);
    try {
      const outcome = await onRespond(accept);
      // `accepted` and `declined` both take this card off the waitlist band on
      // the refetch that has already settled by the time this resolves, so
      // there is nothing to do for them. The other two mean the offer was gone
      // before the press landed.
      if (outcome === "expired" || outcome === "invalid") setRefused(true);
    } catch {
      setFailed(true);
      setCommitting(false);
    }
  }

  return (
    <div className="w-full space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-left">
      <div className="flex items-start gap-2">
        <CalendarClock
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold leading-snug">{t("title")}</p>
          <p className="text-sm leading-snug text-muted-foreground">
            {onRespond === undefined
              ? t("bodyGamer")
              : gamerFirstName === null
                ? t("bodySelf")
                : t("bodyChild", { name: gamerFirstName })}
          </p>
          <p className="text-sm leading-snug text-muted-foreground">
            {lapsed ? t("lapsed") : t("deadline", { deadline })}
          </p>
        </div>
      </div>

      {failed && (
        <p className="text-sm font-medium text-destructive">
          {t("error", { supportEmail: SUPPORT_EMAIL })}
        </p>
      )}

      {onRespond !== undefined && (
        // Stacked on a phone and side by side from tablet width up. Stacked is
        // not a fallback here: at the 360px floor this block has about 290px of
        // its own, and "Accepter la place" beside "Non, merci" does not fit in
        // it. Accept comes first in both arrangements, because it is the answer
        // a family reaching this block is overwhelmingly about to give.
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="sm:flex-1"
            disabled={committing || lapsed}
            onClick={() => void answer(true)}
          >
            {committing && <Loader2 className="animate-spin" aria-hidden />}
            {t("accept")}
          </Button>
          <Button
            variant="outline"
            className="sm:flex-1"
            disabled={committing || lapsed}
            onClick={() => {
              setFailed(false);
              setConfirmingDecline(true);
            }}
          >
            {t("decline")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDecline}
        onOpenChange={setConfirmingDecline}
        title={t("confirmTitle")}
        description={
          gamerFirstName === null
            ? t("confirmBodySelf")
            : t("confirmBodyChild", { name: gamerFirstName })
        }
        confirmLabel={t("confirmCta")}
        onConfirm={() => void answer(false)}
      />
    </div>
  );
}
