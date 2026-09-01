"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  SessionFeedShell,
  formatSessionLabels,
  hasReport,
  type SessionFeedRowContext,
} from "@/components/session-feed";
import type { YtyPalette } from "@/lib/constants/yty";
import { cn } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { FamilySessionFeedItem } from "./FamilySessionFeedItem";
import { FAMILY_PRODUCT_TONES } from "./product-page-tones";
import type { FamilySessionEntry } from "./types";

interface FamilySessionFeedProps {
  /**
   * This child's sessions on this product, newest first: every future
   * occurrence inside the horizon at the head (furthest away first, so the next
   * session is the last of them), then every past occurrence going back in
   * time. The component renders the order it is given — it does no sorting.
   */
  entries: readonly FamilySessionEntry[];
  /**
   * The zone the schedule was authored in (products are authored in the club's
   * local zone). Sessions always render in the *viewer's* zone; this is only
   * how the feed knows whether that is a conversion worth flagging.
   */
  sourceTimeZone: string;
  /** Whether to render the child's attendance mark — see the item's own note. */
  showAttendance: boolean;
  /** Which of the two empty-state voices to speak in when there is no past. */
  audience: SessionAudience;
  /** **Design-pass draft** — see the page body's prop. Retires with the draft. */
  palette?: YtyPalette;
  className?: string;
}

/**
 * The family's read-only session feed — the same continuous timeline the gedu
 * workspace runs on, with everything a family may not see structurally absent
 * rather than filtered out.
 *
 * It is a **skin over the shared feed shell** and holds nothing of its own but
 * the two things that differ: which card a row draws, and what its marker says.
 * The divider, the upward reveal with the viewport pinned, the month labels and
 * the scroll-fed history are the shell's, so this feed and the gedu's cannot
 * disagree about where "next" is or about how much of the past is on screen.
 *
 * The markers on the rail **carry no state here**. On the gedu's feed they
 * encode what a session still owes and what is finished, which is staff
 * workflow; for a family a session is a session, and a rail that graded them
 * would be inventing a hierarchy between weeks of their child's club. The one
 * distinction the rail keeps is the one the divider already makes: ahead of now
 * is toned, behind it is neutral.
 *
 * The empty case is this component's own, because the sentence differs by
 * audience — not in what it says but in who it sounds like. A parent is told
 * there are no sessions on this one yet; a child is told the same fact in the
 * voice their own dashboard uses, which is short sentences that explain what
 * will happen rather than adult idiom about what has not.
 * A club with a future and *no history* gets no such line:
 * a timeline that starts fresh simply ends at the divider, which reads as a club
 * that has not met yet — absence, not a fault — and there is no action a line of
 * copy could prompt.
 */
export function FamilySessionFeed({
  entries,
  sourceTimeZone,
  showAttendance,
  audience,
  palette = "current",
  className,
}: FamilySessionFeedProps) {
  const tones = FAMILY_PRODUCT_TONES[palette];
  const t = useTranslations("familyProduct");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t(audience === "gamer" ? "emptyFeedGamer" : "emptyFeedCustomer")}
      </p>
    );
  }

  /**
   * The rail marker for one row: toned only by which side of now it is on, and
   * dropped to the quiet size on a row that renders as a line rather than a
   * card so the dot still sits against its first line of text.
   */
  const markerClass = (
    entry: FamilySessionEntry,
    { prominent }: SessionFeedRowContext,
  ) => {
    const quiet = isQuiet(entry, showAttendance);
    return cn(
      quiet ? "top-3.5" : "top-5",
      // Ahead of now is the wit family under the draft — time is wit — and its
      // two steps are strong then soft rather than full then dimmed: a dot at
      // 40% alpha is a brand colour mixed down toward the page, and wit's two
      // authored variants read far enough apart to carry the step on their own.
      // Behind now stays neutral on every palette; the rail's job there is to
      // be a rail.
      entry.kind === "future"
        ? prominent
          ? tones.nextMarker
          : tones.futureMarker
        : quiet
          ? "bg-muted-foreground/25"
          : "bg-muted-foreground/60",
    );
  };

  return (
    <SessionFeedShell
      entries={entries}
      className={className}
      markerClass={markerClass}
      renderItem={(entry, { prominent }) => (
        <FamilySessionFeedItem
          entry={entry}
          palette={palette}
          prominent={prominent}
          live={
            entry.kind === "future" &&
            entry.startsAt.getTime() <= now.getTime() &&
            now.getTime() < entry.endsAt.getTime()
          }
          showAttendance={showAttendance}
          labels={formatSessionLabels(entry, {
            locale,
            timeZone,
            sourceTimeZone,
            now,
          })}
        />
      )}
    />
  );
}

/**
 * Whether a past session has nothing to say about itself — no write-up, no
 * photos, and no mark this reader is shown. It is the row that renders as a
 * quiet dashed line rather than a card, and the marker drops to match it.
 *
 * **This is the card renderer's own condition and has to stay it.** The two
 * answer the same question from opposite sides — one draws the line, the other
 * sizes the dot beside it — so a term that lands in one and not the other puts
 * a quiet-row marker against a full card. Photos were exactly that term: a
 * session with pictures and no prose is a card, and its dot belongs at a card's
 * height.
 */
function isQuiet(entry: FamilySessionEntry, showAttendance: boolean): boolean {
  return (
    entry.kind === "past" &&
    !hasReport(entry.report) &&
    entry.images.length === 0 &&
    (entry.attendance === null || !showAttendance)
  );
}
