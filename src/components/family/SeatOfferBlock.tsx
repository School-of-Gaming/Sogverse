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
 * **It is drawn as the card's last section rather than as a panel of its own**
 * — an info-toned rule across the top, an info icon and heading under it, and
 * no border, radius or fill anywhere. See the note on the container below for
 * why a bordered tinted box was wrong here and what was tried instead.
 *
 * **The block is a mark that arrives late and therefore sits at the very end of
 * the card — do not move it up.** An offer lands on a card that is already
 * painted (a refetch, a page the parent left open), and anywhere above the
 * card's own footer it would shove the queue position and the schedule down the
 * viewport while somebody was reading them. At the end of the run it grows into
 * the card's own slack instead, and nothing already painted *inside the card*
 * moves — the card itself still grows, and the cards stacked below it still go
 * down the page, which is the residual the call site names in full. It also
 * reads correctly there, as the one thing on the card there is to *do*.
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
 *
 * **"Still disabled" and "still working" are two states, held separately.** The
 * house rule keeps the buttons inert from the click all the way through to the
 * card leaving — that latch survives a refusal on purpose — but the spinner is
 * a claim about a request that is still open, and a refusal closes one. Held as
 * one flag they were the same claim, so an expired answer left the block saying
 * the offer had lapsed with a spinner still turning under it. The spinner sits
 * on whichever button was actually pressed, too: declining goes through a
 * confirmation that closes on confirm, so the block is on screen for the whole
 * of that request and a spinner nailed to Accept was pointing at the button
 * nobody had touched.
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
  // **Which button is spinning, which is a different question from whether the
  // buttons are disabled** — and the two were one boolean until an expired
  // answer left a spinner turning forever under a sentence saying the offer had
  // lapsed. `committing` is the house rule's latch and stays set through the
  // terminal states; this one is the request's own lifetime and clears on every
  // settle. It also names *which* action is in flight, because the answer can
  // come from either button and a spinner that always sat on Accept was
  // reporting the wrong one whenever a parent declined.
  const [inFlight, setInFlight] = useState<"accept" | "decline" | null>(null);
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
    setInFlight(accept ? "accept" : "decline");
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
    } finally {
      // Every settle, including the ones `committing` deliberately survives:
      // the request is over, so nothing is still spinning. On the two outcomes
      // that swap the card the caller's promise resolves only after the refetch
      // has landed, so this clears into a component that is already leaving.
      setInFlight(null);
    }
  }

  return (
    // **A section of the card, not a card inside it.** The tone is still `info`
    // — this product's colour for "we are telling you something", the one the
    // awaiting-placement line a few rows up already wears and the one the mail's
    // own callout panel is built from — but it is carried by the rule, the icon
    // and the heading rather than by a box. A rounded, bordered, tinted panel
    // inset inside an already rounded, bordered, tinted card reads as a second
    // card nested in the first, which is a claim about hierarchy that is not
    // true: this is the card's own last section.
    //
    // A top rule with padding under it is the house's existing vocabulary for
    // exactly that — the shape every other in-card section here takes — and the
    // rule is drawn in the section's own tone so the colour survives the box
    // going. The left-accent bar was the other candidate and was dropped: a
    // vertical rule down the side of a passage reads as a callout or a quote,
    // and it already means "a feed's spine" everywhere else in this codebase.
    // A tint without the border cannot work inset either — a sharp-cornered
    // rectangle floating inside a rounded card looks like a rendering fault —
    // and the full-bleed version of it would have to cancel the card's own
    // padding with negative margins, coupling this component to a number that
    // lives in `EnrollmentCard`.
    //
    // The Accept button below keeps the default (primary) variant: the block is
    // the notice, the button is the action, and they are not the same claim.
    <div className="w-full space-y-3 border-t border-info/25 pt-4 text-left">
      <div className="flex items-start gap-2">
        <CalendarClock
          className="mt-0.5 h-4 w-4 shrink-0 text-info"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          {/* The heading takes the tone the border box used to carry. With no
              fill behind it, the icon alone is a small mark to hang a section
              on; the icon and the title together are the section's marker. */}
          <p className="text-sm font-semibold leading-snug text-info">
            {t("title")}
          </p>
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
        // it.
        //
        // **The order is the app-wide convention: affirmative on the right side
        // by side, affirmative on TOP when stacked — one DOM order, reversed by
        // the stacking direction.** So Decline is authored first and Accept
        // last, which puts Accept in the right-hand cell from `sm` up; and
        // `flex-col-reverse` flips the narrow arrangement so Accept is the top
        // button rather than the bottom one. Two things follow from writing it
        // this way rather than swapping the JSX at a breakpoint: the affirmative
        // is last in the DOM at every width, so tab order and screen-reader
        // order never disagree with the convention; and the pair is authored
        // once, so a later edit cannot move one arrangement without the other.
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="sm:flex-1"
            disabled={committing || lapsed}
            onClick={() => {
              setFailed(false);
              setConfirmingDecline(true);
            }}
          >
            {inFlight === "decline" && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            {t("decline")}
          </Button>
          <Button
            className="sm:flex-1"
            disabled={committing || lapsed}
            onClick={() => void answer(true)}
          >
            {inFlight === "accept" && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            {t("accept")}
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
