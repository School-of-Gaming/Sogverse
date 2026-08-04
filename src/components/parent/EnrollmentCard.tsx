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
 * - **The footer answers "where is this happening" — and is absent when there is
 *   no answer.** A remote product answers with the Join button (lit inside its
 *   window, locked and naming the next session outside it); an in-person one
 *   with its venue and a pin; a waitlisted one with the family's place in line
 *   and what happens when a seat opens; a finished one with the day it ended.
 *   Those are exclusive by construction, so the row is populated rather than
 *   reserved — and on the one card where every branch comes up empty (a running
 *   enrollment whose product has no schedule slots yet, so there is no session
 *   for a Join to name and no venue to name instead) the row is not drawn at
 *   all. The schedule row above it has already said "No schedule set yet", which
 *   is the whole of what that card knows; an empty flex row underneath would add
 *   a band of nothing to say it a second time.
 * - **The Live badge's slot is reserved; nothing else is.** It is the one thing
 *   here that appears on a *clock tick* rather than on something the reader did,
 *   so mounting it as a flex sibling would widen the corner cluster and reflow
 *   the product name beside it mid-read. Everything else on the card is settled
 *   before it first paints. The slot is dropped entirely on the cards the badge
 *   can never land on — a finished run, a waitlist place, and anything with no
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
 * marks that there is more inside, and the Join button — and *only* the Join
 * button — lifts itself above the anchor so it keeps receiving its own clicks.
 * No `<a>` inside `<a>`, so middle-click and prefetch both behave.
 *
 * **The footer is part of the card.** Lifting the whole footer row rather than
 * the button was the easy version of that and quietly cost a click target: the
 * venue name, the ended-on date and the waitlist sentence rode up with it, so
 * the bottom strip of every card without a Join swallowed clicks and did
 * nothing. Only the button is interactive, so only the button sits above the
 * anchor.
 *
 * **A finished run is quiet history, not a fault.** Its identity and schedule
 * drop a tone, its gradient can never light, and the footer names the day it
 * ended — while the card keeps its hover, its focus ring and its link at full
 * strength, because the record behind it is the whole reason it is still here.
 */
interface EnrollmentCardCommonProps {
  enrollment: FamilyEnrollmentSummary;
  /**
   * Open Stripe's Customer Portal instead of the badge doing it itself. The
   * live parent dashboard passes nothing and gets the real portal session; a
   * preview scene passes a no-op, which is what keeps a fixture page from
   * POSTing. Parent-only by construction — a gamer's card carries no badge to
   * click.
   */
  onOpenPortal?: () => void;
}

/**
 * Who the card is for, and what that audience obliges the caller to know.
 *
 * The two audiences are not the same props with one of them optional: the
 * parent's card can carry a subscription-ending badge, and that badge's tooltip
 * has to name **whose** last session it is talking about, so a customer card
 * without a child's name is not a card with a missing nicety — it is a card that
 * cannot be rendered. The gamer's card can never show that badge at all, so the
 * name has nowhere to go and the prop does not exist there. Discriminating on
 * `audience` is what lets the compiler say so, and what removes the fallback
 * that used to put a *product* name in a person's slot when the caller forgot.
 */
export type EnrollmentCardProps = EnrollmentCardCommonProps &
  (
    | {
        /**
         * The child's own dashboard. No billing anywhere on it — neither corner
         * badge renders — and the waitlist footer speaks *to* the child.
         */
        audience: Extract<SessionAudience, "gamer">;
      }
    | {
        /**
         * The parent's dashboard: corner badges live here, and the waitlist
         * footer speaks *about* the child.
         */
        audience: Extract<SessionAudience, "customer">;
        /**
         * The child this enrollment belongs to. **Never rendered on the card's
         * face** — the section heading owns the child — and used only inside the
         * subscription-ending badge's tooltip, which has to name whose last
         * session it is.
         */
        gamerFirstName: string;
      }
  );

export function EnrollmentCard(props: EnrollmentCardProps) {
  const { enrollment, audience, onOpenPortal } = props;
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
  /** Holding a seat, with the run still going: neither over nor in the queue. */
  const running = endedOn === null && !waitlisted;
  // The cards a Live badge can never land on. Reserving its width there would
  // be a hole held open for something that is not coming — which includes a
  // running enrollment with nothing on its schedule, since a badge that turns
  // on when a session starts needs a session to start.
  const canGoLive = running && hasNext;
  // Whether the footer has anything to say, asked before it is drawn. The four
  // branches below are exclusive by construction, and on the one card where
  // none of them lands — a running enrollment whose product has no slots yet —
  // the row is left out rather than rendered empty.
  const hasFooter =
    endedOn !== null ||
    waitlisted ||
    (running && hasVoiceRoom && hasNext) ||
    (running && !hasVoiceRoom && siteName !== null);

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
              cards — and where no branch lands at all, the row itself does not
              render.

              **Nothing here is lifted above the card's stretched link except the
              Join itself.** The lift used to sit on the row, which also lifted
              the venue name, the ended-on date and the waitlist sentence — none
              of them a control — and turned the bottom strip of most cards into
              a dead zone. The button is the only thing in the row with a click
              of its own to receive, so it is the only thing that takes the
              `z-10`. */}
          {hasFooter && (
            <div className="flex items-center justify-center">
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
                        ? "footerReassuranceGamer"
                        : "footerReassuranceCustomer",
                      { position: waitlistPosition },
                    )}
                  </span>
                </span>
              )}
              {running && hasVoiceRoom && hasNext && (
                // The one thing in the footer that owns its clicks, so the one
                // thing lifted above the stretched link covering the card.
                <span className="relative z-10">
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
                </span>
              )}
              {running && !hasVoiceRoom && siteName !== null && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{siteName}</span>
                </span>
              )}
            </div>
          )}
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
      {props.audience === "customer" && paymentProblem ? (
        <PaymentProblemBadge
          participationId={participationId}
          audience="customer"
          showAlert
          onOpenPortal={onOpenPortal}
        />
      ) : props.audience === "customer" && cancellation ? (
        <SubscriptionEndingBadge
          accessUntil={cancellation.accessUntil}
          lastSessionStart={cancellation.lastSessionStart}
          isLastSession={cancellation.isLastSession}
          gamerFirstName={props.gamerFirstName}
        />
      ) : null}
    </div>
  );
}
