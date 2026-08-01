"use client";

import { AlertTriangle, CalendarOff, CheckCircle2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AttendanceSummary } from "./AttendanceSummary";
import { CollapsibleRegion } from "./CollapsibleRegion";
import {
  editorStateFromEntry,
  entryCompleteness,
  isEditableEntry,
  isPlannableEntry,
  planEditorStateFromEntry,
} from "./entry-state";
import { SessionPlanEditor } from "./SessionPlanEditor";
import { SessionRecordEditor } from "./SessionRecordEditor";
import { SessionReport } from "./SessionReport";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type { SessionLabels } from "./session-labels";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
} from "./types";

interface SessionFeedItemProps {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
  labels: SessionLabels;
  /**
   * Whether this is the soonest session still ahead of us. Only the prominent
   * entry wears the "next session" accent; every later future entry is a date
   * with notes on it, not the one being walked into.
   */
  prominent?: boolean;
  /** Whether this entry is the one currently expanded into an editor. */
  editing: boolean;
  /** Open this entry's editor (or close it if it is already open). */
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: SessionEntryDraft) => void;
}

/**
 * One row of the feed: the session's date and state, its notes, and — for
 * everything that can still be written up or planned — the editor that expands
 * in place beneath it.
 *
 * The header carries the date and every control, and it is the one part that
 * never moves: the display body and the editor are two sibling collapsing
 * regions *below* it, so opening the editor grows the card downward instead of
 * sliding the button that was just clicked out from under the cursor.
 *
 * **One edit affordance, everywhere.** Every editable entry — past or future,
 * written up or not — opens through the same icon-and-text Edit button in the
 * same corner. A card whose whole header was the click target taught a different
 * gesture for one state, which is exactly the state a gedu meets least often
 * and would have to relearn each time.
 *
 * **A past session wears one of three states, and only two of them say
 * anything.** Attendance still owed is an alert icon and label on an otherwise
 * ordinary card — it used to wear a tinted background too, which made the feed's
 * most common transient state look like a failure and painted half the page
 * amber for a gedu catching up after half term. Attendance finished with no
 * report is deliberately silent: the report is optional, so a badge there would
 * be a nag for work nobody owes. Attendance finished *and* a report written is
 * the only state that earns a mark of its own, a green check, because it is the
 * one the gedu is aiming at and nothing else on the card can tell them they have
 * arrived. A skipped session sits outside the ladder entirely — it did not run.
 *
 * A pre-epoch gap is a bare dashed line with no card and no editor at all,
 * because nothing is owed for it and it must not compete with the narrative
 * around it.
 *
 * **The next session's accent is the info tone, not the primary one.** The two
 * signals in this feed sit inches apart — "this is the one coming up" and "this
 * one owes you work" — and primary is a warm brand tone close enough to the
 * warning amber that a column of cards read as one undifferentiated wash of
 * attention. Info is a blue: it separates on hue rather than on saturation, so
 * the two states are told apart at a glance and from across the room.
 *
 * Which editor opens follows the side of the present the entry is on: past
 * entries get the record editor (attendance + notes + didn't-run), future ones
 * get the notes-only editor. No entry ever offers both, and neither carries a
 * Join — rooms are joined from the group surfaces, never from a session card.
 */
export function SessionFeedItem({
  entry,
  roster,
  labels,
  prominent = false,
  editing,
  onToggleEdit,
  onCancelEdit,
  onSave,
}: SessionFeedItemProps) {
  const t = useTranslations("gedu.sessionFeed");
  const recordable = isEditableEntry(entry);
  const plannable = isPlannableEntry(entry);
  const completeness = entryCompleteness(entry, roster);

  // Pre-epoch gaps aren't part of the story and aren't work — a single quiet
  // dashed line, deliberately not a card.
  if (entry.kind === "no_record") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <SessionDateLine labels={labels} muted />
        <span>{t("noRecordLabel")}</span>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "p-4 sm:p-5",
        entry.kind === "future" && prominent && "border-info/50",
        entry.kind === "skipped" && "border-dashed bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <SessionDateLine labels={labels} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {entry.kind === "future" && prominent && (
            <Badge
              variant="outline"
              className="border-info/50 text-[10px] uppercase tracking-wide text-info"
            >
              {t("upcomingBadge")}
            </Badge>
          )}
          {completeness === "needs_attention" && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {t("needsAttentionLabel")}
            </span>
          )}
          {completeness === "complete" && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {t("completeLabel")}
            </span>
          )}
          {entry.kind === "skipped" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarOff className="h-3.5 w-3.5" aria-hidden />
              {t("skippedLabel")}
            </span>
          )}
          {(recordable || plannable) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleEdit}
              aria-expanded={editing}
              className="-my-1 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {t("edit")}
            </Button>
          )}
        </div>
      </div>

      <CollapsibleRegion open={!editing}>
        <SessionEntryBody entry={entry} roster={roster} />
      </CollapsibleRegion>

      {recordable && (
        <CollapsibleRegion open={editing}>
          <SessionRecordEditor
            open={editing}
            roster={roster}
            initialState={editorStateFromEntry(entry, roster)}
            onCancel={onCancelEdit}
            onSave={onSave}
          />
        </CollapsibleRegion>
      )}

      {plannable && (
        <CollapsibleRegion open={editing}>
          <SessionPlanEditor
            open={editing}
            initialState={planEditorStateFromEntry(entry)}
            onCancel={onCancelEdit}
            onSave={onSave}
          />
        </CollapsibleRegion>
      )}
    </Card>
  );
}

/** Date on top, the clock face (plus viewer zone abbrev) underneath. */
function SessionDateLine({
  labels,
  muted = false,
}: {
  labels: SessionLabels;
  muted?: boolean;
}) {
  if (muted) {
    return (
      <span className="flex items-center gap-2 tabular-nums">
        <span>{labels.date}</span>
        <span className="opacity-70">{labels.timeRange}</span>
      </span>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold leading-tight">{labels.date}</p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {labels.timeRange}
        {labels.timeZoneAbbrev !== null && (
          <span className="ml-1.5">{labels.timeZoneAbbrev}</span>
        )}
      </p>
    </div>
  );
}

function SessionEntryBody({
  entry,
  roster,
}: {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
}) {
  const t = useTranslations("gedu.sessionFeed");

  switch (entry.kind) {
    case "future": {
      const hasNotes =
        (entry.report !== null && entry.report.length > 0) ||
        (entry.staffNote !== null && entry.staffNote.length > 0);
      // The report renders bare, exactly as it does on a past entry — no
      // "Planned" heading over it. Written before the session and written after
      // it are the same field at two moments; labelling one of them made the
      // feed claim a distinction the model does not have.
      return (
        <div className="space-y-3 pb-1 pt-3">
          {entry.report !== null && entry.report.length > 0 && (
            <SessionReport markdown={entry.report} />
          )}
          {entry.staffNote !== null && entry.staffNote.length > 0 && (
            <StaffNoteBlock>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {entry.staffNote}
              </p>
            </StaffNoteBlock>
          )}
          {/* A future session with nothing on it still needs a line, or the
              card is a bare date with no reason to exist on the page. */}
          {!hasNotes && (
            <p className="text-sm text-muted-foreground">{t("noNotesYet")}</p>
          )}
        </div>
      );
    }

    case "past":
      // Report and attendance are independent: a session can carry a full
      // report and still owe its attendance, so the report renders either way.
      // The attendance line is unconditional — a part-marked or wholly unmarked
      // sheet is exactly the case the gedu came back for, and its own headline
      // ("3 of 8 marked") says more than a sentence of prose could.
      // `pb-1` for the attendance disclosure's focus ring: it is the last thing
      // in this region and the region clips its overflow to animate.
      return (
        <div className="space-y-3 pb-1 pt-3">
          {entry.report !== null && entry.report.length > 0 && (
            <SessionReport markdown={entry.report} />
          )}
          {entry.staffNote !== null && entry.staffNote.length > 0 && (
            <StaffNoteBlock>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {entry.staffNote}
              </p>
            </StaffNoteBlock>
          )}
          <AttendanceSummary roster={roster} attendance={entry.attendance} />
        </div>
      );

    case "skipped":
      return (
        <p className="pt-2 text-sm text-muted-foreground">
          {entry.reason ?? t("skippedNoReason")}
        </p>
      );

    case "no_record":
      // Rendered as a bare line by the item shell — it never reaches here.
      return null;
  }
}
