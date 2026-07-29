"use client";

import { AlertTriangle, CalendarOff, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { cn } from "@/lib/utils";
import { AttendanceSummary } from "./AttendanceSummary";
import { CollapsibleRegion } from "./CollapsibleRegion";
import { editorStateFromEntry, isEditableEntry } from "./entry-state";
import { SessionRecordEditor } from "./SessionRecordEditor";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type { SessionLabels } from "./session-labels";
import type {
  SessionFeedEntry,
  SessionFeedGamer,
  SessionRecordDraft,
} from "./types";

interface SessionFeedItemProps {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
  labels: SessionLabels;
  /** Whether this entry is the one currently expanded into the editor. */
  editing: boolean;
  /** Open this entry's editor (or close it if it is already open). */
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: SessionRecordDraft) => void;
}

/**
 * One row of the feed: the session's date and state, its write-up, and — for
 * everything that can still be written up — the editor that expands in place
 * beneath it.
 *
 * The header carries the date and every control, and it is the one part that
 * never moves: the display body and the editor are two sibling collapsing
 * regions *below* it, so opening the editor grows the card downward instead of
 * sliding the button that was just clicked out from under the cursor.
 *
 * Each state gets a treatment that says how much attention it wants. A session
 * needing a write-up is tinted with the warning token and is clickable across
 * its whole header, because it is work to do. A pre-epoch gap is a bare dashed
 * line with no card and no editor, because nothing is owed for it and it must
 * not compete with the narrative around it.
 */
export function SessionFeedItem({
  entry,
  roster,
  labels,
  editing,
  onToggleEdit,
  onCancelEdit,
  onSave,
}: SessionFeedItemProps) {
  const t = useTranslations("gedu.sessionFeed");
  const editable = isEditableEntry(entry);

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
        entry.kind === "upcoming" && "border-primary/40",
        entry.kind === "needs_record" && "border-warning/50 bg-warning/10",
        entry.kind === "skipped" && "border-dashed bg-muted/30",
      )}
    >
      {entry.kind === "needs_record" ? (
        // The whole header is the affordance — a gap exists to be filled in,
        // so there is no reason to make the gedu aim at a small button.
        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          className="flex w-full items-start justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <SessionDateLine labels={labels} />
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {t("needsRecordLabel")}
          </span>
        </button>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <SessionDateLine labels={labels} />
          <div className="flex shrink-0 items-center gap-2">
            {entry.kind === "upcoming" && (
              <Badge
                variant="outline"
                className="border-primary/40 text-[10px] uppercase tracking-wide text-primary"
              >
                {t("upcomingBadge")}
              </Badge>
            )}
            {entry.kind === "skipped" && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                {t("skippedLabel")}
              </span>
            )}
            {editable && (
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
      )}

      <CollapsibleRegion open={!editing}>
        <SessionEntryBody entry={entry} roster={roster} labels={labels} />
      </CollapsibleRegion>

      {editable && (
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
  labels,
}: {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
  labels: SessionLabels;
}) {
  const t = useTranslations("gedu.sessionFeed");

  switch (entry.kind) {
    case "upcoming":
      return (
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <JoinVoiceButton
            voiceIsOpen={entry.voiceIsOpen}
            voiceHref={entry.voiceHref}
            opensDate={labels.date}
            opensTime={labels.startTime}
          />
          <p className="text-xs text-muted-foreground">{t("upcomingHint")}</p>
        </div>
      );

    case "recorded":
      return (
        <div className="space-y-3 pt-3">
          {entry.publicNote.length > 0 && (
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {entry.publicNote}
            </p>
          )}
          {entry.staffNote !== null && entry.staffNote.length > 0 && (
            <StaffNoteBlock>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {entry.staffNote}
              </p>
            </StaffNoteBlock>
          )}
          <AttendanceSummary
            roster={roster}
            presentGamerIds={entry.presentGamerIds}
          />
        </div>
      );

    case "skipped":
      return (
        <p className="pt-2 text-sm text-muted-foreground">
          {entry.reason ?? t("skippedNoReason")}
        </p>
      );

    case "needs_record":
      return (
        <p className="pt-2 text-sm text-muted-foreground">
          {t("needsRecordHint")}
        </p>
      );

    case "no_record":
      // Rendered as a bare line by the item shell — it never reaches here.
      return null;
  }
}
