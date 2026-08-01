"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
 * **Every card is the same height, whatever state it is in.** A dashboard is
 * read as a grid, and a grid whose cells are different heights because one club
 * happens to owe a write-up and another happens to be live is a grid that
 * reshuffles itself every time a session starts or a register is finished. So
 * the two variable zones — the alert badge above and the Join below — always
 * occupy their space, empty or not, and the schedule block sits between them
 * with the footer pushed to the bottom. The empty zones are genuinely empty:
 * nothing to click, nothing to read out, just height.
 *
 * **Clickability comes from the card, not from a label.** There used to be an
 * "Open sessions" link in the bottom corner, which was a word doing a job that a
 * chevron, a pointer cursor and a hover state do better and in less space — and
 * which read as *the* target, when the whole card has always been one. Now the
 * chevron sits in the top-right corner where a "there is more inside this"
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
 * place a gedu meets their next session before opening it; an in-person one
 * renders none at all, since there is no room. Card and button are both real
 * anchors via a stretched link: the invisible link covers the card with an
 * `::after`, and the Join button is lifted above it with `relative z-10` so it
 * receives its own clicks. No `<a>` inside `<a>`, so middle-click and prefetch
 * both behave.
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
  } = assignment;

  const hasNext = nextSessionStart !== null && nextSessionEnd !== null;
  const inProgress = hasNext && nextSessionStart.getTime() <= now.getTime();
  // Lit when something is actually happening — a room the gedu can walk into,
  // or a session already running. An in-person product has no room and still
  // deserves the treatment while its session is on.
  const live = voiceIsOpen || inProgress;

  return (
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
        {/* `pr-7` keeps the identity block clear of the corner chevron. */}
        <div className="flex items-start justify-between gap-2 pr-7">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {d(`typeLabel.${productType}`)}
            </p>
            <p className="text-lg font-semibold leading-tight">{productName}</p>
            {/* The group as one quiet line, not a name plus a bordered pill:
                the pill gave the gamer count the visual weight of a status
                badge sitting next to a real one (the attention badge, below),
                and a roster size is not a status. */}
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
        </div>

        {/* Reserved zone: the alert badge, or the height it would have taken.
            An empty div rather than a hidden badge — there is no text to be
            read out and nothing to receive a click, so it costs a screen reader
            and a keyboard exactly nothing. */}
        <div className="flex min-h-6 items-start">
          {attentionCount > 0 && <SessionFeedAlertBadge count={attentionCount} />}
        </div>

        {/* Reserved zone: the next session, its in-progress line, or the
            "nothing scheduled" fallback — all three at the same height, so a
            session starting cannot grow the card it is on. */}
        <div className="min-h-10 space-y-1">
          {hasNext ? (
            <>
              <p className="text-sm">
                {formatSessionDateTimeRange(
                  nextSessionStart,
                  nextSessionEnd,
                  locale,
                  timeZone,
                )}
              </p>
              {/* The only non-absolute line left, and it isn't a date: "in
                  progress" is a fact about right now that the date above cannot
                  express, and it is what makes the lit Join beside it make
                  sense. */}
              {inProgress && (
                <p className="text-xs text-muted-foreground">{t("inProgress")}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noNextSession")}</p>
          )}
        </div>

        {/* The cadence in words. A roll-up card can't enumerate dates without
            becoming the list it replaced, and "Mondays 16:30–18:00" tells the
            gedu more per line than eight Mondays ever did. */}
        {scheduleLines.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
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

        {/* Reserved zone, pinned to the bottom: the Join, or its height. An
            in-person product never grows one, and a remote product's comes and
            goes with the voice window — neither may move the card. */}
        <div className="relative z-10 mt-auto flex min-h-9 items-end justify-center">
          {hasNext && hasVoiceRoom && (
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
        </div>
      </CardContent>

      {/* The chevron is decoration: it says "there is more inside this" and is
          anchored to the corner, out of the flow, so no state below can push it.
          The link beneath it is what is actually clicked. */}
      <ChevronRight
        aria-hidden
        className="pointer-events-none absolute right-4 top-4 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />

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
  );
}
