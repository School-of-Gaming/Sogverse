"use client";

import { useMemo, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useNow, useTimezone } from "@/providers";
import { cn } from "@/lib/utils";
import { LaterSessionsBlock } from "./LaterSessionsBlock";
import { SessionFeedItem } from "./SessionFeedItem";
import {
  entryNeedsAttention,
  partitionFeedEntries,
  pastEntryWindow,
} from "./entry-state";
import { withMonthDividers, type SessionFeedRow } from "./feed-rows";
import { formatMonthLabel, formatSessionLabels } from "./session-labels";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
} from "./types";

interface SessionFeedProps {
  /**
   * The group's sessions, newest first: every future occurrence inside the
   * horizon at the head (furthest away first, so the next session is the last
   * of them), then every past occurrence going back in time. The component
   * renders the order it is given — it does no sorting of its own.
   */
  entries: readonly SessionFeedEntry[];
  /** The group's current roster, for the attendance summary and checklist. */
  roster: readonly SessionFeedGamer[];
  /**
   * The zone the schedule was authored in (products are authored in the club's
   * local zone). Sessions always render in the *viewer's* zone; this is only
   * how the feed knows whether that is a conversion worth flagging.
   */
  sourceTimeZone: string;
  /** Id of the entry expanded into an editor, or `null` when none is. */
  editingEntryId: string | null;
  /** Ask to expand an entry's editor, or `null` to collapse whatever is open. */
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionEntryDraft) => void;
  className?: string;
}

/**
 * A group's session feed — the reverse-chronological scroll of what this group
 * has been doing, with the next session on top and the term running backwards
 * beneath it.
 *
 * The spine is a timeline rail with one marker per session, so the run of weeks
 * reads as a single continuous story rather than a stack of unrelated cards,
 * and the markers alone tell you where the gaps are before you read a word.
 *
 * Three things keep a long feed navigable without ever moving painted content:
 *
 * - **Later future sessions collapse** behind one row above the next session,
 *   and reveal *inside* it — they are that block's contents, so it keeps the
 *   single rail marker and they render without one.
 * - **The past opens on its recent slice** and older chunks are appended
 *   *below* on request, so the reveal grows away from everything being read.
 * - **Month dividers** mark each boundary the scroll crosses, which is what
 *   turns a year of near-identical weekly dates back into something scannable.
 *
 * Which entry is open is the caller's state and saving is the caller's callback;
 * how much of the feed is revealed is this component's own, because it is pure
 * view state that no shell needs to know about. Nothing here fetches, mutates,
 * or sorts.
 */
export function SessionFeed({
  entries,
  roster,
  sourceTimeZone,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  className,
}: SessionFeedProps) {
  const t = useTranslations("gedu.sessionFeed");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const [laterOpen, setLaterOpen] = useState(false);
  const [chunksRevealed, setChunksRevealed] = useState(0);

  const { laterFuture, nextSession, past } = useMemo(
    () => partitionFeedEntries(entries),
    [entries],
  );
  const pastWindow = pastEntryWindow(past.length, chunksRevealed);

  const mainRows = useMemo(() => {
    const visible = past.slice(0, pastWindow.visible);
    return withMonthDividers(
      nextSession === null ? visible : [nextSession, ...visible],
      timeZone,
    );
  }, [nextSession, past, pastWindow.visible, timeZone]);

  const laterRows = useMemo(
    () => withMonthDividers(laterFuture, timeZone),
    [laterFuture, timeZone],
  );

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("emptyFeed")}
      </p>
    );
  }

  /**
   * `onRail` is false for the rows revealed inside the collapsed future block.
   * Those sessions are the *contents* of that block, which carries the rail
   * marker for all of them; giving each one its own marker would push a row of
   * dots into the block's padding, where they read as decoration rather than as
   * points on the timeline.
   */
  const renderRow = (row: SessionFeedRow<SessionFeedEntry>, onRail: boolean) => {
    if (row.kind === "month") {
      return (
        <li key={row.key} className="relative pt-1">
          {onRail && (
            <span
              aria-hidden
              className="absolute -left-6 top-1/2 h-px w-3 -translate-x-1/2 bg-border"
            />
          )}
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {formatMonthLabel(row.startsAt, locale, timeZone)}
          </p>
        </li>
      );
    }

    const { entry } = row;
    const editing = editingEntryId === entry.id;
    const prominent = entry.id === nextSession?.id;
    return (
      <li key={row.key} className="relative">
        {onRail && (
          <span
            aria-hidden
            className={cn(
              "absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
              entry.kind === "no_record" ? "top-3.5" : "top-5",
              markerTone(entry, prominent),
            )}
          />
        )}
        <SessionFeedItem
          entry={entry}
          roster={roster}
          prominent={prominent}
          labels={formatSessionLabels(entry, {
            locale,
            timeZone,
            sourceTimeZone,
            now,
          })}
          editing={editing}
          onToggleEdit={() => onEditEntry(editing ? null : entry.id)}
          onCancelEdit={() => onEditEntry(null)}
          onSave={(draft) => onSaveEntry(entry.id, draft)}
        />
      </li>
    );
  };

  return (
    <div
      className={cn("relative space-y-3 border-l border-border pl-6", className)}
    >
      {laterFuture.length > 0 && (
        <LaterSessionsBlock
          count={laterFuture.length}
          open={laterOpen}
          onToggle={() => setLaterOpen((o) => !o)}
        >
          <ol className="space-y-3">
            {laterRows.map((row) => renderRow(row, false))}
          </ol>
        </LaterSessionsBlock>
      )}

      <ol className="space-y-3">
        {mainRows.map((row) => renderRow(row, true))}
      </ol>

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

/**
 * Timeline marker tone per state. The rail is scanned before anything is read,
 * so the markers carry the same hierarchy the cards do: the next session and the
 * outstanding work stand out, the ordinary weeks are neutral, and the
 * nothing-owed rows all but disappear. A future session is only primary-toned
 * when it is the next one — a later plan is not a thing to walk into.
 */
function markerTone(entry: SessionFeedEntry, prominent: boolean): string {
  switch (entry.kind) {
    case "future":
      return prominent ? "bg-primary" : "bg-primary/40";
    case "past":
      return entryNeedsAttention(entry)
        ? "bg-warning"
        : "bg-muted-foreground/60";
    case "skipped":
    case "no_record":
      return "bg-muted-foreground/25";
  }
}
