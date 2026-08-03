"use client";

import { useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import { AttendanceSummary } from "./AttendanceSummary";
import { CollapsibleRegion } from "./CollapsibleRegion";
import {
  editorStateFromEntry,
  isEditableEntry,
  isPlannableEntry,
  planEditorStateFromEntry,
  type SessionCompleteness,
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
   * Whether this is the soonest session still ahead of us. It changes the
   * future tag's wording, not its weight — every future session is tagged.
   */
  prominent?: boolean;
  /**
   * Whether this entry's report may be clamped. The feed passes `false` for the
   * most recent past session, whose write-up is what the weekly loop came to
   * read.
   */
  clampReport?: boolean;
  /**
   * Where this entry sits on the completeness ladder, or `null` for the kinds
   * the ladder does not apply to. Computed by the feed and handed down: the
   * timeline marker beside this card needs the same answer, and walking the
   * roster twice per row to reach it is a cost a fifty-week feed pays fifty
   * times over.
   */
  completeness: SessionCompleteness | null;
  /** Whether this entry is the one currently expanded into an editor. */
  editing: boolean;
  /** Open this entry's editor (or close it if it is already open). */
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: SessionEntryDraft) => void;
}

/**
 * One row of the feed: the session's date and state, what was recorded about
 * it, and — for everything that can still be written up or planned — the editor
 * that expands in place beneath it.
 *
 * The header carries the date and every control, and it is the one part that
 * never moves: the display body and the editor are two sibling collapsing
 * regions *below* it, so opening the editor grows the card downward instead of
 * sliding the button that was just clicked out from under the cursor.
 *
 * **Neither direction animates.** Opening is instant because closing has to be
 * — the close is chased by a scroll correction that holds the card *below* this
 * one still, and a correction cannot chase a running transition — and a swap
 * that animated one way and snapped the other would read as a bug rather than
 * as a decision.
 *
 * **The body reads in the order the work is done: attendance, then the report,
 * then the gedu note.** Attendance is the mandatory half and the only thing an
 * entry can be flagged for, so it is the first line under the date rather than
 * something found by scrolling past a write-up. The editor takes the same
 * order, which means the collapsed card and the open one say the same things in
 * the same sequence.
 *
 * **One edit affordance, everywhere.** Every editable entry — past or future,
 * written up or not — opens through the same icon-and-text Edit button in the
 * same corner. A card whose whole header was the click target taught a
 * different gesture for one state, which is exactly the state a gedu meets
 * least often and would have to relearn each time.
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
 * arrived.
 *
 * A pre-epoch gap is a bare dashed line with no card and no editor at all,
 * because nothing is owed for it and it must not compete with the narrative
 * around it.
 *
 * **Every future session carries a tag, in the info tone.** The next one says
 * so by name and the rest say "future session", and both are the same blue —
 * the boundary between what has happened and what has not is the one thing a
 * reader must never have to work out from a date. The tone is info rather than
 * the primary brand one because the two signals in this feed sit inches apart
 * ("this is coming up" and "this owes you work") and primary is close enough to
 * the warning amber that a column of cards read as one wash of attention. Info
 * separates on hue, so the two are told apart from across the room.
 *
 * Which editor opens follows the side of the present the entry is on: past
 * entries get the record editor (attendance + notes), future ones get the
 * notes-only editor. No entry ever offers both, and neither carries a Join —
 * rooms are joined from the group surfaces, never from a session card.
 *
 * **Closing the editor hands focus back to the Edit button.** Save and Cancel
 * live *inside* the region that goes `inert` the moment it shuts, so the element
 * that was focused stops being focusable in the same frame and the browser drops
 * focus to the document body — a keyboard user who saves lands at the top of the
 * page and has to tab back through the whole feed. Focus is therefore moved to
 * the control that opened the editor, which is where the user was before they
 * opened it and is the only element on the card guaranteed to still be there
 * afterwards. It is moved with `preventScroll`, because the card is at that
 * moment losing most of its height under a scroll correction and a
 * focus-triggered scroll would be one more thing for that correction to undo.
 */
export function SessionFeedItem({
  entry,
  roster,
  labels,
  prominent = false,
  clampReport = true,
  completeness,
  editing,
  onToggleEdit,
  onCancelEdit,
  onSave,
}: SessionFeedItemProps) {
  const t = useTranslations("gedu.sessionFeed");
  const recordable = isEditableEntry(entry);
  const plannable = isPlannableEntry(entry);
  const editorId = useId();
  const editButton = useRef<HTMLButtonElement>(null);

  /** Called on every path that shuts the editor — save and cancel alike. */
  const returnFocusToEditButton = () =>
    editButton.current?.focus({ preventScroll: true });

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
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <SessionDateLine labels={labels} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {entry.kind === "future" && (
            <Badge
              variant="outline"
              className="border-info/50 text-[10px] uppercase tracking-wide text-info"
            >
              {prominent ? t("upcomingBadge") : t("futureBadge")}
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
          {(recordable || plannable) && (
            <Button
              ref={editButton}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleEdit}
              aria-expanded={editing}
              aria-controls={editorId}
              className="-my-1 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              {t("edit")}
            </Button>
          )}
        </div>
      </div>

      <CollapsibleRegion open={!editing} instant>
        <SessionEntryBody
          entry={entry}
          roster={roster}
          clampReport={clampReport}
        />
      </CollapsibleRegion>

      {recordable && (
        <CollapsibleRegion open={editing} instant id={editorId}>
          <SessionRecordEditor
            open={editing}
            roster={roster}
            initialState={editorStateFromEntry(entry, roster)}
            onCancel={() => {
              onCancelEdit();
              returnFocusToEditButton();
            }}
            onSave={(draft) => {
              onSave(draft);
              returnFocusToEditButton();
            }}
          />
        </CollapsibleRegion>
      )}

      {plannable && (
        <CollapsibleRegion open={editing} instant id={editorId}>
          <SessionPlanEditor
            open={editing}
            initialState={planEditorStateFromEntry(entry)}
            onCancel={() => {
              onCancelEdit();
              returnFocusToEditButton();
            }}
            onSave={(draft) => {
              onSave(draft);
              returnFocusToEditButton();
            }}
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
  clampReport,
}: {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
  clampReport: boolean;
}) {
  const t = useTranslations("gedu.sessionFeed");

  switch (entry.kind) {
    case "future": {
      const hasNotes =
        hasText(entry.report) || hasText(entry.staffNote);
      // The report renders bare, exactly as it does on a past entry — no
      // "Planned" heading over it. Written before the session and written after
      // it are the same field at two moments; labelling one of them made the
      // feed claim a distinction the model does not have. There is no
      // attendance line, because nobody has been anywhere yet.
      return (
        <div className="space-y-3 pb-1 pt-3">
          <WrittenFields entry={entry} clampReport={clampReport} />
          {/* A future session with nothing on it still needs a line, or the
              card is a bare date with no reason to exist on the page. */}
          {!hasNotes && (
            <p className="text-sm text-muted-foreground">{t("noNotesYet")}</p>
          )}
        </div>
      );
    }

    case "past":
      // Attendance leads: it is the mandatory half, and its own headline ("3 of
      // 8 marked") says more about what this row still wants than a paragraph
      // of prose could. It is unconditional — a part-marked or wholly unmarked
      // sheet is exactly the case the gedu came back for.
      //
      // Report and attendance are otherwise independent: a session can carry a
      // full report and still owe its register, so the report renders either
      // way. `pb-1` is for the attendance disclosure's focus ring, since this
      // region clips its own overflow.
      return (
        <div className="space-y-3 pb-1 pt-3">
          <AttendanceSummary roster={roster} attendance={entry.attendance} />
          <WrittenFields entry={entry} clampReport={clampReport} />
        </div>
      );

    case "no_record":
      // Rendered as a bare line by the item shell — it never reaches here.
      return null;
  }
}

/**
 * The two written halves of an entry — the family-facing report, then the
 * gedu-only note in its padlocked panel.
 *
 * One component for both sides of the present, because they render identically
 * on both: a note written on Sunday about Monday and one written on Tuesday
 * about Monday are the same field at two moments, and the display used to say so
 * twice in byte-identical markup. A future entry's "nothing written yet" line is
 * not here, because a *past* entry with no report owes nothing and says nothing.
 */
function WrittenFields({
  entry,
  clampReport,
}: {
  entry: Extract<SessionFeedEntry, { kind: "future" | "past" }>;
  clampReport: boolean;
}) {
  return (
    <>
      {hasText(entry.report) && (
        <SessionReport markdown={entry.report} clamped={clampReport} />
      )}
      {hasText(entry.staffNote) && (
        <StaffNoteBlock>
          <Markdown className="text-muted-foreground">
            {entry.staffNote}
          </Markdown>
        </StaffNoteBlock>
      )}
    </>
  );
}

/** A nullable stored field that actually has something in it. */
function hasText(value: string | null): value is string {
  return value !== null && value.length > 0;
}
