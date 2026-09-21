"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  CalendarDays,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person-chip";
import { cn } from "@/lib/utils";
import type { SubstitutionOffer, SubstitutionRequest } from "./admin-dashboard-data";
import { PRODUCT_TYPE_PRESENTATION } from "./product-type-presentation";

/**
 * One request: which session is short-staffed, who is away, why, and who has
 * volunteered.
 *
 * **The session comes first and the person second**, which is the reverse of
 * the certification queue next to it. There the row *is* a person and the
 * decision is about them; here the decision is about a session — this Friday's
 * group needs a primary — and who is away is a fact about it, carried at the
 * density the reason beside it reads at. It is also the half an admin is least
 * entitled to dwell on: the reason is health-related data about a contractor,
 * shown because the office has to plan around it and nowhere else on the
 * platform.
 *
 * **Approve is per offer, and one in flight disables the others.** Approving
 * settles the whole request — the other offers are simply not selected — so a
 * second press on the same row is either a duplicate of the write already
 * running or a decision the admin has not been given the chance to see the
 * outcome of. The flag is set synchronously before the write, and cleared on
 * settle whichever way it settles.
 *
 * **It is cleared on success because this row can survive its own approval.**
 * The usual outcome is that the refetched snapshot has dropped the request and
 * the panel unmounts the row, which needs no clear — but the panel deliberately
 * tolerates a request the source is still offering after an approval, which is
 * what a second admin clearing the sub in between produces, and it hands the
 * row back rather than filtering it out on a receipt that is no longer true. A
 * flag left set there would leave every offer on a live request permanently
 * unpressable. The clear costs no re-enabled frame in the ordinary case: the
 * promise resolves only once the write has landed *and* the snapshot behind it
 * has come back, so the state that unmounts the row is already queued when this
 * one is.
 *
 * **A request with no offers is not a failure state and is not tinted as one.**
 * Nobody has volunteered *yet*, and what an admin does about it is on the
 * group's own page, where a sub can be seated outright — so the row says so
 * plainly and points there.
 */
export function SubstitutionRequestRow({
  request,
  onApproveOffer,
}: {
  request: SubstitutionRequest;
  /** Approve one offer. Resolves once the write landed; rejects if it did not. */
  onApproveOffer: (offerId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.substitution");
  const tRole = useTranslations("admin.geduRole");
  const tType = useTranslations("admin.products.types");
  const [committingOfferId, setCommittingOfferId] = useState<string | null>(
    null,
  );
  const [failedOfferId, setFailedOfferId] = useState<string | null>(null);

  const presentation = PRODUCT_TYPE_PRESENTATION[request.productType];
  const TypeIcon = presentation.icon;

  function approve(offerId: string) {
    setCommittingOfferId(offerId);
    setFailedOfferId(null);
    void onApproveOffer(offerId)
      .catch(() => {
        setFailedOfferId(offerId);
      })
      .finally(() => {
        setCommittingOfferId(null);
      });
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* The eyebrow is the tinted type glyph the whole page speaks in — the
            attention cards, the schedule chips and the key all wear it, and the
            rail at the side of the page is what explains it. */}
        <TypeIcon
          className={cn(
            "h-4 w-4 shrink-0 translate-y-0.5",
            presentation.text,
          )}
          aria-label={tType(`${presentation.i18nKey}.label`)}
        />
        {/* Wraps rather than truncates, as it does on an attention card: a
            product's name is how an admin knows which of five Minecraft clubs
            this is. */}
        <span className="text-sm font-medium leading-snug">
          {request.productName}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {request.groupName}
        </span>
        {/* The date and, where the schedule still projects one, the clock face
            — in the schedule chips' own tabular numerals, because the two
            panels state the same sessions and a reader comparing them is
            comparing numbers. A request the schedule no longer projects states
            the date alone; that orphan is the case the queue exists to
            tolerate, and a row that guessed a time for it would be inventing
            one. */}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
          {request.sessionDate}
          {request.sessionTime !== null && (
            <span className="font-medium tabular-nums">
              {request.sessionTime}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">{t("away")}</span>
        <PersonChip
          id={request.requesterId}
          name={request.requesterName ?? t("unnamed")}
          size="compact"
        />
        <span className="text-muted-foreground">
          {tRole(request.role)}
          {request.reason !== null && ` · ${t(`reason.${request.reason}`)}`}
        </span>
        {/* The note is the absent gedu's own words, capped at 500 characters by
            the writer and plain text end to end. It wraps rather than being
            clamped: an admin planning around somebody's absence is entitled to
            the whole of the sentence they wrote. */}
        {request.reasonNote !== null && (
          <span className="w-full text-muted-foreground">
            {request.reasonNote}
          </span>
        )}
      </div>

      {request.offers.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("noOffers")}</p>
          <Link
            href={request.groupHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-7 gap-1 px-2 text-xs",
            )}
          >
            {t("openGroup")}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul aria-label={t("offersLabel")} className="space-y-1">
          {request.offers.map((offer) => (
            <li key={offer.id}>
              <OfferRow
                offer={offer}
                committing={committingOfferId === offer.id}
                disabled={committingOfferId !== null}
                failed={failedOfferId === offer.id}
                onApprove={() => approve(offer.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One volunteer, with the two standings the certification queue ships on its
 * own rows and the press that seats them.
 *
 * The standings keep their full width and take a line of their own when the row
 * runs out of room, exactly as they do in the certification queue: truncating
 * one would leave the admin reading half of a fact they are deciding on. Only a
 * missing standing is tinted — the one worth catching an eye that is scanning a
 * column — and neither gates the press, because the database has already
 * refused anybody who may not substitute.
 */
function OfferRow({
  offer,
  committing,
  disabled,
  failed,
  onApprove,
}: {
  offer: SubstitutionOffer;
  committing: boolean;
  /** Another offer on this request is being approved — the whole row is settled. */
  disabled: boolean;
  failed: boolean;
  onApprove: () => void;
}) {
  const t = useTranslations("admin.dashboard.substitution");
  const certification = useTranslations("admin.users.certification");
  const check = useTranslations("admin.geduCriminalRecordCheck");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-lifted px-2.5 py-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <PersonChip id={offer.geduId} name={offer.name ?? t("unnamed")} />
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs",
            offer.certified ? "text-muted-foreground" : "text-warning",
          )}
        >
          <ShieldCheck className="h-3 w-3" aria-hidden />
          {offer.certified
            ? certification("certified")
            : certification("notCertified")}
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs",
            offer.criminalRecordCheckOn === null
              ? "text-warning"
              : "text-muted-foreground",
          )}
        >
          <Scale className="h-3 w-3" aria-hidden />
          {offer.criminalRecordCheckOn === null
            ? check("queueNotRecorded")
            : check("queueRecorded", { date: offer.criminalRecordCheckOn })}
        </span>
      </div>
      {/* Only rendered once a write has failed, and it takes the full row width
          so it lands under the button rather than squeezing the name beside it.
          Nothing reserves space for it: before the first failure there is
          nothing here to move, and the row it appears in is one the admin just
          acted on. */}
      {failed && (
        <StatusLine status="destructive" size="xs" className="order-last w-full">
          {t("failed")}
        </StatusLine>
      )}
      <Button
        type="button"
        size="sm"
        onClick={onApprove}
        disabled={disabled || committing}
      >
        {committing ? t("approving") : t("approve")}
      </Button>
    </div>
  );
}
