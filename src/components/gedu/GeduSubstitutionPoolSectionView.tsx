"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusLine } from "@/components/ui/alert";
import {
  SubstitutionSessionFacts,
  sessionFactsWhen,
} from "@/components/session-substitution/SubstitutionSessionFacts";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import { substitutionAnswerFailureKey } from "@/services/session-substitution";
import {
  isSubstitutionUrgent,
  type SubstitutionPoolRow,
} from "@/lib/gedu-substitution-pool";
import { useNow, useTimezone } from "@/providers";
import { formatCurrencyFromCents } from "@/lib/utils";

export interface GeduSubstitutionPoolSectionViewProps {
  /**
   * Every open request this gedu could take, soonest first — or `null` while
   * the read has not answered.
   *
   * `null` renders **nothing**, which is the affordance a small indexed read of
   * a bounded set gets: it lands in a frame or two, and a skeleton for it would
   * flash on every ordinary visit. An empty list is a different answer and says
   * so in words.
   */
  rows: readonly SubstitutionPoolRow[] | null;
  /**
   * Which request's **decline** is in the air, or `null`. One id rather than
   * a set: every button on the section goes disabled while one runs, so a
   * second cannot be started under it.
   *
   * An offer in flight is not here, and cannot be: it runs inside a modal
   * dialog that owns its own latch, so nothing on the section behind it is
   * reachable while it lasts.
   */
  committingRequestId: string | null;
  /** Why the last decline was refused, and which card it was on. */
  error: { requestId: string; message: string } | null;
  /**
   * "Offer to substitute", confirmed.
   *
   * **Resolves only once the pool has been read again**, because that is when
   * the dialog closes and the card behind it is looked at; a rejection is what
   * the dialog reads out, so this one does not swallow its own refusals.
   */
  onOffer: (requestId: string) => Promise<void>;
  /**
   * "I cannot" — keyed on the request, as this card knows it. It replaces an
   * offer the caller holds, so it is also how an offer is taken back.
   */
  onDecline: (requestId: string) => void;
}

/**
 * **Sessions needing a substitute** — every open request this gedu could actually take,
 * and the one action on each.
 *
 * **A grid of cards, in the same tiling the gedu's own activity cards use.** It
 * was a list of rows while it was one section near the top of My SOG, on the
 * reasoning that a pool row is read to *decide* and so wants its facts
 * comparable down a column. On a page of its own the reading is different: this
 * is the whole screen, the cards tile across a desktop width instead of running
 * a single narrow column down the middle of it, and what a gedu compares first
 * is how close each session is — which the order already answers.
 *
 * **The absent gedu is not named and neither is their reason.** Naming them
 * half-reveals a private reason, and the seat belongs to the group; what a
 * volunteer decides on is the session. The read does not carry either field, so
 * this is a property of the data rather than a rule this component keeps.
 *
 * **The session is described by the shared session facts**, exactly as the
 * admin page and a sub's own card describe it; what is this card's own is the
 * frame around them — the group, the role and its fee, and the one action.
 *
 * **Urgency is on the card, not only in the order.** A grid is read in two
 * dimensions, so "first" is a weaker signal than it is in a column: every card
 * says how far away its session is in words, and a session inside the next day
 * says it as a warning rather than as a quiet line — the facts draw both, and
 * the pool's own threshold decides which.
 *
 * **The card has three resting states, keyed by the caller's own answer.**
 * Before answering, both answers: Decline and Offer, as one negative and
 * affirmative pair. Once offered, a status line saying so and Decline, which
 * is how the offer is taken back — an offer that cannot be taken back is a
 * commitment nobody agreed to make. Once declined, a quiet line saying so and
 * Offer: the card stays in the pool, so a gedu who misclicked or changed their
 * mind can still offer, and the line tells them their answer was sent. The
 * office sees who declined; nobody else does.
 *
 * **Offering asks first; declining does not.** An offer can be refused — the
 * request may have been filled, the session may have started — and a volunteer
 * needs that answer before they move on, so it goes through the shared confirm
 * dialog in its holding mode: the dialog owns the latch, holds itself open
 * while the write is in the air and reads the refusal out in place. A decline
 * commits the gedu to nothing and is undone by the other button, so it is
 * answered on the card itself.
 *
 * **Empty is an all-clear line, not an absence.** A certified gedu who sees
 * nothing here has been told that nothing is outstanding — which is a real
 * answer and the one they came for. The section is withheld outright only for
 * an *uncertified* gedu, and that is the page's decision rather than this
 * component's: an uncertified account may substitute for nothing, so the honest
 * answer is not to ask the question at all.
 */
export function GeduSubstitutionPoolSectionView({
  rows,
  committingRequestId,
  error,
  onOffer,
  onDecline,
}: GeduSubstitutionPoolSectionViewProps) {
  const t = useTranslations("gedu.substitution");
  /**
   * Which card's offer is being confirmed, or `null`.
   *
   * One dialog for the section rather than one per card: only one can ever be
   * open, and a dialog per card would mount the whole confirm tree six times to
   * show none of them. It holds the row rather than an id because the dialog
   * names the session it is about.
   */
  const [confirming, setConfirming] = useState<SubstitutionPoolRow | null>(null);

  if (rows === null) return null;

  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
        {t("poolAllClear")}
      </p>
    );
  }

  return (
    <>
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <SubstitutionPoolCard
            key={row.requestId}
            row={row}
            committing={committingRequestId === row.requestId}
            // Every button on the section is held while a decline runs: the
            // offers move each other (an approval shortens the queue), and a
            // second press before the first has landed is a request to act on a
            // list that is already stale. An offer in flight needs no such flag
            // — the dialog it runs inside is modal.
            disabled={committingRequestId !== null}
            error={error?.requestId === row.requestId ? error.message : null}
            onOffer={() => setConfirming(row)}
            onDecline={() => onDecline(row.requestId)}
          />
        ))}
      </div>

      {confirming !== null && (
        <OfferConfirmDialog
          row={confirming}
          onClose={() => setConfirming(null)}
          onConfirm={() => onOffer(confirming.requestId)}
        />
      )}
    </>
  );
}

/**
 * The question asked before an offer is made.
 *
 * **Holding, because the answer is the point.** The write can be refused — the
 * request filled while the card was on screen, the session already started, the
 * caller no longer eligible — and a volunteer who walked away from a dialog
 * that closed on the press would believe they had offered. So the dialog stays
 * up until the write settles, reads a refusal out in place, and closes only
 * once the pool has been read again and the card behind it says *offered*.
 *
 * **It names the session and never the person.** The pool's anonymity is a
 * property of the data — the absent gedu is not in the row at all — and this
 * dialog has nothing to add to it.
 *
 * Mounted only while it is open, so its copy is built from a row that is
 * definitely there and its footer children are settled before the first frame.
 */
function OfferConfirmDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: SubstitutionPoolRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const t = useTranslations("gedu.substitution");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("offerConfirmTitle")}
      description={t("offerConfirmBody", {
        product: row.session.productName,
        when: sessionFactsWhen(row.session, locale, timeZone),
      })}
      confirmLabel={t("poolOfferAction")}
      // An affirmative, not a destructive one: this is the action the dialog
      // exists to ask about, so it wears the colour a press wears.
      confirmVariant="default"
      holdWhileCommitting
      onConfirm={onConfirm}
      describeError={(error) => t(substitutionAnswerFailureKey(error))}
    />
  );
}

function SubstitutionPoolCard({
  row,
  committing,
  disabled,
  error,
  onOffer,
  onDecline,
}: {
  row: SubstitutionPoolRow;
  committing: boolean;
  disabled: boolean;
  error: string | null;
  onOffer: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations("gedu.substitution");
  const p = useTranslations("productType");
  const locale = useLocale();
  const now = useNow();

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {p(row.session.productType)}
          </p>
          <p className="text-base font-semibold leading-tight">
            {row.session.productName}
          </p>
          <p className="text-sm text-muted-foreground">{row.groupName}</p>
        </div>

        {/* The facts a volunteer weighs: when, how soon, where, the topic and
            the language — and, appended to that chip run, the two that are this
            card's own: the role being substituted and what it pays. One run
            rather than more lines, because they are small independent facts
            and a column of them would bury the date above. */}
        <SubstitutionSessionFacts
          facts={row.session}
          variant="card"
          howSoon={{ now, urgent: isSubstitutionUrgent(row.session, now) }}
        >
          <Badge variant="outline" className="text-[11px]">
            {row.role === "primary"
              ? t("poolRolePrimary")
              : t("poolRoleAssistant")}
          </Badge>
          {/* Nothing at all when the product has not set a fee for this role.
              A blank field is the existing treatment of a missing assistant
              fee, and a chip reading "not set" would flag a state nobody is
              expected to do anything about. */}
          {row.feeCents !== null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("poolFee", {
                fee: formatCurrencyFromCents(
                  row.feeCents,
                  DEFAULT_CURRENCY,
                  locale,
                ),
              })}
            </span>
          )}
        </SubstitutionSessionFacts>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          {/* The answer already given, above the button that changes it. The
              line is the gedu's receipt — the answer was sent — so an offer
              wears the confirmation glyph and a decline the quiet one. */}
          {row.response === "offer" && (
            <StatusLine status="success" size="xs">
              {t("poolOffered")}
            </StatusLine>
          )}
          {row.response === "decline" && (
            <StatusLine status="info" size="xs" muted>
              {t("poolDeclined")}
            </StatusLine>
          )}
          {/* Negative first, affirmative last, under the app's one button-order
              shape: before any answer the two sit as a pair, Offer on the
              right in a row and on top in a stack. Once an answer is given only
              the other one is left. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {row.response !== "decline" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={onDecline}
                className="gap-1.5 sm:flex-1"
              >
                {committing && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                )}
                {committing ? t("poolDeclinePending") : t("poolDeclineAction")}
              </Button>
            )}
            {row.response !== "offer" && (
              <Button
                type="button"
                // Offering is the thing this page is asking for, so it wears
                // the colour a press wears, in every state it appears in.
                variant="default"
                size="sm"
                disabled={disabled}
                onClick={onOffer}
                className="sm:flex-1"
              >
                {t("poolOfferAction")}
              </Button>
            )}
          </div>
          {error !== null && (
            <StatusLine status="destructive" size="xs" role="alert">
              {error}
            </StatusLine>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
