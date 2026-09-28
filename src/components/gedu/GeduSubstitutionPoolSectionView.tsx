"use client";

import { useState } from "react";
import { CalendarClock, Check, Clock, Loader2, MapPin, Radio } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LanguageFlag } from "@/components/ui/language-flag";
import { StatusLine } from "@/components/ui/alert";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";
import {
  isSubstitutionUrgent,
  type SubstitutionPoolRow,
} from "@/lib/gedu-substitution-pool";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useNow, useTimezone } from "@/providers";
import {
  formatCurrencyFromCents,
  formatDate,
  formatDateOnly,
  formatTimeRange,
} from "@/lib/utils";

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
   * Which request's **withdrawal** is in the air, or `null`. One id rather than
   * a set: every button on the section goes disabled while one runs, so a
   * second cannot be started under it.
   *
   * An offer in flight is not here, and cannot be: it runs inside a modal
   * dialog that owns its own latch, so nothing on the section behind it is
   * reachable while it lasts.
   */
  committingRequestId: string | null;
  /** Why the last withdrawal was refused, and which card it was on. */
  error: { requestId: string; message: string } | null;
  /**
   * "Offer to substitute", confirmed.
   *
   * **Resolves only once the pool has been read again**, because that is when
   * the dialog closes and the card behind it is looked at; a rejection is what
   * the dialog reads out, so this one does not swallow its own refusals.
   */
  onOffer: (requestId: string) => Promise<void>;
  /** Take the offer back — keyed on the request, as this card knows it. */
  onWithdraw: (requestId: string) => void;
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
 * **Urgency is on the card, not only in the order.** A grid is read in two
 * dimensions, so "first" is a weaker signal than it is in a column: every card
 * says how far away its session is in words, and a session inside the next day
 * says it as a warning rather than as a quiet line. No new colour and no motion
 * — the warning status is the one the rest of the app already uses to mean
 * *this needs you now*, and the two lines are the same size and the same single
 * line, so nothing on the card moves when one becomes the other.
 *
 * **One control per card, in two resting states**: offer, and — once the offer
 * is in — the withdrawal, because an offer that cannot be taken back is a
 * commitment nobody agreed to make. It is the same button in the same slot at
 * every moment and neither state carries a glyph, so the card's height never
 * changes and nothing in the grid moves when an offer lands.
 *
 * **Offering asks first; withdrawing does not.** An offer can be refused — the
 * request may have been filled, the session may have started — and a volunteer
 * needs that answer before they move on, so it goes through the shared confirm
 * dialog in its holding mode: the dialog owns the latch, holds itself open
 * while the write is in the air and reads the refusal out in place. The
 * withdrawal is the undo of that decision and is answered on the card itself.
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
  onWithdraw,
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
            // Every button on the section is held while a withdrawal runs: the
            // offers move each other (an approval shortens the queue), and a
            // second press before the first has landed is a request to act on a
            // list that is already stale. An offer in flight needs no such flag
            // — the dialog it runs inside is modal.
            disabled={committingRequestId !== null}
            error={error?.requestId === row.requestId ? error.message : null}
            onOffer={() => setConfirming(row)}
            onWithdraw={() => onWithdraw(row.requestId)}
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
        product: row.productName,
        when: sessionWhen(row, locale, timeZone),
      })}
      confirmLabel={t("poolOfferAction")}
      // An affirmative, not a destructive one: this is the action the dialog
      // exists to ask about, so it wears the colour a press wears.
      confirmVariant="default"
      holdWhileCommitting
      onConfirm={onConfirm}
      describeError={() => t("poolActionFailed")}
    />
  );
}

/**
 * The session's day and clock face, **in the viewer's zone** — the gedu
 * deciding whether they are free is free in their own timezone, not in the
 * club's.
 *
 * A request whose weekday the schedule no longer projects has no instant at
 * all, and it falls back to the bare date, UTC-pinned like every other zoneless
 * calendar date. It is history rather than a fault: the queue carries it
 * because a request is keyed by date and never by a derived instant.
 *
 * Shared by the card and the dialog it opens, so the session a volunteer is
 * asked about is worded exactly as the card they pressed worded it.
 */
function sessionWhen(
  row: SubstitutionPoolRow,
  locale: string,
  timeZone: string,
): string {
  if (row.startsAt === null || row.endsAt === null) {
    return formatDateOnly(row.sessionDate, locale);
  }
  return `${formatDate(row.startsAt, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })}, ${formatTimeRange(row.startsAt, row.endsAt, locale, timeZone)}`;
}

function SubstitutionPoolCard({
  row,
  committing,
  disabled,
  error,
  onOffer,
  onWithdraw,
}: {
  row: SubstitutionPoolRow;
  committing: boolean;
  disabled: boolean;
  error: string | null;
  onOffer: () => void;
  onWithdraw: () => void;
}) {
  const t = useTranslations("gedu.substitution");
  const p = useTranslations("productType");
  const locale = useLocale();
  const format = useFormatter();
  const timeZone = useTimezone();
  const now = useNow();
  const topicLabel = useTopicLabel();

  const when = sessionWhen(row, locale, timeZone);

  /**
   * How far away it is, in words — "in 3 hours", "tomorrow", "in 5 days".
   *
   * Formatted rather than translated: the phrasing, the unit and the plural are
   * the locale's own, and a string per shape of gap would be a catalogue of
   * arithmetic. An orphaned date has no instant to measure from and carries no
   * line at all.
   */
  const relative =
    row.startsAt === null ? null : format.relativeTime(row.startsAt, now);
  const urgent = isSubstitutionUrgent(row, now);

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {p(row.productType)}
          </p>
          <p className="text-base font-semibold leading-tight">
            {row.productName}
          </p>
          <p className="text-sm text-muted-foreground">{row.groupName}</p>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="flex items-start gap-1.5 text-sm tabular-nums text-muted-foreground">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">{when}</span>
          </p>
          {/* The same one line either way — the quiet clock, or the warning
              mark the rest of the app uses for a thing that needs somebody
              now. */}
          {relative !== null &&
            (urgent ? (
              <StatusLine status="warning" size="xs">
                {relative}
              </StatusLine>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0">{relative}</span>
              </p>
            ))}
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
        </div>

        {/* The facts a volunteer weighs rather than reads in order: the topic,
            the language it is delivered in, the role being substituted and what
            that role pays. A chip run rather than four more lines, because they
            are a set of small independent facts and a column of them would bury
            the date above. */}
        <div className="flex flex-wrap items-center gap-2">
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

        <div className="mt-auto flex flex-col gap-1 pt-1">
          <Button
            type="button"
            // The act colour while there is something to offer, outlined once
            // the offer is in — the same weight change the report send makes,
            // for the same reason: a finished action is a record rather than an
            // invitation. Offering is the thing this page is asking for, so it
            // wears the colour a press wears.
            variant={row.hasOffered ? "outline" : "default"}
            size="sm"
            disabled={disabled}
            // Offering opens the question; withdrawing is the undo and is
            // answered here. Neither resting state carries a glyph — the label
            // is the whole control, and the spinner below is the one mark
            // either of them ever shows.
            onClick={row.hasOffered ? onWithdraw : onOffer}
            className="w-full gap-1.5"
          >
            {committing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            )}
            {row.hasOffered
              ? committing
                ? t("poolWithdrawPending")
                : t("poolWithdrawAction")
              : t("poolOfferAction")}
          </Button>
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
