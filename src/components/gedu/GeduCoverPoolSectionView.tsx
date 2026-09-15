"use client";

import {
  CalendarClock,
  Check,
  HandHelping,
  Loader2,
  MapPin,
  Radio,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageFlag } from "@/components/ui/language-flag";
import { StatusLine } from "@/components/ui/alert";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { CoverPoolRow } from "@/lib/gedu-cover-pool";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useTimezone } from "@/providers";
import {
  cn,
  formatCurrencyFromCents,
  formatDate,
  formatDateOnly,
  formatTimeRange,
} from "@/lib/utils";

export interface GeduCoverPoolSectionViewProps {
  rows: readonly CoverPoolRow[];
  /**
   * Which request's offer is in the air, or `null`. One id rather than a set:
   * every button on the section goes disabled while one write is running, so a
   * second cannot be started under it.
   */
  committingRequestId: string | null;
  /** Why the last offer or withdrawal was refused, and which row it was on. */
  error: { requestId: string; message: string } | null;
  /** "I can cover this." */
  onOffer: (requestId: string) => void;
  /** Take the offer back — keyed on the request, as this row knows it. */
  onWithdraw: (requestId: string) => void;
}

/**
 * **Sessions needing cover** — every open request this gedu could actually take,
 * and the one action on each.
 *
 * A list rather than the card grid above it, and for a reason the grid cannot
 * serve: a pool row is read to *decide*, so its facts have to be comparable
 * down a column — the same date in the same place on every line, the same fee
 * in the same place — and cards put every fact somewhere slightly different.
 * There is also no identity to recognise here: these are other people's groups.
 *
 * **The absent gedu is not named and neither is their reason.** Naming them
 * half-reveals a private reason, and the seat belongs to the group; what a
 * volunteer decides on is the session. The read does not carry either field, so
 * this is a property of the data rather than a rule this component keeps.
 *
 * **One control per row, in three states**, exactly like the report send two
 * surfaces over: offer, in flight, and offered — where the third is the
 * withdrawal, because an offer that cannot be taken back is a commitment nobody
 * agreed to make. It is the same button in the same slot at every moment, so
 * the row's height never changes and nothing under it moves when an offer
 * lands.
 *
 * **Empty is an all-clear line, not an absence.** A certified gedu who sees
 * nothing here has been told that nothing is outstanding — which is a real
 * answer and the one they came for. The section is withheld outright only for
 * an *uncertified* gedu, and that is the container's decision rather than this
 * component's: an uncertified account may cover nothing, so the honest answer
 * is not to ask the question at all.
 */
export function GeduCoverPoolSectionView({
  rows,
  committingRequestId,
  error,
  onOffer,
  onWithdraw,
}: GeduCoverPoolSectionViewProps) {
  const t = useTranslations("gedu.cover");

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
          {t("poolAllClear")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {rows.map((row) => (
          <CoverPoolRowView
            key={row.requestId}
            row={row}
            committing={committingRequestId === row.requestId}
            // Every button on the section is held while any one write runs:
            // the offers move each other (an approval shortens the queue), and
            // a second press before the first has landed is a request to act on
            // a list that is already stale.
            disabled={committingRequestId !== null}
            error={error?.requestId === row.requestId ? error.message : null}
            onOffer={() => onOffer(row.requestId)}
            onWithdraw={() => onWithdraw(row.requestId)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function CoverPoolRowView({
  row,
  committing,
  disabled,
  error,
  onOffer,
  onWithdraw,
}: {
  row: CoverPoolRow;
  committing: boolean;
  disabled: boolean;
  error: string | null;
  onOffer: () => void;
  onWithdraw: () => void;
}) {
  const t = useTranslations("gedu.cover");
  const p = useTranslations("productType");
  const locale = useLocale();
  const timeZone = useTimezone();
  const topicLabel = useTopicLabel();

  /**
   * The session's day and clock face, **in the viewer's zone** — the gedu
   * deciding whether they are free is free in their own timezone, not in the
   * club's.
   *
   * A request whose weekday the schedule no longer projects has no instant at
   * all, and it falls back to the bare date, UTC-pinned like every other
   * zoneless calendar date. It is history rather than a fault: the row is
   * carried because the queue orders by date and never by a derived instant.
   */
  const when =
    row.startsAt !== null && row.endsAt !== null
      ? `${formatDate(row.startsAt, locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone,
        })}, ${formatTimeRange(row.startsAt, row.endsAt, locale, timeZone)}`
      : formatDateOnly(row.sessionDate, locale);

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-5">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {p(row.productType)}
        </p>
        <p className="text-base font-semibold leading-tight">
          {row.productName}
        </p>
        <p className="text-sm text-muted-foreground">{row.groupName}</p>
        <p className="flex items-start gap-1.5 text-sm tabular-nums text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">{when}</span>
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {row.isRemote ? (
            <>
              <Radio className="h-4 w-4 shrink-0" aria-hidden />
              {t("poolRemote")}
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {row.siteName ?? t("poolSiteUnknown")}
              </span>
            </>
          )}
        </p>
        {/* The facts a volunteer weighs rather than reads in order: the topic,
            the language it is delivered in, the role being covered and what
            that role pays. A chip run rather than four more lines, because they
            are a set of small independent facts and a column of them would bury
            the date above. */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Badge variant="outline" className="text-[11px]">
            {topicLabel(row.topic)}
          </Badge>
          <LanguageFlag code={row.spokenLanguageCode} />
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
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
        <Button
          type="button"
          // Filled while there is something to offer, outlined once the offer
          // is in — the same weight change the report send makes, for the same
          // reason: a finished action is a record rather than an invitation.
          variant={row.hasOffered ? "outline" : "secondary"}
          size="sm"
          disabled={disabled}
          onClick={row.hasOffered ? onWithdraw : onOffer}
          className={cn("gap-1.5", "justify-center")}
        >
          {committing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : row.hasOffered ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <HandHelping className="h-3.5 w-3.5" aria-hidden />
          )}
          {committing
            ? row.hasOffered
              ? t("poolWithdrawPending")
              : t("poolOfferPending")
            : row.hasOffered
              ? t("poolWithdrawAction")
              : t("poolOfferAction")}
        </Button>
        {error !== null && (
          <StatusLine status="destructive" size="xs" role="alert">
            {error}
          </StatusLine>
        )}
      </div>
    </div>
  );
}
