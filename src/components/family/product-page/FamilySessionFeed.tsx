"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  NowDivider,
  formatMonthLabel,
  formatSessionLabels,
  partitionFeedEntries,
  pastEntryWindow,
  useViewportAnchor,
  withMonthDividers,
  type SessionFeedRow,
} from "@/components/gedu/session-feed";
import { cn } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { FamilySessionFeedItem } from "./FamilySessionFeedItem";
import type { FamilySessionEntry } from "./types";

/**
 * The now-divider's React key.
 *
 * Constant, and that is the whole point: the divider moves down the list as the
 * future is revealed above it, and a key that changed with its position would
 * make React replace the element rather than move it — taking the node the
 * scroll correction measures out from under it mid-toggle.
 */
const DIVIDER_KEY = "now-divider";

/** Everything the feed renders as a row, in one keyed list. */
type FeedRow =
  | SessionFeedRow<FamilySessionEntry>
  | { kind: "divider"; key: typeof DIVIDER_KEY };

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
  className?: string;
}

/**
 * The family's read-only session feed — the same continuous timeline the gedu
 * workspace runs on, with everything a family may not see structurally absent
 * rather than filtered out.
 *
 * It is one feed with one boundary in it. Every occurrence renders as the same
 * kind of row on the same rail, future sessions included; the only thing
 * separating them from the past is the divider carrying the "N upcoming
 * sessions" toggle. Two things keep a long term navigable without ever moving
 * painted content, and both are the shared machinery rather than a family-side
 * copy of it:
 *
 * - **The future reveals upward with the viewport pinned.** Date order is never
 *   violated, so expanding inserts sessions *above* the divider, which would
 *   otherwise shove the whole page down. The scroll is corrected by exactly the
 *   height that appeared, before the browser paints. Nothing animates on that
 *   reveal — a correction that has to chase a running transition is how this
 *   pattern breaks.
 * - **The past opens on its recent slice** and older chunks append *below* on
 *   request, so that reveal grows away from everything being read.
 *
 * **Month dividers** are computed over the whole visible run, so revealing the
 * future never labels the same month twice.
 *
 * The markers on the rail carry no state here. On the gedu's feed they encode
 * the completeness ladder — what is owed, what is finished — which is staff
 * workflow; for a family a session is a session, and a rail that graded them
 * would be inventing a hierarchy between weeks of their child's club. The one
 * distinction the rail keeps is the one the divider already makes: ahead of now
 * is toned, behind it is neutral.
 */
export function FamilySessionFeed({
  entries,
  sourceTimeZone,
  showAttendance,
  audience,
  className,
}: FamilySessionFeedProps) {
  const t = useTranslations("familyProduct");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const [laterOpen, setLaterOpen] = useState(false);
  const [chunksRevealed, setChunksRevealed] = useState(0);

  const anchor = useViewportAnchor();
  const dividerRef = useRef<HTMLLIElement>(null);
  /** Named so the divider's toggle can say which region it reveals into. */
  const listId = useId();

  const { laterFuture, nextSession, past } = useMemo(
    () => partitionFeedEntries(entries),
    [entries],
  );
  const pastWindow = pastEntryWindow(past.length, chunksRevealed);

  /**
   * One descending run of everything currently on screen — future sessions,
   * month labels, the now-divider and the past — as a single keyed list, for
   * the same two reasons the gedu feed builds one: a month boundary falling
   * across the divider is labelled once rather than on both sides of it, and
   * the divider keeps its DOM node across the toggle, which is what the scroll
   * correction measures against.
   */
  const rows = useMemo((): FeedRow[] => {
    const visible: FamilySessionEntry[] = [
      ...(laterOpen ? laterFuture : []),
      ...(nextSession === null ? [] : [nextSession]),
      ...past.slice(0, pastWindow.visible),
    ];
    const dated = withMonthDividers(visible, timeZone);
    if (laterFuture.length === 0 || nextSession === null) return dated;

    // Above the next session, and above the month label introducing it when
    // there is one: a month heading belongs against the entries it names.
    const at = dated.findIndex(
      (row) => row.kind === "entry" && row.entry.id === nextSession.id,
    );
    if (at < 0) return dated;
    const insertAt = at > 0 && dated[at - 1].kind === "month" ? at - 1 : at;
    return [
      ...dated.slice(0, insertAt),
      { kind: "divider", key: DIVIDER_KEY },
      ...dated.slice(insertAt),
    ];
  }, [laterOpen, laterFuture, nextSession, past, pastWindow.visible, timeZone]);

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t(audience === "gamer" ? "emptyFeedGamer" : "emptyFeedCustomer")}
      </p>
    );
  }

  const toggleLater = () => {
    // Captured before the state change, while the divider is still where the
    // reader can see it. No hold: this reveal does not animate, so the geometry
    // is final by the time the correction runs.
    anchor.capture(dividerRef.current);
    setLaterOpen((open) => !open);
  };

  const renderRow = (row: FeedRow) => {
    if (row.kind === "divider") {
      return (
        <li key={row.key} ref={dividerRef}>
          <NowDivider
            count={laterFuture.length}
            open={laterOpen}
            controls={listId}
            onToggle={toggleLater}
          />
        </li>
      );
    }

    if (row.kind === "month") {
      return (
        <li key={row.key} className="relative pt-1">
          <span
            aria-hidden
            className="absolute -left-6 top-1/2 h-px w-3 -translate-x-1/2 bg-border"
          />
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {formatMonthLabel(row.startsAt, locale, timeZone)}
          </p>
        </li>
      );
    }

    const { entry } = row;
    const prominent = entry.id === nextSession?.id;
    const quiet =
      entry.kind === "past" &&
      (entry.report === null || entry.report.length === 0) &&
      (entry.attendance === null || !showAttendance);

    return (
      <li key={row.key} className="relative">
        <span
          aria-hidden
          className={cn(
            "absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
            quiet ? "top-3.5" : "top-5",
            entry.kind === "future"
              ? prominent
                ? "bg-info"
                : "bg-info/40"
              : quiet
                ? "bg-muted-foreground/25"
                : "bg-muted-foreground/60",
          )}
        />
        <FamilySessionFeedItem
          entry={entry}
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
      </li>
    );
  };

  return (
    <div
      className={cn("relative space-y-3 border-l border-border pl-6", className)}
    >
      <ol id={listId} className="space-y-3">
        {rows.map(renderRow)}
      </ol>

      {/* No placeholder under the divider when there is no history: a timeline
          that starts fresh simply ends there, which reads as a club that has
          not met yet — absence, not a fault — and there is no action a line of
          copy could prompt. */}
      {pastWindow.remaining > 0 && (
        // Appends beneath itself, so the button walks down the page with the
        // reveal instead of pushing the story the reader is in.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setChunksRevealed((c) => c + 1)}
        >
          <ChevronsDown className="h-4 w-4" aria-hidden />
          {t("showEarlier", { count: pastWindow.remaining })}
        </Button>
      )}
    </div>
  );
}
