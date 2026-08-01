"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, MapPin, Radio, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SessionFeedAlertBadge } from "@/components/gedu/session-feed";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { useNow, useTimezone } from "@/providers";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { formatSessionDateTimeRange } from "@/lib/session-format";
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
 * shorter question — which activities do I run, which is next, and where am I
 * behind. So the card carries the product's identity, the group's identity as a
 * secondary line, one next-session line, the cadence in words rather than as a
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
 * - **The footer holds the Join on a remote product and the venue on an
 *   in-person one.** Those are the same question — where is this happening —
 *   answered the two ways a product can answer it, and they are exclusive by
 *   construction, so exactly one of them is always there. The venue is text with
 *   a pin, deliberately not a link: there is nothing to open, and a card whose
 *   bottom row is sometimes a button and sometimes a link would teach a click
 *   that only works half the time.
 * - **The attention badge overlays the card's top-right corner**, following the
 *   pattern the family session cards already use for a payment problem. It rode
 *   the end of the cadence line for a while, which read fine on one card and
 *   badly across a grid: a gedu opening this page is not reading cards, they
 *   are sweeping for the one that owes them something, and a pill buried in a
 *   row of small grey type is not findable in a sweep. On the corner it is,
 *   from across a screen of six.
 * - **Liveness is the gradient and a badge in the top-right cluster**, next to
 *   the chevron. It replaced a "session in progress" line in the middle of the
 *   card, which was a whole row spent restating what the card's own colour
 *   already said, and which only ever existed on one card at a time.
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
 * **The next session is an absolute date, with no countdown under it.** A
 * relative line ("starts in 2 days, 5 hours") reads as more precise than the
 * date it sits beneath while being harder to act on: a gedu checking a dashboard
 * is deciding what to do on a *day*, and days are what a calendar, a colleague
 * and a parent all speak in. The date is also stable — it says the same thing
 * whenever you look at it, and never has to tick.
 *
 * The Join affordance lives here for a remote product, because this is the only
 * place a gedu meets their next session before opening it. Card and button are
 * both real anchors via a stretched link: the invisible link covers the card
 * with an `::after`, and the Join button is lifted above it with `relative z-10`
 * so it receives its own clicks. No `<a>` inside `<a>`, so middle-click and
 * prefetch both behave.
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
    voiceIsOpen,
    voiceHref,
    openHref,
    attentionCount,
    siteName,
  } = assignment;

  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  const inProgress = hasNext && nextSessionStart.getTime() <= now.getTime();
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
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {d(`typeLabel.${productType}`)}
              </p>
              <p className="text-lg font-semibold leading-tight">{productName}</p>
              {/* The group as one quiet line, not a name plus a bordered pill:
                  the pill gave the gamer count the visual weight of a status
                  badge sitting next to real ones, and a roster size is not a
                  status. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
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
                card paints above both and receives the click. */}
            <div className="flex shrink-0 items-center gap-2">
              {live && (
                <Badge
                  variant="outline"
                  className="gap-1 border-success/50 bg-success/10 px-2 py-0 text-[10px] uppercase tracking-wide text-success"
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

          {/* The next session as one absolute line, or the "nothing scheduled"
              fallback. Both are a single line, so a session arriving or running
              out cannot change the card's height. */}
          <p className={cn("text-sm", !hasNext && "text-muted-foreground")}>
            {hasNext
              ? formatSessionDateTimeRange(
                  nextSessionStart,
                  nextSessionEnd,
                  locale,
                  timeZone,
                )
              : t("noNextSession")}
          </p>

          {/* The cadence in words. A roll-up card can't enumerate dates without
              becoming the list it replaced, and "Mondays 16:30–18:00" tells the
              gedu more per line than eight Mondays ever did. */}
          {scheduleLines.length > 0 && (
            <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0">
                {scheduleLines.map((line) => (
                  <span key={line} className="block tabular-nums">
                    {line}
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* Pinned to the bottom, and never empty: the room on a remote product,
              the building on an in-person one. */}
          <div className="relative z-10 mt-auto flex items-end justify-center">
            {hasVoiceRoom
              ? hasNext && (
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
                )
              : siteName !== null && (
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

      {/* Outside the card, over its corner. It is not inside the stretched
          link's stacking context, so it never eats a click meant for the card
          — which is right: the badge is a mark, not a control. */}
      <SessionFeedAlertBadge count={attentionCount} variant="corner" />
    </div>
  );
}
