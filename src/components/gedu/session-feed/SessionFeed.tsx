"use client";

import { useLocale, useTranslations } from "next-intl";
import { useNow, useTimezone } from "@/providers";
import { cn } from "@/lib/utils";
import { SessionFeedItem } from "./SessionFeedItem";
import { formatSessionLabels } from "./session-labels";
import type {
  SessionFeedEntry,
  SessionFeedGamer,
  SessionRecordDraft,
} from "./types";

interface SessionFeedProps {
  /**
   * The group's sessions, newest first: the one upcoming session (if there is
   * one) at the head, then every past occurrence going back in time. The
   * component renders the order it is given — it does no sorting of its own.
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
  /** Id of the entry expanded into the editor, or `null` when none is. */
  editingEntryId: string | null;
  /** Ask to expand an entry's editor, or `null` to collapse whatever is open. */
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionRecordDraft) => void;
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
 * Purely presentational: which entry is open is the caller's state, and saving
 * is the caller's callback. Nothing here fetches, mutates, or sorts.
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

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("emptyFeed")}
      </p>
    );
  }

  return (
    <ol className={cn("relative space-y-3 border-l border-border pl-6", className)}>
      {entries.map((entry) => {
        const editing = editingEntryId === entry.id;
        return (
          <li key={entry.id} className="relative">
            <span
              aria-hidden
              className={cn(
                "absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
                entry.kind === "no_record" ? "top-3.5" : "top-5",
                MARKER_TONE[entry.kind],
              )}
            />
            <SessionFeedItem
              entry={entry}
              roster={roster}
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
      })}
    </ol>
  );
}

/**
 * Timeline marker tone per state. The rail is scanned before anything is read,
 * so the markers carry the same hierarchy the cards do: the next session and
 * the outstanding work stand out, the ordinary weeks are neutral, and the
 * nothing-owed rows all but disappear.
 */
const MARKER_TONE: Record<SessionFeedEntry["kind"], string> = {
  upcoming: "bg-primary",
  recorded: "bg-muted-foreground/60",
  skipped: "bg-muted-foreground/25",
  needs_record: "bg-warning",
  no_record: "bg-muted-foreground/25",
};
