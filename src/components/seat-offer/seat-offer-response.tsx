"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CircleCheck, Heart, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { SEAT_OFFER_WINDOW_DAYS } from "@/lib/constants/seat-offer";
import { parseJsonResponse } from "@/lib/api/json-response";
import {
  seatOfferRespondResponse,
  type SeatOfferRespondResponse,
} from "@/services/participations/seat-offer.contracts";

/** What answering did — the wire's own word for it. */
type Outcome = SeatOfferRespondResponse["outcome"];

interface SeatOfferResponseProps {
  token: string;
  participantName: string;
  isSelfSeat: boolean;
  productName: string;
  /** Already formatted, in the product's zone, with the zone named. */
  deadline: string;
  /**
   * The button the family pressed in the mail. `decline` opens the confirmation
   * straight away, so pressing "No, thank you" in an inbox does not mean
   * pressing it again from scratch on arrival. It cannot answer on their behalf
   * — it only chooses which of this component's own steps is showing.
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
 * The two answers, and the three terminal cards one of them leads to.
 *
 * **The step and the outcome are the same piece of state**, because they are
 * the same thing to the reader: one panel is on screen at a time and each
 * replaces the last outright. Nothing survives a change here, so nothing is
 * reserved and nothing moves — the layout rule has nothing to say about a panel
 * swapped for a different panel.
 *
 * **Decline is behind a confirmation and accept is not**, which is not
 * symmetry-for-its-own-sake missing: accepting is the recoverable direction (a
 * family who changes their mind can write to us and give the seat back), while
 * declining deletes a place in a queue that took months to reach. A stray tap
 * on a phone should not be able to spend that.
 */
export function SeatOfferResponse({
  token,
  participantName,
  isSelfSeat,
  productName,
  deadline,
  initialIntent,
  respond,
}: SeatOfferResponseProps) {
  const t = useTranslations("seatOffer");
  const [step, setStep] = useState<
    "offer" | "confirmDecline" | "accepted" | "declined" | "expired" | "invalid"
  >(initialIntent === "decline" ? "confirmDecline" : "offer");
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
      setStep(await send(accept));
    } catch {
      // The one path back to the buttons: the answer did not land, so the
      // family has to be able to press again.
      setFailed(true);
      setCommitting(false);
    }
  }

  // Every step but the two that still have a question in them is a terminal
  // card, and all three are the same component — which is also what the page
  // renders on its own for a link that was dead before it was opened.
  if (step !== "offer" && step !== "confirmDecline") {
    return <SeatOfferOutcomeCard outcome={step} />;
  }

  if (step === "confirmDecline") {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("offer.confirmTitle")}</h1>
          <p className="text-muted-foreground">{t("offer.confirmBody")}</p>
        </div>
        {failed ? <Failure message={t("offer.error", { supportEmail: SUPPORT_EMAIL })} /> : null}
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
              setStep("offer");
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

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <CalendarClock className="h-12 w-12 text-primary" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("offer.title")}</h1>
        <p className="text-muted-foreground">
          {isSelfSeat
            ? t("offer.self", { productName })
            : t("offer.child", { participantName, productName })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("offer.deadline", { deadline })}
        </p>
      </div>
      {failed ? <Failure message={t("offer.error", { supportEmail: SUPPORT_EMAIL })} /> : null}
      {/* Same convention and the same single arrangement as the confirmation
          step above: Accept is authored last and, stacked, sits on top. */}
      <div className="flex w-full flex-col-reverse gap-2">
        <Button
          variant="outline"
          disabled={committing}
          onClick={() => {
            setFailed(false);
            setStep("confirmDecline");
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
 * Where a seat offer ends up: kept, given back, or gone.
 *
 * Exported because two callers render it without ever asking a question. The
 * landing page resolves the token before its first frame, so a dead link is a
 * terminal card *instead of* the offer rather than after it — and the preview
 * scenes reach the three cards directly, since only one of them can ever be on
 * screen. It takes the wire's own `outcome` word so no caller has to translate
 * between the answer it got and the card it draws.
 *
 * `expired` and `invalid` share a card on purpose: the wire keeps them apart
 * because one is a fact about a window and the other is a refusal to say, and a
 * family reads the same sentence for both.
 */
export function SeatOfferOutcomeCard({ outcome }: { outcome: Outcome }) {
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
        icon={<Heart className="h-12 w-12 text-primary" aria-hidden />}
        title={t("declined.title")}
        body={t("declined.body")}
      />
    );
  }

  return (
    <Outcome
      icon={
        <CalendarClock className="h-12 w-12 text-muted-foreground" aria-hidden />
      }
      title={t("invalid.title")}
      body={t("invalid.body", {
        days: SEAT_OFFER_WINDOW_DAYS,
        supportEmail: SUPPORT_EMAIL,
      })}
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
    seatOfferRespondResponse,
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
