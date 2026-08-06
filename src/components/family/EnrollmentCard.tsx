"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  ChevronRight,
  Hourglass,
  MapPin,
  Radio,
  RefreshCwOff,
  UserRoundSearch,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatDateOnly, formatTime } from "@/lib/utils";
import { PaymentProblemBadge } from "@/components/parent/PaymentProblemBadge";
import {
  enrollmentEndedOn,
  enrollmentLiveness,
  type FamilyEnrollmentSummary,
} from "./enrollment-rollup";

/**
 * One card per **enrollment** on the family dashboards — the parent's, under the
 * child's own heading, and the gamer's, under the type noun.
 *
 * It lives with the family components rather than the parent's because both
 * dashboards render it: a card the child's page draws is not a parent component
 * that the child's page borrows. Its copy sits in role-neutral namespaces for
 * the same reason, and then one step further — the type noun, the "ended" date,
 * the "no schedule" line and the Live badge are the *same* keys the gedu's
 * assignment card reads, because they are the same concepts and a duplicate is
 * a drift waiting to happen.
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
 *   and what happens when a seat opens; an unplaced one with the fact that a
 *   Gedu is being matched; a finished one with the day it ended.
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
 *   can never land on — a finished run, a waitlist place, an unplaced seat, and
 *   anything with no session to start — because holding space for something
 *   that cannot come is its own defect.
 *
 * **Three states, one grammar: a seat, a queue place, and a seat with nowhere
 * to sit yet.** The third is the purchased-but-unplaced enrollment
 * (`group_id IS NULL`), the day or so between a payment landing and an admin
 * matching the child with a Gedu. It is a first-class state rather than a
 * variation on running, because *nothing* behind it exists yet: no group means
 * no room, no feed and no page, so it carries no Join of any kind, no link and
 * no chevron — the same inertness a waitlist place has, arrived at for the same
 * reason. This is what closes the old bug where an unplaced enrollment drew a
 * Join that looked joinable and did nothing. What it does not share with a
 * waitlist place is its tone: it wears `info` rather than muted quiet, because
 * the seat *is* theirs and the schedule on the card is one they will be
 * attending. Nothing is pending on the family's side, which is exactly what the
 * footer sentence says.
 *
 * **The corner means exactly one thing: an alarm the parent can act on.**
 * Across the product the corner badge means "this needs attention" — the
 * payment badge here, the backlog badge on a gedu's card — so nothing that is
 * merely *information* may wear it. The waitlist place lives in the footer
 * sentence, and the parent's own cancellation lives as a quiet won't-renew
 * line under the schedule: a cancellation is confirmation that their action
 * was fulfilled, not a problem to fix, and dressing it as an alarm would make
 * the corner mean two things. Neither billing signal renders on the gamer's
 * own dashboard at all — billing is a parent concern, and a child's card must
 * not carry an alarm the child cannot act on. The badge is a *sibling* of the
 * Card, not a child — a card that clips its own overflow would otherwise cut it
 * in half.
 *
 * **The whole card is one link — except the two states with nothing behind
 * them, which are no link at all.** A family in the queue and a family whose
 * seat has not been placed both reach no product page, so those cards drop the
 * stretched anchor, the chevron and the hover lift together: nothing about a
 * card may promise "there is more inside" when there is not. On the cards that
 * do link, an invisible stretched anchor covers the card, the chevron marks
 * that there is more inside, and the Join button — and *only* the Join button —
 * lifts itself above the anchor so it keeps receiving its own clicks. No `<a>`
 * inside `<a>`, so middle-click and prefetch both behave.
 *
 * **Leaving a waitlist is the queue card's counterpart of the Join.** A quiet
 * muted text link under the footer sentence, parent-only, opening a confirm
 * dialog — the single interactive thing on an otherwise inert card, exactly as
 * the Join is the single interactive thing on a live one. Not a corner badge:
 * the corner means an alarm, and there is nothing wrong with a place in line.
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
}

/**
 * The half of the card only a **parent's** dashboard may hand it.
 *
 * Split out as its own union member rather than left optional on one flat
 * interface, so "the gamer body never receives parent-only props" is something
 * the compiler enforces instead of something a reviewer has to notice. Every
 * one of these is an adult's concern — money, a queue place worth money, and a
 * join that has to pass through an account switch — and a child's card must not
 * carry an action the child cannot or should not take.
 */
interface EnrollmentCardParentProps {
  audience: "customer";
  /**
   * The child this enrollment belongs to.
   *
   * **Never rendered on the card face** — the card deliberately carries no
   * child's name, because it always sits under a heading that already does.
   * It exists for the leave-waitlist dialog, which is an overlay above the
   * whole page and therefore has no heading of its own to borrow: "Aino will
   * lose their place in line" has to name her, or the parent of three children
   * is being asked to confirm something irreversible about an unnamed one.
   */
  gamerFirstName: string;
  /**
   * Open Stripe's Customer Portal instead of the badge doing it itself. The
   * live parent dashboard passes nothing and gets the real portal session; a
   * preview scene passes a no-op, which is what keeps a fixture page from
   * POSTing.
   */
  onOpenPortal?: () => void;
  /**
   * Intercept the Join instead of letting it navigate.
   *
   * The parent is signed in as themselves and the voice room is gated on the
   * *gamer's* enrollment, so a direct navigation would always be refused. The
   * shell opens the switch-profile dialog, which POSTs the account switch and
   * then does a full-page navigation to the room — the house auth rule, since
   * cookies a server route changed never reach the browser client's singleton.
   *
   * Optional so the prop can exist before the shell that fills it: with nothing
   * passed the button falls back to being a plain link, which is exactly what
   * the gamer's own card does.
   */
  onJoinClick?: () => void;
  /**
   * Give up this place in line. Fires only after the parent confirms in the
   * dialog the card opens; the card owns the dialog, the shell owns the
   * mutation. Absent means the affordance is not drawn at all, which is what a
   * surface with no mutation behind it (a preview scene passes a no-op instead)
   * would otherwise have to fake.
   */
  onLeaveWaitlist?: () => void;
  /**
   * That leave is in flight. Dims the card and locks the link, and is held by
   * the *shell* across the row's disappearance rather than derived from a
   * mutation's pending flag — which flips false before the invalidation, let
   * alone the refetch, and would re-enable the link under the parent's cursor.
   */
  leavingWaitlist?: boolean;
}

/**
 * The child's own card: the enrollment, and nothing else. Everything the parent
 * variant adds is deliberately unavailable here rather than merely unused.
 */
interface EnrollmentCardGamerProps {
  audience: "gamer";
}

/**
 * Whose dashboard this renders on. Billing never reaches the child's card —
 * the payment corner badge and the won't-renew line are parent-only — and the
 * waitlist footer speaks *to* the child on their own page, *about* them on the
 * parent's.
 */
export type EnrollmentCardProps = EnrollmentCardCommonProps &
  (EnrollmentCardParentProps | EnrollmentCardGamerProps);

export function EnrollmentCard(props: EnrollmentCardProps) {
  const { enrollment } = props;
  // Narrowed once, so every parent-only branch below reads as one question
  // ("is there a parent behind this card?") rather than repeating the audience
  // check beside each of the four props it guards.
  const parent = props.audience === "customer" ? props : null;
  const audience = props.audience;
  const p = useTranslations("productType");
  const c = useTranslations("activityCard");
  const b = useTranslations("sessionBadge");
  const f = useTranslations("familyEnrollment");
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
    awaiting,
    paymentProblem,
    cancellation,
    scheduleLines,
  } = enrollment;

  const waitlisted = waitlistPosition !== null;
  const endedOn = enrollmentEndedOn(enrollment, now);
  const { inProgress, voiceIsOpen } = enrollmentLiveness(enrollment, now);
  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  /**
   * Holding a seat **in a group**, with the run still going.
   *
   * Awaiting placement is excluded alongside a waitlist place, and for the same
   * reason rather than a similar one: with no group there is no room, no feed
   * and no page, so every affordance `running` gates — the Join, the Live
   * badge, the venue line — would be describing something that does not exist
   * yet. The difference between the two is what the footer *says*, not what the
   * card is allowed to do.
   */
  const running = endedOn === null && !waitlisted && !awaiting;
  /**
   * Whether there is a page behind this card. Two states have none — a queue
   * position and an unplaced seat — and both drop the anchor, the chevron and
   * the hover lift together: nothing about the card may promise "there is more
   * inside" when there is not.
   */
  const opensAPage = !waitlisted && !awaiting;
  // Derived per tick from the shared clock, then gated on the seat: an unplaced
  // enrollment's product may well be mid-session, but not for this family, and
  // a lit card would be inviting a child into a room that has not been created.
  const live = running && (voiceIsOpen || inProgress);
  // The cards a Live badge can never land on. Reserving its width there would
  // be a hole held open for something that is not coming — which includes a
  // running enrollment with nothing on its schedule, since a badge that turns
  // on when a session starts needs a session to start.
  const canGoLive = running && hasNext;
  const leaving = parent?.leavingWaitlist ?? false;
  /** The one interactive element a waitlisted card has, and parents only. */
  const onLeaveWaitlist = waitlisted ? parent?.onLeaveWaitlist : undefined;
  // Whether the footer has anything to say, asked before it is drawn. The five
  // branches below are exclusive by construction, and on the one card where
  // none of them lands — a running enrollment whose product has no slots yet —
  // the row is left out rather than rendered empty.
  const hasFooter =
    endedOn !== null ||
    waitlisted ||
    awaiting ||
    (running && hasVoiceRoom && hasNext) ||
    (running && !hasVoiceRoom && siteName !== null);

  return (
    // A plain `relative` shell so the corner badge can hang off the card's edge
    // without the card's own `overflow-hidden` cutting it in half.
    <div className="relative">
      <Card
        aria-busy={leaving}
        className={cn(
          "group relative overflow-hidden transition-[border-color,box-shadow,opacity]",
          opensAPage &&
            "hover:border-primary/40 hover:shadow-lg focus-within:border-primary/40 focus-within:shadow-lg",
          live &&
            "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
          // The awaiting tone: the same lit-card treatment in `info` rather than
          // `primary`, because this *is* a card with something happening on it
          // — a purchase has landed and placement is under way — and it must
          // read as that rather than as a fault or as a waitlist place. Blue is
          // already this product's colour for "we are telling you something",
          // and the two gradients are mutually exclusive by `running`.
          awaiting &&
            "border-info/40 bg-gradient-to-r from-info/5 to-transparent",
          // Dimmed in place while the leave is in flight, so the card that is
          // about to disappear says so without moving. Matches the treatment
          // the badge-era waitlist card used, for continuity.
          leaving && "opacity-50",
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
                {p(productType)}
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
                  {b("live")}
                </Badge>
              )}
              {opensAPage && (
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
                <span className="block">{c("noSchedule")}</span>
              )}
            </span>
          </div>

          {/* The parent's own cancellation, as information rather than an
              alarm: the corner means "this needs your attention", and a
              membership the parent themselves wound down is confirmation, not
              a problem — so it reads as a quiet line under the schedule, the
              same demotion the waitlist position made for the same reason. The
              date is the last session, never the billing period end — a parent
              tracks sessions, not billing instants. The line exists only on a
              cancelled card ("populated, not padded"), so cards differ in
              height by state; it cannot appear mid-read except as the direct
              echo of the parent cancelling in the portal they just came from.

              **The final covered session is named as final.** Once the walk has
              nothing left behind it, "last session 18 Mar" and the Join button
              beside it are describing the same evening, and a parent reading
              the first would have no way to tell that the second is their
              child's last one. The line says so outright instead — the same
              distinction the corner badge of the old design drew by swapping
              its whole label. */}
          {parent !== null && cancellation !== null && running && (
            <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
              <RefreshCwOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                {f(
                  cancellation.isLastSession
                    ? "wontRenewLastSession"
                    : "wontRenew",
                  {
                    date: formatDate(cancellation.lastSessionStart, locale, {
                      month: "short",
                      day: "numeric",
                      timeZone,
                    }),
                  },
                )}
              </span>
            </p>
          )}

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
            <div className="flex flex-col items-center gap-2">
              <div className="flex w-full items-center justify-center">
                {endedOn !== null && (
                  // Date-only and UTC-pinned: an end date is a calendar date with no
                  // clock face on it, so it must read the same everywhere rather
                  // than tipping a day either side of a viewer's midnight.
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarOff className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">
                      {c("endedOn", { date: formatDateOnly(endedOn, locale) })}
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
                {endedOn === null && awaiting && (
                  // The seat is bought; nobody has been placed yet. This wins
                  // over the venue line an in-person product would otherwise get,
                  // because the footer's question is "where is this happening"
                  // and the honest answer here is "nowhere yet" — a building
                  // named beside a group that does not exist would read as an
                  // invitation to turn up. Static, with no spinner or pulse:
                  // placement is a person's decision that can take a day, and a
                  // loading cue would promise seconds.
                  <span className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                    <UserRoundSearch
                      className="mt-0.5 h-4 w-4 shrink-0 text-info"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      {f(
                        audience === "gamer"
                          ? "awaitingGamer"
                          : "awaitingCustomer",
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
                      // Present only on a parent's card, where joining means
                      // switching account first; passing nothing (a child's own
                      // card) leaves the button the plain link it has always
                      // been.
                      onJoinClick={parent?.onJoinClick}
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

              {/* Under the sentence it acts on, not over the corner.
                  `LeaveWaitlistBadge` put this in the corner, where the product's
                  grammar reserves the space for an alarm the parent must act on
                  — and a queue place is not one. Down here it is the exact
                  counterpart of the Join on a live card: the single interactive
                  thing on an otherwise inert card, sitting in the same zone,
                  reading as an offer rather than a warning. No `z-10` needed,
                  because the card it appears on renders no stretched anchor for
                  it to sit above. */}
              {onLeaveWaitlist !== undefined && parent !== null && (
                <LeaveWaitlistLink
                  productName={productName}
                  gamerFirstName={parent.gamerFirstName}
                  leaving={leaving}
                  onConfirm={onLeaveWaitlist}
                />
              )}
            </div>
          )}
        </CardContent>

        {/* The whole card, as one link — an empty anchor stretched over it, named
            by the product it opens. The ring is inset because the card clips its
            own overflow, so keyboard focus lights the card's edge rather than
            being shaved off it. Sits below the Join, which lifts itself with
            `z-10` to keep receiving its own clicks. A waitlisted card and an
            unplaced one render no anchor at all — neither has a page behind it
            yet. */}
        {opensAPage && (
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

      {/* Outside the card, over its corner, so it never eats a click meant for
          the card body. The corner carries exactly one thing: an alarm the
          parent can act on. Information — the waitlist position, the
          won't-renew line — lives in the card body instead. */}
      {parent !== null && paymentProblem && (
        <PaymentProblemBadge
          participationId={participationId}
          audience="customer"
          showAlert
          onOpenPortal={parent.onOpenPortal}
        />
      )}
    </div>
  );
}

/**
 * "Leave waitlist", as a quiet text link under the queue sentence, plus the
 * confirm dialog it opens.
 *
 * **Muted, never destructive, until the dialog.** Nothing is wrong with a place
 * in line, so the affordance that opens the decision stays as quiet as the
 * sentence above it; the red belongs on the confirm button, where the
 * irreversible choice is actually made. The dialog carries the one thing a
 * parent will not think of on their own — rejoining puts them at the back — as
 * the same destructive callout the admin group panel uses.
 *
 * Private to the card because the card is the only thing that can draw it: the
 * copy names both the product and the child, and the placement is defined
 * relative to a footer sentence that exists nowhere else.
 */
function LeaveWaitlistLink({
  productName,
  gamerFirstName,
  leaving,
  onConfirm,
}: {
  productName: string;
  gamerFirstName: string;
  /** The leave is in flight — locks the link; the card carries the dimming. */
  leaving: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("parent.waitlist.leave");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={leaving}
        className="rounded text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-muted-foreground"
      >
        {t("trigger")}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={t("confirmDescription", {
          name: gamerFirstName,
          product: productName,
        })}
        confirmLabel={t("confirmCta")}
        onConfirm={onConfirm}
      >
        <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t("backOfLineWarning")}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}
