"use client";

import Link from "next/link";
import {
  CalendarClock,
  CalendarOff,
  ChevronRight,
  Hourglass,
  MapPin,
  Radio,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatDateOnly, formatTime } from "@/lib/utils";
import type { SessionAudience } from "@/types";
import {
  enrollmentEndedOn,
  enrollmentLiveness,
  type FamilyEnrollmentSummary,
} from "./enrollment-rollup";
import { PaymentProblemBadge } from "./PaymentProblemBadge";
import { SubscriptionEndingBadge } from "./SubscriptionEndingBadge";

/**
 * One card per **enrollment** on the family dashboards — the parent's, under the
 * child's own heading, and the gamer's, under the type noun.
 *
 * It is the family-side sibling of the gedu dashboard's assignment card and
 * borrows that card's grammar wholesale, because the two answer the same shaped
 * question from opposite ends of the same session. The rows are the same rows in
 * every state — **identity, schedule, footer** — which is what lets two cards
 * differ in what they say without differing in what they *are*.
 *
 * - **The eyebrow is the type noun and the title is the product.** "Club" over
 *   "Minecraft Monday Club": the noun places it, the name identifies it. Both
 *   clubs collapse to one word, exactly as they do for a gedu — the split
 *   between a consumer club and a municipality one is a billing arrangement, and
 *   a family standing in the room has no reason to meet it.
 * - **No child's name anywhere on the card.** This is the single largest change
 *   from the session cards it replaces, and it is what the parent page's shape
 *   buys: every card already sits under a heading carrying that child's face and
 *   first name, so repeating "For Aino" on each of Aino's three cards was the
 *   page saying the same word four times down one column. On the gamer's own
 *   dashboard there was never anyone else it could belong to.
 * - **The footer answers "where is this happening", and always has an answer.**
 *   A remote product answers with the Join button (lit inside its window, locked
 *   and naming the next session outside it); an in-person one with its venue and
 *   a pin; a waitlisted one with the family's place in line and what happens
 *   when a seat opens; a finished one with the day it ended. Those are exclusive
 *   by construction, so the row is populated in every state rather than reserved
 *   and left standing empty in most of them.
 * - **The Live badge's slot is reserved; nothing else is.** It is the one thing
 *   here that appears on a *clock tick* rather than on something the reader did,
 *   so mounting it as a flex sibling would widen the corner cluster and reflow
 *   the product name beside it mid-read. Everything else on the card is settled
 *   before it first paints. The slot is dropped entirely on the two cards the
 *   badge can never land on — a finished run, and a waitlist place with no
 *   session to start — because holding space for something that cannot come is
 *   its own defect.
 *
 * **The corner is for problems, and only the parent's problems.** Across the
 * product the corner badge means "this needs attention" — the payment badge
 * here, the backlog badge on a gedu's card — so nothing that is merely a
 * *status* may wear it: the waitlist place lives in the footer sentence, where
 * it reads as information rather than a fault. A failing card outranks a
 * subscription winding down for the slot, and neither renders on the gamer's
 * own dashboard at all — billing is a parent concern, and a child's card must
 * not carry an alarm the child cannot act on. The badge is a *sibling* of the
 * Card, not a child — a card that clips its own overflow would otherwise cut it
 * in half.
 *
 * **The whole card is one link — except a waitlisted one, which is no link at
 * all.** A family in the queue has no access to the product's page yet, so the
 * card drops the stretched anchor, the chevron and the hover lift together:
 * nothing about it may promise "there is more inside" when there is not. On the
 * cards that do link, an invisible stretched anchor covers the card, the chevron
 * marks that there is more inside, and the Join button lifts itself above the
 * anchor so it keeps receiving its own clicks. No `<a>` inside `<a>`, so
 * middle-click and prefetch both behave.
 *
 * **A finished run is quiet history, not a fault.** Its identity and schedule
 * drop a tone, its gradient can never light, and the footer names the day it
 * ended — while the card keeps its hover, its focus ring and its link at full
 * strength, because the record behind it is the whole reason it is still here.
 */
export function EnrollmentCard({
  enrollment,
  audience,
  gamerFirstName,
}: {
  enrollment: FamilyEnrollmentSummary;
  /**
   * Whose dashboard this renders on. Both corner badges are parent-only —
   * billing is a parent concern, so a gamer's card never carries the payment
   * or subscription-ending badge — and the waitlist footer speaks to the
   * parent or to the child accordingly.
   */
  audience: SessionAudience;
  /**
   * The child this enrollment belongs to. **Never rendered on the card's face**
   * — the section heading owns the child — and used only inside the
   * subscription-ending badge's tooltip, which has to name whose last session it
   * is talking about. Omitted on the gamer's own dashboard, where that badge
   * never renders.
   */
  gamerFirstName?: string;
}) {
  const t = useTranslations("parent.enrollment");
  const w = useTranslations("parent.waitlist");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const {
    participationId,
    productName,
    productType,
    nextSessionStart,
    nextSessionEnd,
    hasVoiceRoom,
    voiceHref,
    siteName,
    openHref,
    waitlistPosition,
    paymentProblem,
    cancellation,
    scheduleLines,
  } = enrollment;

  const waitlisted = waitlistPosition !== null;
  const endedOn = enrollmentEndedOn(enrollment, now);
  const { inProgress, voiceIsOpen } = enrollmentLiveness(enrollment, now);
  const live = voiceIsOpen || inProgress;
  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  // The two cards a Live badge can never land on. Reserving its width there
  // would be a hole held open for something that is not coming.
  const canGoLive = endedOn === null && !waitlisted;

  return (
    // A plain `relative` shell so the corner badge can hang off the card's edge
    // without the card's own `overflow-hidden` cutting it in half.
    <div className="relative">
      <Card
        className={cn(
          "group relative overflow-hidden transition-[border-color,box-shadow]",
          !waitlisted &&
            "hover:border-primary/40 hover:shadow-lg focus-within:border-primary/40 focus-within:shadow-lg",
          live &&
            "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
        )}
      >
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p
                className={cn(
                  "text-xs font-medium uppercase tracking-wider text-muted-foreground",
                  endedOn !== null && "text-muted-foreground/70",
                )}
              >
                {t(`typeLabel.${productType}`)}
              </p>
              {/* The identity keeps its weight and loses its tone on a finished
                  run: a parent looking for last term's camp still has to read
                  the name, they just must not trip over it while looking for
                  this term's. */}
              <p
                className={cn(
                  "text-lg font-semibold leading-tight",
                  endedOn !== null && "text-muted-foreground",
                )}
              >
                {productName}
              </p>
            </div>

            {/* The top-right cluster: liveness, then the chevron. A flex sibling
                of the identity block rather than an absolute corner, so the
                badge can be as wide as its translation needs — "Live" is four
                characters in English and rather more elsewhere. `invisible` is
                `visibility: hidden`, so an unstarted session is out of the
                accessibility tree too. */}
            <div className="flex shrink-0 items-center gap-2">
              {canGoLive && (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 border-success/50 bg-success/10 px-2 py-0 text-[10px] uppercase tracking-wide text-success",
                    !live && "invisible",
                  )}
                >
                  <Radio className="h-3 w-3" aria-hidden />
                  {t("liveBadge")}
                </Badge>
              )}
              {!waitlisted && (
                <ChevronRight
                  aria-hidden
                  className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              )}
            </div>
          </div>

          {/* The product's schedule in words, from the same formatter the public
              product page and the gedu dashboard use, in the viewer's zone
              wherever it appears. It is not the next session restated: the next
              session is a fact about one imminent evening, and the affordance
              that acts on it already carries it — the locked Join reads "Opens
              Thu 12 Feb at 17:00", and once it starts the corner badge says so.
              The row is always here, and holds the "nothing scheduled yet" line
              for a product still being put together. */}
          <div
            className={cn(
              "flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground",
              endedOn !== null && "text-muted-foreground/70",
            )}
          >
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              {scheduleLines.length > 0 ? (
                scheduleLines.map((line) => (
                  <span key={line} className="block tabular-nums">
                    {line}
                  </span>
                ))
              ) : (
                <span className="block">{t("noSchedule")}</span>
              )}
            </span>
          </div>

          {/* Four flat conditions rather than a nested chain — they are mutually
              exclusive by construction, and a run that is over has neither a
              session left to join nor a venue anybody is travelling to, so the
              end date wins over all of them.

              No minimum height: these cards stack in one column on a phone, so
              there is no grid row to square off, and every branch below puts
              something real in the row. Holding a button's worth of height under
              a single line of venue text would be dead space on the majority of
              cards. */}
          <div className="relative z-10 flex items-center justify-center">
            {endedOn !== null && (
              // Date-only and UTC-pinned: an end date is a calendar date with no
              // clock face on it, so it must read the same everywhere rather
              // than tipping a day either side of a viewer's midnight.
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarOff className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {t("endedOn", { date: formatDateOnly(endedOn, locale) })}
                </span>
              </span>
            )}
            {endedOn === null && waitlisted && (
              // The place in line leads the sentence, in body text rather than
              // on the corner: the corner is this product's grammar for "this
              // needs attention", and a queue position is information, not a
              // fault. `tabular-nums` so the digits keep their width when
              // somebody ahead gives up their spot — the one number on this
              // page that can change while a parent is looking at it.
              <span className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 tabular-nums">
                  {w(
                    audience === "gamer"
                      ? "reassuranceGamer"
                      : "reassuranceCustomer",
                    { position: waitlistPosition },
                  )}
                </span>
              </span>
            )}
            {endedOn === null && !waitlisted && hasVoiceRoom && hasNext && (
              <JoinVoiceButton
                voiceIsOpen={voiceIsOpen}
                voiceHref={voiceHref}
                opensDate={formatDate(nextSessionStart, locale, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone,
                })}
                opensTime={formatTime(nextSessionStart, locale, timeZone)}
              />
            )}
            {endedOn === null &&
              !waitlisted &&
              !hasVoiceRoom &&
              siteName !== null && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{siteName}</span>
                </span>
              )}
          </div>
        </CardContent>

        {/* The whole card, as one link — an empty anchor stretched over it, named
            by the product it opens. The ring is inset because the card clips its
            own overflow, so keyboard focus lights the card's edge rather than
            being shaved off it. Sits below the Join, which lifts itself with
            `z-10` to keep receiving its own clicks. A waitlisted card renders no
            anchor at all — there is no page behind it yet. */}
        {!waitlisted && (
          <Link
            href={openHref}
            onClick={(e) => {
              if (openHref === "#") e.preventDefault();
            }}
            aria-label={productName}
            className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        )}
      </Card>

      {/* Outside the card, over its corner, so neither ever eats a click meant
          for the card body. Parent-only, one at a time, most actionable first. */}
      {audience === "customer" && paymentProblem ? (
        <PaymentProblemBadge
          participationId={participationId}
          audience={audience}
          showAlert
        />
      ) : audience === "customer" && cancellation ? (
        <SubscriptionEndingBadge
          accessUntil={cancellation.accessUntil}
          lastSessionStart={cancellation.lastSessionStart}
          isLastSession={cancellation.isLastSession}
          gamerFirstName={gamerFirstName ?? productName}
        />
      ) : null}
    </div>
  );
}
