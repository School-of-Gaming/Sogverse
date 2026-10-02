"use client";

import type { ReactNode } from "react";
import { CalendarClock, Clock, MapPin, Radio } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { LanguageFlag } from "@/components/ui/language-flag";
import { StatusLine } from "@/components/ui/alert";
import {
  sessionClockFace,
  type SessionFacts,
} from "@/lib/substitution-session-facts";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { useTimezone } from "@/providers";
import {
  cn,
  formatDate,
  formatDateOnly,
  formatTimeRange,
} from "@/lib/utils";

/**
 * **The session, as every substitution surface states it** — when, how soon,
 * online or where, the topic and the spoken language.
 *
 * The pool card, the admin Substitutions page and a sub's own card on My SOG
 * each frame a session differently, and they are meant to: a volunteer weighs a
 * fee, an admin answers an absence, a sub finds their way in. What none of them
 * should do is describe the session differently, which is what they did while
 * each rendered its own lines — the admin page could not say whether a session
 * was online. So the description is this one component, and each frame keeps
 * its own person data, fee, role and actions around it.
 *
 * Shared here rather than under either role's directory because the gedu and
 * the admin surfaces both render it, and neither owns the other's.
 *
 * **Two densities.** `card` is the stacked lines a card in a grid reads at, its
 * times in the locale's own words with the zone named. `compact` is one wrapping
 * run at the admin list's size, its clock face 24-hour and zoneless because that
 * page states its one zone above every row.
 *
 * **Only the card names the day.** A card stands alone in a grid, so its "when"
 * is the day and the clock face together. The compact run states the clock face
 * alone, because it sits under the admin page's day heading and naming the day
 * again would state it twice; an orphaned date has no clock face, so it states
 * no time at all rather than a guessed one.
 */
export function SubstitutionSessionFacts({
  facts,
  variant,
  timeZone: frameTimeZone,
  howSoon,
  tags = true,
  children,
}: {
  facts: SessionFacts;
  variant: "card" | "compact";
  /**
   * The zone times are stated in. The viewer's, unless the frame resolved its
   * own view model against a zone it pins — the admin page does, and its zone
   * line has to name the clock its rows are on.
   */
  timeZone?: string;
  /**
   * How far away the session is, in words, measured against the caller's
   * clock — and whether to say it as a warning. The urgency threshold is the
   * frame's: the pool and the admin page each own what "soon" means for the
   * decision their reader is making. Omitted, no phrase is drawn.
   */
  howSoon?: { now: Date; urgent: boolean };
  /**
   * Whether to state the topic and the spoken language. A sub's own card
   * leaves them off: it is one of the reader's own sessions, which they took
   * knowing both, and it sits beside assignment cards that state neither.
   */
  tags?: boolean;
  /**
   * The frame's own small facts — a role chip, a fee — appended to the run
   * that carries the topic and the language, so a card states its small facts
   * in one run rather than two. Nothing about the session itself goes here.
   */
  children?: ReactNode;
}) {
  const locale = useLocale();
  const viewerTimeZone = useTimezone();
  const timeZone = frameTimeZone ?? viewerTimeZone;

  if (variant === "compact") {
    const when = sessionClockFace(facts, timeZone);

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {/* In the schedule chips' own tabular numerals, because the admin
            surfaces state the same sessions in several places and a reader
            comparing them is comparing numbers. */}
        {when !== null && (
          <span className="font-medium tabular-nums">{when}</span>
        )}
        {howSoon !== undefined && facts.startsAt !== null && (
          <span
            className={cn(
              "flex items-center gap-1",
              howSoon.urgent
                ? "font-medium text-warning"
                : "text-muted-foreground",
            )}
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            <RelativeTime startsAt={facts.startsAt} now={howSoon.now} />
          </span>
        )}
        <SessionWhere facts={facts} size="xs" />
        {(tags || children !== undefined) && (
          <SessionTags facts={facts} tags={tags}>
            {children}
          </SessionTags>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="min-w-0 space-y-1">
        <p className="flex items-start gap-1.5 text-sm tabular-nums text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {sessionFactsWhen(facts, locale, timeZone)}
          </span>
        </p>
        {howSoon !== undefined && facts.startsAt !== null && (
          <SessionHowSoonLine
            startsAt={facts.startsAt}
            now={howSoon.now}
            urgent={howSoon.urgent}
          />
        )}
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <SessionWhere facts={facts} size="sm" />
        </p>
      </div>
      {(tags || children !== undefined) && (
        <div className="flex flex-wrap items-center gap-2">
          <SessionTags facts={facts} tags={tags}>
            {children}
          </SessionTags>
        </div>
      )}
    </>
  );
}

/**
 * The session's day and clock face, **in the given zone** — the reader
 * deciding whether they are free is free in their own timezone, not in the
 * club's.
 *
 * An orphaned date has no instant at all, and it falls back to the bare date,
 * UTC-pinned like every other zoneless calendar date.
 *
 * Exported for the sentences that name a session — a confirm dialog asking
 * about the card that opened it — so the session a reader is asked about is
 * worded exactly as the card they pressed worded it.
 */
export function sessionFactsWhen(
  facts: Pick<SessionFacts, "sessionDate" | "startsAt" | "endsAt">,
  locale: string,
  timeZone: string,
): string {
  if (facts.startsAt === null || facts.endsAt === null) {
    return formatDateOnly(facts.sessionDate, locale);
  }
  return `${formatDate(facts.startsAt, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })}, ${formatTimeRange(facts.startsAt, facts.endsAt, locale, timeZone)}`;
}

/**
 * How far away it is — "in 3 hours", "tomorrow", "in 5 days".
 *
 * Formatted rather than translated: the phrasing, the unit and the plural are
 * the locale's own, and a relative phrase is the one form that needs no zone
 * at all.
 */
function RelativeTime({ startsAt, now }: { startsAt: Date; now: Date }) {
  const format = useFormatter();
  return <>{format.relativeTime(startsAt, now)}</>;
}

/**
 * The card's how-soon line: the quiet clock, or the warning mark the rest of
 * the app uses for a thing that needs somebody now. The same one line either
 * way, so nothing moves when one becomes the other.
 */
function SessionHowSoonLine({
  startsAt,
  now,
  urgent,
}: {
  startsAt: Date;
  now: Date;
  urgent: boolean;
}) {
  if (urgent) {
    return (
      <StatusLine status="warning" size="xs">
        <RelativeTime startsAt={startsAt} now={now} />
      </StatusLine>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <RelativeTime startsAt={startsAt} now={now} />
      </span>
    </p>
  );
}

/**
 * Online, or where — the one fact a reader cannot work out from anything else
 * on a card.
 *
 * **"Place to be confirmed" is not "online".** An in-person product with no
 * site recorded still needs somebody in a room; saying nothing would read as
 * remote, so it says the place is not known yet.
 */
function SessionWhere({
  facts,
  size,
}: {
  facts: SessionFacts;
  size: "sm" | "xs";
}) {
  const t = useTranslations("sessionFacts");
  const icon = cn("shrink-0", size === "sm" ? "h-4 w-4" : "h-3 w-3");

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {facts.isRemote ? (
        <>
          <Radio className={icon} aria-hidden />
          {t("remote")}
        </>
      ) : (
        <>
          <MapPin className={icon} aria-hidden />
          <span className="min-w-0 truncate">
            {facts.siteName ?? t("siteUnknown")}
          </span>
        </>
      )}
    </span>
  );
}

/** The topic and the spoken language as a chip run, then the frame's own chips. */
function SessionTags({
  facts,
  tags,
  children,
}: {
  facts: SessionFacts;
  tags: boolean;
  children?: ReactNode;
}) {
  const topicLabel = useTopicLabel();

  return (
    <span className="flex flex-wrap items-center gap-2">
      {tags && (
        <>
          <Badge variant="outline" className="text-[11px]">
            {topicLabel(facts.topic)}
          </Badge>
          <LanguageFlag code={facts.spokenLanguageCode} />
        </>
      )}
      {children}
    </span>
  );
}
