"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PersonChip } from "@/components/ui/person-chip";
import { cn } from "@/lib/utils";
import type {
  SubstitutionOffer,
  SubstitutionRequest,
} from "./admin-substitutions-data";
import {
  OpenGroupLink,
  SubstitutionAwayLine,
  SubstitutionSessionHeading,
} from "./substitution-session-lines";

/**
 * One open request: which session is short-staffed, how soon, who is away, why,
 * and who has volunteered.
 *
 * **This is the card.** The requests are peers, each with an action of its own,
 * so the edge belongs at this level and the list around them is a heading over
 * a stack. Inside it nothing else is boxed: the offers are facts about *this*
 * request, so they are divider-separated rows under a muted label, which is
 * what the card rule asks for and what stops the page reading as a box inside a
 * box inside a box.
 *
 * **The session comes first and the person second**, which is the reverse of
 * the certification queue on the dashboard. There the row *is* a person and the
 * decision is about them; here the decision is about a session — this Friday's
 * group needs a primary — and who is away is a fact about it. Both lines are
 * the ones the substituted-session card opens with too, so the two sections
 * state one session in the same words.
 *
 * **The urgency treatment is one tint and one rule, and it fires inside a
 * day.** A session starting within 24 hours wears `warning` on this card's own
 * left edge and on the relative phrase, and nothing else changes — no second
 * colour, no badge, no reordering. It is the same token the page uses anywhere
 * else it wants an eye: one colour for "look here", met in one vocabulary. An
 * orphaned request claims no urgency at all, because it has no start to be
 * urgent about.
 *
 * **Approve asks first, and this card holds none of that.** Approving seats a
 * person on a session and opens the group's workspace — its roster, its
 * children — to them, which is a decision somebody should be asked to confirm
 * rather than one press away; and the write is refusable, so its answer is
 * news the admin needs before they move on. Both are what the shared confirm
 * dialog's holding mode is for, and the dialog owns the latch, the disabled
 * buttons and the refusal line. The press here only says *which* offer: the
 * dialog that opens is modal, so nothing on this card is reachable while the
 * write is in the air and there is no second press to guard against, and no
 * state here means the card's height cannot change while the dialog is over
 * it.
 *
 * **A request with no offers is not a failure state and is not tinted as one.**
 * Nobody has volunteered *yet*, and what an admin does about it is on the
 * group's own page, where a sub can be seated outright — so the card says so
 * plainly, in the slot the offers would have filled, and points there.
 */
export function SubstitutionRequestRow({
  request,
  now,
  onApproveOffer,
}: {
  request: SubstitutionRequest;
  /** The page's pinned clock — what the relative phrase is measured against. */
  now: Date;
  /** Ask about one offer — the dialog above owns everything after the press. */
  onApproveOffer: (offer: SubstitutionOffer) => void;
}) {
  const t = useTranslations("admin.substitutions");
  const offersLabelId = useId();

  return (
    <Card
      className={cn(
        // The whole of the urgency treatment: a thicker left edge in the one
        // token this page uses for "look here". It is this card's own edge, so
        // it costs no extra box. Restrained on purpose — the list is already
        // sorted soonest-first, so the tint marks where the near end stops
        // rather than doing the ordering's job over again.
        request.urgent && "border-l-4 border-l-warning",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <SubstitutionSessionHeading session={request} now={now} />
        <SubstitutionAwayLine session={request} />

        {/* One slot, two states. A request nobody has answered says so on the
            line the offers would have used, rather than leaving an empty box
            where a list was. */}
        <div className="space-y-1">
          <p id={offersLabelId} className="text-xs text-muted-foreground">
            {t("offersLabel")}
          </p>
          {request.offers.length === 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p className="text-xs text-muted-foreground">{t("noOffers")}</p>
              <OpenGroupLink href={request.groupHref} />
            </div>
          ) : (
            <ul
              aria-labelledby={offersLabelId}
              className="divide-y divide-border"
            >
              {request.offers.map((offer) => (
                <li key={offer.id}>
                  <OfferRow offer={offer} onApprove={() => onApproveOffer(offer)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One volunteer, and the press that opens the question about them — a row
 * inside the request's card, told from its neighbours by a divider rather than
 * by a box of its own.
 *
 * **A name and nothing else.** The row used to carry the certification queue's
 * two standings — certified, and whether an extract had been recorded — and
 * both are gone: the database refuses an offer from anybody who may not
 * substitute, certification included, so the chip stated something that was
 * true by construction, and an extract date is children's-safety data about a
 * contractor on a surface that does not act on it.
 *
 * **It holds no state at all.** The press opens a modal dialog that owns the
 * latch, the spinner and the refusal line, so there is nothing here to disable
 * and nothing here that can change the row's height while the dialog is over
 * it. The button is right-packed so the column a reader presses is the same
 * column on every row.
 */
function OfferRow({
  offer,
  onApprove,
}: {
  offer: SubstitutionOffer;
  onApprove: () => void;
}) {
  const t = useTranslations("admin.substitutions");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PersonChip id={offer.geduId} name={offer.name ?? t("unnamed")} />
      </div>
      <Button type="button" size="sm" onClick={onApprove}>
        {t("approve")}
      </Button>
    </div>
  );
}
