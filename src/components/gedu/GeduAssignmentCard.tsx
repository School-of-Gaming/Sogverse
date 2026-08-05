"use client";

import Link from "next/link";
import {
  CalendarClock,
  CalendarOff,
  ChevronRight,
  MapPin,
  Radio,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SessionFeedAlertBadge } from "@/components/gedu/session-feed";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatDateOnly, formatTime } from "@/lib/utils";
import { runEndedOn, runLiveness } from "@/lib/product-run";
import type { GeduAssignmentSummary } from "@/lib/gedu-assignment-rollup";

interface GeduAssignmentCardProps {
  assignment: GeduAssignmentSummary;
  /**
   * Ready-made schedule lines for this product — the recurring cadence for a
   * club, the date range plus running days for a camp. Built by the caller with
   * the shared product-schedule formatter, because that formatter needs the
   * whole product row and this card only carries the roll-up.
   */
  scheduleLines: readonly string[];
}

/**
 * One card per **assignment** (a product × the gedu's group in it) on the gedu
 * dashboard.
 *
 * This is a roll-up, not a session. The dashboard used to list every upcoming
 * occurrence, which meant eight nearly identical rows for one weekly club; now
 * that the product page's feed owns per-session detail, the dashboard answers a
 * shorter question — which activities do I run, when does each one run, and
 * where am I behind. So the card carries the product's identity, the group's
 * identity as a secondary line, the product's schedule in words rather than as a
 * list of dates, and the outstanding-write-up badge.
 *
 * **Every card is the same height, and every zone holds something real.** A
 * dashboard is read as a grid, and a grid whose cells are different heights
 * because one club happens to owe a write-up and another happens to be live is a
 * grid that reshuffles itself every time a session starts or a register is
 * finished. The first answer to that was to reserve the variable zones and let
 * them stand empty — which bought the uniformity at the cost of two bands of
 * nothing on most cards, and made the common state look like the broken one. So
 * the zones are uniform because they are *populated*, not because they are
 * padded:
 *
 * The rows are the same rows in every state — identity, schedule, footer — which
 * is what makes two cards the same height without either of them holding a gap.
 * A grid row stretches, so an odd one out is invisible until it is the card
 * alone on the last row with nothing to stretch against; that is where a
 * difference of a couple of lines stops reading as a shorter card and starts
 * reading as a broken one.
 *
 * - **The footer holds the Join on a remote product and the venue on an
 *   in-person one.** Those are the same question — where is this happening —
 *   answered the two ways a product can answer it, and they are exclusive by
 *   construction, so an assignment with a session ahead of it always has exactly
 *   one of them. The venue is text with a pin, deliberately not a link: there is
 *   nothing to open, and a card whose bottom row is sometimes a button and
 *   sometimes a link would teach a click that only works half the time. **A run
 *   that is over answers a third way**: the day it ended. Both of the usual
 *   answers have stopped being true — there is no session left to join, and the
 *   building a finished camp used to meet in is no longer the card's headline
 *   fact — while "when did this stop" becomes the one thing worth knowing about
 *   it. **One state still genuinely leaves the footer empty**, and it is the
 *   honest answer rather than an oversight: a remote assignment whose schedule
 *   has run out with no end date to report has no session to join, no building
 *   to name and no day to point at. Padding that card with a placeholder would
 *   be inventing a fact to fill a box. **The row keeps the Join's own height in
 *   every one of those states**, which is the one piece of geometry here that is
 *   reserved rather than filled — and it has to be, because the alternatives are
 *   a button and a line of text, and nothing can make a line of text as tall as
 *   a button. Left to its content, the card whose answer is text stood a
 *   button's worth shorter than the card beside it.
 * - **The attention badge overlays the card's top-right corner**, following the
 *   pattern the family session cards already use for a payment problem. It rode
 *   the end of the cadence line for a while, which read fine on one card and
 *   badly across a grid: a gedu opening this page is not reading cards, they
 *   are sweeping for the one that owes them something, and a pill buried in a
 *   row of small grey type is not findable in a sweep. On the corner it is,
 *   from across a screen of six. **It is a link to the same place the card
 *   opens**, because it sits above the card's stretched anchor rather than
 *   inside it: a mark that swallowed the click on the exact spot the sweep
 *   sends a gedu to tap was a dead zone in the one place that could least
 *   afford one.
 * - **Liveness is the gradient and a badge in the top-right cluster**, next to
 *   the chevron. It replaced a "session in progress" line in the middle of the
 *   card, which was a whole row spent restating what the card's own colour
 *   already said, and which only ever existed on one card at a time. The badge's
 *   **slot is reserved on every card that could ever wear it**, and the badge is
 *   merely hidden inside it until the session starts: it is the one thing on this
 *   card that appears on a *clock tick* rather than on something the reader did,
 *   so mounting it as a flex sibling would have widened the corner cluster — and
 *   reflowed the product name beside it, and possibly the row's height — while
 *   somebody was reading. The cards it can never land on — a finished run, and
 *   an assignment with no session scheduled at all — drop the slot outright,
 *   because space held for something that is not coming is its own defect.
 *
 * **Live is asked once, of one clock.** Whether the session has started and
 * whether its room is open are two answers to the same question and are derived
 * together from the same `now`. They used to come from two places — the window
 * flag baked into the roll-up when it last ran, the in-progress test recomputed
 * on every tick — so the tick that crossed a session's start lit the card up
 * while its Join stayed locked.
 *
 * The **Live badge is green**, and deliberately not the tone of the gradient
 * behind it. The gradient is a wash — it says "this card is different" before a
 * word is read; the badge is the word. Green is the universal on-air signal and
 * is the one semantic family free on this surface: amber is the attention badge
 * on the corner beside it and must not be echoed, blue is "next up" in the session
 * feed and would be a lie about something already running, and the brand tone is
 * already spent on the wash itself.
 *
 * **Clickability comes from the card, not from a label.** There used to be an
 * "Open sessions" link in the bottom corner, which was a word doing a job that a
 * chevron, a pointer cursor and a hover state do better and in less space — and
 * which read as *the* target, when the whole card has always been one. Now the
 * chevron sits in the top-right cluster where a "there is more inside this"
 * marker belongs, the border brightens and the card lifts on hover or keyboard
 * focus, and the invisible stretched link over the whole card is what is
 * actually being clicked.
 *
 * **The product's name is the card's title and the group's is the line under
 * it.** A gedu holds at most one group per product, so the pair identifies one
 * thing — and "Group A" identifies it to nobody, while "Minecraft Monday Club"
 * identifies it immediately.
 *
 * **The card states the schedule; the Join states the next session.** They are
 * two different questions and each is answered once. A gedu sweeping this page
 * is placing an activity in their week — "Mondays 16:30–18:00" is what does
 * that, and it is the same sentence the product's public page and the admin's
 * details page show, from the same formatter. The next session is a fact about
 * one imminent evening, and the affordance that acts on it already carries it:
 * the locked Join reads "Opens Thu 12 Feb at 17:00", and once the session starts
 * the corner badge says so. The card used to print that date and time in its own
 * row as well, directly above a button repeating it.
 *
 * Nothing here is relative. A countdown ("starts in 2 days, 5 hours") reads as
 * more precise than a date while being harder to act on: a gedu is deciding what
 * to do on a *day*, and days are what a calendar, a colleague and a parent all
 * speak in. A schedule is more stable still — it says the same thing whenever
 * you look at it, and never has to tick.
 *
 * The Join affordance lives here for a remote product, because this is the only
 * place a gedu meets their next session before opening it. Card and button are
 * both real anchors: the invisible stretched link covers the whole card, and the
 * Join button — and *only* the Join button — is lifted above it with `relative
 * z-10` so it receives its own clicks. No `<a>` inside `<a>`, so middle-click
 * and prefetch both behave.
 *
 * **The footer is part of the card.** Lifting the whole footer row rather than
 * the button was the easy version of that and quietly cost a click target: the
 * venue name and the ended-on date rode up with it, so the bottom strip of every
 * card without a Join swallowed clicks and did nothing. Nothing in the footer
 * but the button is interactive, so nothing else may sit above the link.
 *
 * **A finished run is quiet history, not a scheduling fault.** Once a product's
 * last day is behind it there is always no next session, which read as the
 * anomaly state — "No session scheduled", in the slot where every other card
 * named a date — when in fact it is the ordinary and permanent end of a
 * perfectly normal run. Two things change on such a card, and both are
 * subtractions:
 *
 * - **The type label, name, group and schedule all drop a tone.** A gedu sweeping
 *   this page is looking for what is still running, and the finished runs have
 *   to fall back out of that sweep without falling out of the page. They keep
 *   their chevron, their hover lift and their focus ring at full strength,
 *   because the workspace behind them is exactly where the historic records
 *   live and it is the whole reason the card is still here.
 * - **The gradient never lights.** It follows liveness, and liveness is false by
 *   construction on a run with no session left, so this is not a special case so
 *   much as a consequence — but it is the difference a reader actually sees.
 *
 * **The attention badge is the one thing that does not fade.** A register or a
 * write-up owed on a finished club is still owed — a parent reads last term's
 * report as readily as last week's — the epoch rules already exempt the history
 * nobody is expected to backfill, and the badge is how a gedu finds what is
 * left. Muting it would hide the only reason to hurry to an ended card.
 */
export function GeduAssignmentCard({
  assignment,
  scheduleLines,
}: GeduAssignmentCardProps) {
  const t = useTranslations("gedu.myGroups");
  const d = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const {
    productName,
    productType,
    groupName,
    groupGamerCount,
    nextSessionStart,
    nextSessionEnd,
    hasVoiceRoom,
    voiceHref,
    openHref,
    attentionCount,
    siteName,
  } = assignment;

  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  // The day the run finished, or `null` while it is still going. Non-null *is*
  // the ended state — one value, so the footer never has to assert its way past
  // a date it has already tested.
  const endedOn = runEndedOn(assignment, now);
  // The cards a Live badge can never land on. Reserving its width there would
  // be a hole held open for something that is not coming — which is a finished
  // run and, for the same reason, an assignment with nothing on its schedule:
  // a badge that turns on when a session starts needs a session to start.
  const canGoLive = endedOn === null && hasNext;
  const { inProgress, voiceIsOpen } = runLiveness(assignment, now);
  // Lit when something is actually happening — a room the gedu can walk into,
  // or a session already running. An in-person product has no room and still
  // deserves the treatment while its session is on.
  const live = voiceIsOpen || inProgress;

  return (
    // A plain `relative` shell so the corner badge can hang off the card's edge
    // without the card's own `overflow-hidden` cutting it in half. The badge is
    // the card's *sibling*, not its child — the same shape the family session
    // cards use, and the only one that survives a clipped, rounded card.
    <div className="relative h-full">
      <Card
        className={cn(
          // `group` for the chevron's nudge, `h-full` so a grid row of cards
          // stretches every one of them to the tallest rather than leaving the
          // short ones floating.
          "group relative h-full cursor-pointer overflow-hidden transition-[border-color,box-shadow,transform]",
          "hover:border-primary/40 hover:shadow-lg focus-within:border-primary/40 focus-within:shadow-lg",
          live &&
            "border-primary/40 bg-gradient-to-r from-primary/5 to-transparent",
        )}
      >
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p
                className={cn(
                  "text-xs font-medium uppercase tracking-wider text-muted-foreground",
                  endedOn !== null && "text-muted-foreground/70",
                )}
              >
                {d(`typeLabel.${productType}`)}
              </p>
              {/* The identity keeps its weight and loses its tone on a finished
                  run: a gedu looking for last term's club still has to read the
                  name, they just must not trip over it while looking for this
                  term's. */}
              <p
                className={cn(
                  "text-lg font-semibold leading-tight",
                  endedOn !== null && "text-muted-foreground",
                )}
              >
                {productName}
              </p>
              {/* The group as one quiet line, not a name plus a bordered pill:
                  the pill gave the gamer count the visual weight of a status
                  badge sitting next to real ones, and a roster size is not a
                  status. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span
                  className={cn(
                    "font-medium",
                    endedOn === null && "text-foreground",
                  )}
                >
                  {groupName ?? d("untitledGroup")}
                </span>
                {/* The separator is a pseudo-element, not a text node: it is
                    punctuation between two translated strings rather than copy of
                    its own, so it has no business in the message files. */}
                <span className="inline-flex items-center gap-1 tabular-nums before:mr-1 before:text-muted-foreground/50 before:content-['·']">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {d("gamerCount", { count: groupGamerCount })}
                </span>
              </p>
            </div>

            {/* The top-right cluster: the live state, then the chevron. It is a
                flex sibling of the identity block rather than an absolutely
                positioned corner, so the badge can be as wide as its translation
                needs without a hand-tuned right padding for the identity block to
                clear — "Live" is four characters in English and rather more in
                Finnish. `shrink-0` keeps the long product name from squeezing it.
                Neither element is interactive; the stretched link over the whole
                card paints above both and receives the click.

                The badge is always in the layout and only `invisible` until the
                session starts: it is the one thing here that turns up on a clock
                tick rather than on a click, and a badge mounting into a flex row
                widens the cluster — which squeezes the product name beside it and,
                through `items-stretch`, can move the row itself. `invisible` is
                also `visibility: hidden`, so it leaves the accessibility tree
                too and nothing announces a session that has not begun.

                The cards the badge can never land on do not reserve it: a
                finished run, and an assignment with no session on its schedule
                at all. Holding the slot open there would be a gap waiting on
                something that is not coming, and the width is better spent on
                the product name — which is what a gedu is reading such a card
                for. Nothing moves as a result: both facts are settled before the
                card first paints and neither turns over under a reader the way a
                session start does. */}
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
              <ChevronRight
                aria-hidden
                className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </div>
          </div>

          {/* The product's schedule, in words — the cadence for a club, the date
              range and running days for a camp, the day and time for an event.
              It is the same formatter the public browse cards and the "When &
              where" rows use, so a product's schedule reads identically wherever
              it appears, in the viewer's zone wherever it appears.

              **It replaced the next session's own date and time**, which was the
              card saying twice what the Join button beneath it already said
              exactly — and saying it in the row a gedu reads first, where the
              question is which of my activities is this rather than when is the
              very next one. The next session is not lost: on a remote product the
              locked Join names it ("Opens Thu 12 Feb at 17:00"), and on a live
              one the badge in the corner says it is happening now.

              **The row is always here**, and holds the "nothing scheduled" line
              on a product with no slots yet, so the card cannot lose a row to a
              missing schedule. That is not a reserved space — a schedule is a
              fact every product has an answer to, and "none set" is the answer
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
                <span className="block">{t("noNextSession")}</span>
              )}
            </span>
          </div>

          {/* Pinned to the bottom: the day it ended on a finished run, the room
              on a remote product, the building on an in-person one. Three flat
              conditions rather than one nested chain — they are mutually
              exclusive by construction, and the end date wins over both of the
              others because a run that is over has neither a session left to
              join nor a venue anyone is travelling to.

              `min-h-9` is the Join button's own height (`size="sm"`), held by the
              row whatever lands in it. Without it the footer is as tall as its
              content, so a card whose answer is a line of text — a venue, the
              day a run ended — sits a button's worth shorter than the card
              beside it. Inside a grid row that is invisible (the row stretches
              and the difference lands as padding), which is exactly why it went
              unnoticed: it shows up on the card that ends up alone on the last
              row, where there is nothing to stretch against and an ended club
              reads as a clipped version of a real card.

              **Nothing in this row is lifted above the card's stretched link
              except the Join itself.** The lift used to sit on the row, which
              also lifted the venue name and the ended-on date — neither of which
              is a control — and made the bottom strip of most cards a dead zone
              where a click hit nothing at all. The button is the only thing here
              with a click of its own to receive, so it is the only thing that
              takes the `z-10`. */}
          <div className="mt-auto flex min-h-9 items-center justify-center">
            {endedOn !== null && (
              // Date-only and UTC-pinned, via the shared bare-date formatter: an
              // end date is a calendar date with no clock face on it, so it must
              // read the same everywhere rather than tipping a day either side
              // of a viewer's midnight.
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarOff className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {t("endedOn", { date: formatDateOnly(endedOn, locale) })}
                </span>
              </span>
            )}
            {endedOn === null && hasVoiceRoom && hasNext && (
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
                  // Leaving the room lands on the group's workspace, not back
                  // on this grid: what a gedu does after a session is write it
                  // up, and the feed is where that happens. It is the same href
                  // the card itself opens, so the two agree by construction.
                  backHref={openHref}
                />
              </span>
            )}
            {endedOn === null && !hasVoiceRoom && siteName !== null && (
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
            `z-10` to keep receiving its own clicks. */}
        <Link
          href={openHref}
          onClick={(e) => {
            if (openHref === "#") e.preventDefault();
          }}
          aria-label={productName}
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      </Card>

      {/* Outside the card, over its corner — so it sits *above* the stretched
          link rather than inside it, and a click landing on it would hit
          nothing at all. It is therefore a link to the card's own target: the
          corner is exactly where the sweep model tells a gedu to tap, and the
          one thing that must not happen there is nothing. */}
      <SessionFeedAlertBadge
        count={attentionCount}
        variant="corner"
        href={openHref}
      />
    </div>
  );
}
