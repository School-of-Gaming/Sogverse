"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CircleCheck, Heart, Loader2, MailX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { SEAT_OFFER_WINDOW_DAYS } from "@/lib/constants/seat-offer";
import { parseJsonResponse } from "@/lib/api/json-response";
import {
  emailedSeatOfferRespondResponse,
  type EmailedSeatOfferRespondResponse,
} from "@/services/participations/seat-offer.contracts";

/** What answering did — the wire's own word for it. */
type Outcome = EmailedSeatOfferRespondResponse["outcome"];

/**
 * The outcomes that end the page.
 *
 * `expired` is excluded on purpose and is the whole shape of this feature: a
 * lapsed offer is not a full stop any more, because the family can still give
 * the place back from it. It is a step below, not a card.
 */
type TerminalOutcome = Exclude<Outcome, "expired">;

/** An offer still inside its window, with everything the panel prints. */
interface OpenOffer {
  /** Whoever holds the queued place — a child, or the parent themselves. */
  participantName: string;
  isSelfSeat: boolean;
  productName: string;
  /** Already formatted, in the product's zone, with the zone named. */
  deadline: string;
}

/** The offer as the server resolved it, before the first frame. */
type ResolvedOffer = ({ kind: "open" } & OpenOffer) | { kind: "expired" };

/**
 * Which panel is showing.
 *
 * **The step and the outcome are the same piece of state**, because they are
 * the same thing to the reader: one panel is on screen at a time and each
 * replaces the last outright. The open offer's own fields ride inside the step
 * rather than being read off the prop, so there is no arrangement of this state
 * that can put the asking panel on screen with nothing to ask about.
 */
type Step =
  | ({ kind: "offer" } & OpenOffer)
  | { kind: "expired" }
  | { kind: "confirmDecline" }
  | { kind: "answered"; outcome: TerminalOutcome };

interface SeatOfferResponseProps {
  token: string;
  offer: ResolvedOffer;
  /**
   * The button the family pressed in the mail. `decline` opens the confirmation
   * straight away, so pressing "No, thank you" in an inbox does not mean
   * pressing it again from scratch on arrival — and it does that on a lapsed
   * offer too, which is the one place the two states share a path. It cannot
   * answer on their behalf: it only chooses which of this component's own steps
   * is showing. `accept` on a lapsed offer is ignored, because there is no
   * accepting left to do.
   */
  initialIntent: "accept" | "decline" | null;
  /**
   * How an answer reaches the server, for the one caller that must not let it.
   *
   * Omitted everywhere in the product — the live page has a token and a route,
   * and this component owns the call. A fixture-driven preview scene passes its
   * own responder instead, so the two buttons render their real committing and
   * spinning states and land on the real terminal card with nothing leaving the
   * browser. That is the whole reason the seam exists: the alternative was a
   * scene that either fired a POST at a made-up token or faked the panel it was
   * supposed to be showing.
   */
  respond?: (accept: boolean) => Promise<Outcome>;
}

/**
 * The answers a family can give from their inbox, and the cards they lead to.
 *
 * One panel is on screen at a time and each replaces the last outright (see
 * {@link Step}). Nothing survives a change here, so nothing is reserved and
 * nothing moves — the layout rule has nothing to say about a panel swapped for
 * a different panel.
 *
 * **Decline is behind a confirmation and accept is not**, which is not
 * symmetry-for-its-own-sake missing: accepting is the recoverable direction (a
 * family who changes their mind can write to us and give the seat back), while
 * declining deletes a place in a queue that took months to reach. A stray tap
 * on a phone should not be able to spend that.
 *
 * **A lapsed offer still has one answer in it.** The five-day window stops a
 * seat being *claimed* after we have offered it elsewhere; none of that
 * reasoning reaches a family telling us they cannot come, and that is the one
 * piece of news we most want. So the expired panel is a step of this component
 * rather than a terminal card, carrying the decline and not the accept, and the
 * database honours it (00208). It is also where an accept that lost the race
 * lands: the server answers `expired`, and the family is put in front of the
 * one answer still open to them instead of a dead end.
 */
export function SeatOfferResponse({
  token,
  offer,
  initialIntent,
  respond,
}: SeatOfferResponseProps) {
  const t = useTranslations("seatOffer");
  // Where the page starts, and where "back" goes from the confirmation — the
  // same value, because the confirmation is reached from exactly one panel and
  // has to return to it. Derived from the prop on every render rather than
  // captured in state: it is a fact about the link, and the link does not
  // change while the page is open.
  const base: Step =
    offer.kind === "open" ? { ...offer, kind: "offer" } : { kind: "expired" };
  const [step, setStep] = useState<Step>(
    initialIntent === "decline" ? { kind: "confirmDecline" } : base,
  );
  // Set synchronously before the request and cleared only where the reader
  // needs to try again. Every other outcome swaps the panel, and the swap is
  // what takes the buttons off screen — so the flag stays set and the button
  // cannot re-enable in the gap between the answer landing and the view
  // changing.
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function answer(accept: boolean) {
    setCommitting(true);
    setFailed(false);
    try {
      const send = respond ?? ((yes: boolean) => postAnswer(token, yes));
      const outcome = await send(accept);
      // `expired` means two different things depending on which button
      // produced it, and only the press knows which.
      //
      // On an ACCEPT it is an answer: the seat can no longer be claimed, so the
      // reader moves onto the lapsed panel, which still has the decline on it.
      // The buttons there are live again for that reason, so the latch is
      // released with them.
      //
      // On a DECLINE it is a refusal wearing the same word. The database
      // honours a late no for as long as the row exists, so a decline can only
      // come back `expired` when the compare-and-swap was refused for the one
      // reason it will not name — the product was cancelled or deleted — and
      // the dead-end read then resolves a still-live lapsed row to `expired`.
      // Nothing was written. Showing the lapsed panel here would put the reader
      // back in front of the button they just pressed, with no word about why,
      // and every further press would do the same: a silent loop with no exit.
      // So it is reported as the failure it is.
      if (outcome === "expired") {
        if (accept) setStep({ kind: "expired" });
        else setFailed(true);
        setCommitting(false);
        return;
      }
      setStep({ kind: "answered", outcome });
    } catch {
      // The one other path back to the buttons: the answer did not land, so the
      // family has to be able to press again.
      setFailed(true);
      setCommitting(false);
    }
  }

  const failure = failed ? (
    <Failure message={t("offer.error", { supportEmail: SUPPORT_EMAIL })} />
  ) : null;

  if (step.kind === "answered") {
    return <SeatOfferOutcomeCard outcome={step.outcome} />;
  }

  if (step.kind === "confirmDecline") {
    // Two shapes of the same act, so two shapes of the same question. Inside
    // the window the family is handing back a seat we are holding for them;
    // after it the seat has gone and what they are giving up is their place in
    // the queue. Naming the wrong one would be the page telling them something
    // untrue at the moment they are deciding.
    const lapsed = base.kind === "expired";
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {lapsed ? t("expired.confirmTitle") : t("offer.confirmTitle")}
          </h1>
          <p className="text-muted-foreground">
            {lapsed ? t("expired.confirmBody") : t("offer.confirmBody")}
          </p>
        </div>
        {failure}
        {/* The app-wide convention: the affirmative is authored last in the DOM
            and lands on top when the pair is stacked. This panel is stacked at
            every width — it is a narrow column centred on a page of its own,
            with no side-by-side arrangement to reconcile — so `flex-col-reverse`
            is the whole of it: the button that commits the step sits above
            Cancel, and it is still the last thing in the DOM, which is where the
            keyboard and a screen reader meet it. The affirmative here is the
            confirmation itself, because the panel exists to ask it. */}
        <div className="flex w-full flex-col-reverse gap-2">
          <Button
            variant="outline"
            disabled={committing}
            onClick={() => {
              setFailed(false);
              setStep(base);
            }}
          >
            {t("offer.confirmCancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={committing}
            onClick={() => void answer(false)}
          >
            {committing ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {t("offer.confirmAction")}
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === "expired") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <CalendarClock
          className="h-12 w-12 text-muted-foreground"
          aria-hidden
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("expired.title")}</h1>
          <p className="text-muted-foreground">
            {t("expired.body", { days: SEAT_OFFER_WINDOW_DAYS })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("expired.declinePrompt")}
          </p>
        </div>
        {failure}
        {/* One button, so there is no pair to order: the convention governs two
            buttons answering one question, and this panel asks nothing. The
            outline variant is the same weight the decline carries on the live
            offer, because it is the same act. */}
        <Button
          variant="outline"
          className="w-full"
          disabled={committing}
          onClick={() => {
            setFailed(false);
            setStep({ kind: "confirmDecline" });
          }}
        >
          {t("expired.declineAction")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <CalendarClock className="h-12 w-12 text-act" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("offer.title")}</h1>
        <p className="text-muted-foreground">
          {step.isSelfSeat
            ? t("offer.self", { productName: step.productName })
            : t("offer.child", {
                participantName: step.participantName,
                productName: step.productName,
              })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("offer.deadline", { deadline: step.deadline })}
        </p>
      </div>
      {failure}
      {/* Same convention and the same single arrangement as the confirmation
          step above: Accept is authored last and, stacked, sits on top. */}
      <div className="flex w-full flex-col-reverse gap-2">
        <Button
          variant="outline"
          disabled={committing}
          onClick={() => {
            setFailed(false);
            setStep({ kind: "confirmDecline" });
          }}
        >
          {t("offer.decline")}
        </Button>
        <Button disabled={committing} onClick={() => void answer(true)}>
          {committing ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("offer.accept")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Where a seat offer ends up: kept, given back, spent, or unreadable.
 *
 * Exported because two callers render it without ever asking a question. The
 * landing page resolves the token before its first frame, so a link that is
 * already over is a terminal card *instead of* the offer rather than after it —
 * and the preview scenes reach the cards directly, since only one of them can
 * ever be on screen. It takes the wire's own `outcome` word so no caller has to
 * translate between the answer it got and the card it draws.
 *
 * `expired` is not among them, and that is not an omission: a lapsed offer
 * still has a decline in it, so it is a step of {@link SeatOfferResponse} with
 * a button on it rather than a card with nothing to do.
 */
export function SeatOfferOutcomeCard({
  outcome,
}: {
  outcome: TerminalOutcome;
}) {
  const t = useTranslations("seatOffer");

  if (outcome === "accepted") {
    return (
      <Outcome
        icon={<CircleCheck className="h-12 w-12 text-success" aria-hidden />}
        title={t("accepted.title")}
        body={t("accepted.body")}
      >
        <Link href={ROUTES.login} className={buttonVariants()}>
          {t("accepted.action")}
        </Link>
      </Outcome>
    );
  }

  if (outcome === "declined") {
    return (
      <Outcome
        icon={<Heart className="h-12 w-12 text-act" aria-hidden />}
        title={t("declined.title")}
        body={t("declined.body")}
      />
    );
  }

  if (outcome === "used") {
    return (
      <Outcome
        icon={<CircleCheck className="h-12 w-12 text-muted-foreground" aria-hidden />}
        title={t("used.title")}
        body={t("used.body")}
      >
        {/* The one thing worth doing from here, and the reason this card can
            afford to say so little: whatever became of the offer, My SOG is
            where it is written down. */}
        <Link href={ROUTES.login} className={buttonVariants()}>
          {t("used.action")}
        </Link>
      </Outcome>
    );
  }

  return (
    <Outcome
      icon={<MailX className="h-12 w-12 text-muted-foreground" aria-hidden />}
      title={t("invalid.title")}
      body={t("invalid.body", { supportEmail: SUPPORT_EMAIL })}
    />
  );
}

/**
 * The answer, as the product sends it.
 *
 * A module function rather than an inline body so the component's own call site
 * reads as "send the answer, however this instance sends it" — the preview seam
 * above swaps exactly this out.
 */
async function postAnswer(token: string, accept: boolean): Promise<Outcome> {
  const response = await fetch("/api/seat-offer/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, accept }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const { outcome } = await parseJsonResponse(
    response,
    emailedSeatOfferRespondResponse,
  );
  return outcome;
}

/** One terminal card: a mark, a sentence, and at most one thing to do next. */
function Outcome({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {icon}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}

function Failure({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="text-left">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
