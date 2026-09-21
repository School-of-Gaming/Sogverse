"use client";

import { CalendarClock, ChevronRight, Lock, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MaybeInertLink } from "@/components/ui/maybe-inert-link";
import { SessionFeedAlertBadge } from "@/components/gedu/session-feed";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { INERT_HREF } from "@/lib/constants/routes";
import type { GeduCoverSummary } from "@/lib/gedu-assignment-rollup";
import { useNow, useTimezone } from "@/providers";
import { runLiveness } from "@/lib/product-run";
import {
  cn,
  formatDate,
  formatDateOnly,
  formatTimeRange,
} from "@/lib/utils";

/**
 * One card per **live cover** — a single afternoon this gedu is standing in
 * for, beside the groups they actually hold.
 *
 * **Its own card rather than an assignment card with a date on it.** An
 * assignment card answers questions about a *run*: what the cadence is, when
 * the next one is, how many children are in the group week after week, whether
 * the run has ended. A cover has none of those — it is one session — and a card
 * that answered them would be telling a sub they teach the club every week. So
 * this one says only what a sub needs: which product and group, when it is,
 * where it is or how to get in, and whether the write-up is still owed.
 *
 * **It lives in the same grid as the assignment cards, at the head of its type
 * noun's section.** A cover is one of the things a gedu runs this week, so
 * splitting it into a section of its own would put the same week's work in two
 * places and give a gedu with one cover a whole heading for one card. Covers
 * lead their section because they are dated, one-off, and the thing most easily
 * forgotten — an assignment recurs and will be there again next week.
 *
 * **The link carries the group.** A sub has no assignment row to resolve a
 * group from, and one covering a sibling group of a product they already teach
 * would otherwise land on their own group's workspace: the right product, the
 * wrong roster. The query param is built in the roll-up, so this card simply
 * renders whichever href it was handed.
 *
 * **The badge is the badge**. What a cover owes is the same four things every
 * session owes, counted over a set of one — so the corner mark is the one every
 * other card wears, and a sub who has not sent their report finds it in the
 * same sweep.
 *
 * **A cover that has not opened yet is LOCKED, not absent.** The workspace
 * opens 48 hours before the covered session, and until then every gate behind
 * this card refuses — so the card states the session and says when it opens,
 * and its two ways in (the stretched link and the corner badge) are inert. A
 * link that led to the workspace's "not assigned" empty state would be the
 * worst of both: a sub who *is* covering, told they are not.
 *
 * **The footer holds one answer, and while the card is locked the answer is
 * when.** That zone asks "how do I get to this session" — a Join on a remote
 * product, the building on an in-person one — and until the workspace opens the
 * honest reply is neither of those. It is the same reserved height either way,
 * so the card does not move when the answer changes, and the site or the Join
 * is back well before the session.
 */
export function GeduCoverCard({ cover }: { cover: GeduCoverSummary }) {
  const t = useTranslations("gedu.cover");
  const p = useTranslations("productType");
  const d = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const {
    productName,
    productType,
    groupName,
    coveredDate,
    startsAt,
    endsAt,
    accessOpensAt,
    hasVoiceRoom,
    voiceHref,
    siteName,
    openHref,
    attentionCount,
  } = cover;

  /**
   * Whether the group is still shut to this sub.
   *
   * Asked of the same clock the Join below reads, deliberately: two clocks in
   * one card is a card that can say the room is open while claiming the group
   * is not. An orphaned date has no `accessOpensAt` and is never locked, which
   * is the database's own answer on one — it falls open rather than shut.
   */
  const locked = accessOpensAt !== null && now < accessOpensAt;
  const href = locked ? INERT_HREF : openHref;

  /**
   * Whether the room is open, from the same shared derivation the assignment
   * card asks — against the covered session's own instants rather than a
   * schedule walk, because a cover *is* one occurrence.
   *
   * An orphaned date (one the schedule no longer projects) has no instants and
   * is therefore never live, which is right: there is no session to walk into.
   */
  const { voiceIsOpen } = runLiveness(
    { nextSessionStart: startsAt, nextSessionEnd: endsAt, hasVoiceRoom },
    now,
  );

  const when =
    startsAt !== null && endsAt !== null
      ? `${formatDate(startsAt, locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone,
        })}, ${formatTimeRange(startsAt, endsAt, locale, timeZone)}`
      : formatDateOnly(coveredDate, locale);

  return (
    // The same shell the assignment card uses: a `relative` wrapper so the
    // corner badge can hang off a card that clips its own overflow.
    <div className="relative h-full">
      <Card
        className={cn(
          "group relative h-full overflow-hidden border-l-2 transition-[box-shadow,transform,border-color]",
          // A locked card leads nowhere, so it does not offer itself as a
          // control either — the geometry is untouched, which is what keeps the
          // grid from moving when the lock lifts.
          !locked && "cursor-pointer hover:shadow-lg focus-within:shadow-lg",
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              {/* Two words in the eyebrow's slot, because this card's own kind
                  is the first thing about it that has to be legible — a sub
                  scanning a grid must not read it as another group of theirs. */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="px-2 py-0 text-[10px] uppercase tracking-wide text-info"
                >
                  {t("cardEyebrow")}
                </Badge>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {p(productType)}
                </span>
              </div>
              <p className="text-lg font-semibold leading-tight">
                {productName}
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {groupName ?? d("untitledGroup")}
              </p>
            </div>
            <ChevronRight
              aria-hidden
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          </div>

          {/* The one date this card is about — not a cadence, because a cover
              has none. */}
          <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 tabular-nums">{when}</span>
          </p>

          {/* The same footer question the assignment card asks — how do I get
              to this — with one answer at a time and the same reserved button
              height, so a cover card and an assignment card in one grid row are
              the same height without either holding a gap. While the workspace
              is shut the answer is when it opens; the room or the building take
              the zone back the moment it does, and the height never moves. */}
          <div className="mt-auto flex min-h-9 items-center justify-center">
            {locked && (
              // The same words and the same lock the Join wears when its room
              // is shut, because a sub reading one has already read the other.
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  {t("accessOpens", {
                    date: formatDate(accessOpensAt, locale, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone,
                    }),
                    time: formatDate(accessOpensAt, locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone,
                    }),
                  })}
                </span>
              </span>
            )}
            {!locked && hasVoiceRoom && startsAt !== null && (
              <span className="relative z-10">
                <JoinVoiceButton
                  voiceIsOpen={voiceIsOpen}
                  voiceHref={voiceHref}
                  opensDate={formatDate(startsAt, locale, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone,
                  })}
                  opensTime={formatDate(startsAt, locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone,
                  })}
                  // Leaving the room lands on the covered group's workspace,
                  // which is where the write-up happens — the same href the
                  // card itself opens, so the two agree by construction.
                  backHref={openHref === INERT_HREF ? undefined : openHref}
                />
              </span>
            )}
            {!locked && !hasVoiceRoom && siteName !== null && (
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{siteName}</span>
              </span>
            )}
          </div>
        </CardContent>

        <MaybeInertLink
          href={href}
          aria-label={
            locked
              ? t("cardLockedLabel", { product: productName })
              : t("cardOpenLabel", { product: productName })
          }
          className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-act"
        />
      </Card>

      <SessionFeedAlertBadge
        count={attentionCount}
        variant="corner"
        href={href}
      />
    </div>
  );
}
