"use client";

import { useId } from "react";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import {
  SessionAttributionChip,
  SessionReport,
  hasReport,
  type SessionLabels,
} from "@/components/session-feed";
import { cn } from "@/lib/utils";
import { AttendanceSummary } from "./AttendanceSummary";
import { CollapsibleRegion } from "./CollapsibleRegion";
import {
  editorStateFromEntry,
  isEditableEntry,
  isLiveEntry,
  isPlannableEntry,
  planEditorStateFromEntry,
  type SessionCompleteness,
} from "./entry-state";
import { SessionPlanEditor } from "./SessionPlanEditor";
import { SessionRecordEditor } from "./SessionRecordEditor";
import { StaffNoteBlock } from "./StaffNoteBlock";
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
   * The instant this card reads the clock at — **the same one the entries were
   * built from**, passed down rather than read from the provider here.
   *
   * It decides three things that must never disagree: whether the session is
   * live (the tag), and which of the two editors opens (a live entry takes the
   * record editor, because the register is open from the session's start — the
   * roll-call case).
   *
   * **Threading it is what makes the workspace's editor freeze work.** That
   * page stops the feed's clock while an editor is open so no entry can be
   * reclassified under somebody typing into it; a component that called the
   * ticking clock itself would step straight around that freeze and swap the
   * mounted editor mid-edit, destroying the draft. One instant for the entries
   * and for liveness, or the two come apart.
   */
  now: Date;
  /**
   * Whether this entry's report may be clamped. The feed passes `false` for the
   * most recent past session, whose write-up is what the weekly loop came to
   * read.
   */
  clampReport?: boolean;
  /**
   * What this entry's header says about itself, or `null` when it says nothing.
   * Computed by the feed and handed down: the timeline marker beside this card
   * needs the same answer, and walking the roster twice per row to reach it is a
   * cost a fifty-week feed pays fifty times over.
   */
  completeness: SessionCompleteness | null;
  /** Whether this entry is the one currently expanded into an editor. */
  editing: boolean;
  /**
   * Whether this entry's editor is mid-save. Owned by the feed, because the
   * feed is what runs the save and what closes the editor once it lands.
   */
  committing: boolean;
  /** Why this entry's last save was refused, or `null`. */
  saveError: string | null;
  /**
   * Hand the Edit button up to the feed as it mounts.
   *
   * The feed is what shuts this editor — on cancel, and on a save that has
   * landed — so the feed is also what has to put focus back on the control that
   * opened it. Save and Cancel live *inside* the region that goes `inert` the
   * moment it shuts, so the focused element stops being focusable in the same
   * frame and the browser drops focus to the document body; a keyboard user who
   * saved would land at the top of the page and have to tab back through the
   * whole feed.
   */
  registerEditButton: (node: HTMLButtonElement | null) => void;
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
 * then the gedu note.** Attendance and the report are both owed, but attendance
 * is the one whose state cannot be read off the body — a missing report is
 * visibly missing, whereas "5 of 8 marked" has to be counted for you — so it is
 * the first line under the date rather than something found by scrolling past a
 * write-up. The editor takes the same order, which means the collapsed card and
 * the open one say the same things in the same sequence.
 *
 * **One edit affordance, everywhere.** Every editable entry — past or future,
 * written up or not — opens through the same icon-and-text Edit button in the
 * same corner. A card whose whole header was the click target taught a
 * different gesture for one state, which is exactly the state a gedu meets
 * least often and would have to relearn each time.
 *
 * **A past session says one of two things, or nothing.** An owed session missing
 * either half — a register that is not finished, a report that was never written
 * — is an alert icon and label on an otherwise ordinary card. It used to wear a
 * tinted background too, which made the feed's most common transient state look
 * like a failure and painted half the page amber for a gedu catching up after
 * half term. Both halves present is the one state that earns a mark of its own,
 * a green check, because it is what the gedu is aiming at and nothing else on the
 * card can tell them they have arrived. Everything else is silent: a future
 * session, a pre-epoch gap, a session still running, an unfinished session
 * nobody is owed one for.
 *
 * **The report counts as owed work, and that reverses an earlier call.** A
 * marked-off session with nothing written used to be deliberately silent, on the
 * argument that the report was optional and a badge would nag for work nobody
 * owed. The family surfaces render the report as the main thing a parent comes
 * to read, so a session without one is missing the half that faces outward — and
 * a card that says nothing about it is hiding the more visible of the two gaps.
 *
 * **A pre-epoch gap is a bare dashed line that still opens an editor.** It gets
 * no card and no alert, because nothing is owed for it and it must not compete
 * with the narrative around it — but *owed* and *editable* are different
 * questions, and a gedu who wants to write up a session from before the
 * platform started asking is welcome to. So the line carries the same Edit
 * affordance every other entry does, in a quieter weight, and expands into the
 * same record editor. The moment anything is saved on it, it stops being a gap
 * and renders as an ordinary past entry that owes nothing.
 *
 * **Every future session carries a tag, in the info tone.** The one running
 * right now says so, in the shared live copy the family feed also reads and in
 * a filled tone — a session in progress is the one thing on this feed worth
 * spotting from across the room. The next one says so by name, the rest say
 * "future session", and all of them are the same blue —
 * the boundary between what has happened and what has not is the one thing a
 * reader must never have to work out from a date. The tone is info rather than
 * the primary brand one because the two signals in this feed sit inches apart
 * ("this is coming up" and "this owes you work") and primary is close enough to
 * the warning amber that a column of cards read as one wash of attention. Info
 * separates on hue, so the two are told apart from across the room.
 *
 * **Which editor opens follows whether the session has STARTED, not which side
 * of the divider it sits on.** Anything begun takes the record editor
 * (attendance + notes), including the session in progress — which is a `future`
 * entry, because the kind flips at the *end*. That is the roll-call case: a gedu
 * marks the register and writes the report while the club is running, and the
 * affordance has to be on the card in front of them. Only a session that has not
 * started yet gets the notes-only editor, because attendance is a record of
 * something happening. No entry ever offers both, and neither carries a Join —
 * rooms are joined from the group surfaces, never from a session card.
 *
 * **Closing the editor hands focus back to the Edit button, and the feed does
 * it.** The reason it is not done here is that this component no longer decides
 * when the editor shuts: a save closes it only once the write has landed, which
 * only the feed knows about. So the button is handed upward as it mounts and
 * the feed restores focus on both closing paths. Why it has to be restored at
 * all is above, on `registerEditButton`.
 */
export function SessionFeedItem({
  entry,
  roster,
  labels,
  prominent = false,
  now,
  clampReport = true,
  completeness,
  editing,
  committing,
  saveError,
  registerEditButton,
  onToggleEdit,
  onCancelEdit,
  onSave,
}: SessionFeedItemProps) {
  const t = useTranslations("gedu.sessionFeed");
  const b = useTranslations("sessionBadge");
  // All three off the one instant handed down, through the module that owns the
  // rule — so the card cannot drift from the predicates the tests aim at, and
  // the two editors stay exact complements (exactly one ever opens).
  const live = isLiveEntry(entry, now);
  const recordable = isEditableEntry(entry, now);
  const plannable = isPlannableEntry(entry, now);
  const editorId = useId();

  const recordEditor = recordable && (
    <CollapsibleRegion open={editing} instant id={editorId}>
      <SessionRecordEditor
        open={editing}
        roster={roster}
        initialState={editorStateFromEntry(entry, roster)}
        committing={committing}
        error={saveError}
        onCancel={onCancelEdit}
        onSave={onSave}
      />
    </CollapsibleRegion>
  );

  // Pre-epoch gaps aren't part of the story and aren't work — a single quiet
  // dashed line, deliberately not a card. The Edit affordance is on it anyway,
  // because nothing about the epoch says this session cannot be written up.
  if (entry.kind === "no_record") {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <SessionDateLine labels={labels} muted />
          <div className="flex items-center gap-2">
            <span>{t("noRecordLabel")}</span>
            <Button
              ref={registerEditButton}
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleEdit}
              aria-expanded={editing}
              aria-controls={editorId}
              // Shorter and quieter than the card's Edit button: this row is a
              // 2rem line, and a full-size control in it would make the muted
              // gaps the tallest rows in the feed.
              className="-my-1 h-6 gap-1 px-2 text-[11px]"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              {t("edit")}
            </Button>
          </div>
        </div>
        {recordEditor}
      </div>
    );
  }

  /**
   * Who to sign this card with, or `null` for no chip.
   *
   * Three conditions, and the last is this feed's own. There has to be a
   * write-up to attribute — the shared trimmed test, so a report of one newline
   * signs nothing — and somebody to name. And **the chip is withheld while this
   * entry's editor is open**: Save and Cancel sit in the bottom-right corner of
   * the expanded card, exactly where the chip hangs, and a chip floating over an
   * unsaved draft would be claiming authorship of text that is not stored yet.
   * It comes back when the editor closes, over whatever was actually saved.
   *
   * The pre-epoch dashed line never reaches here — it returns above — which is
   * the right answer twice over: it is a row rather than a card, and it has no
   * stored row behind it to have been edited by anybody.
   */
  const signedBy =
    !editing && hasReport(entry.report) ? entry.lastEditedBy : null;

  const card = (
    <Card
      className={cn(
        "p-4 sm:p-5",
        // Room for the chip, derived from its geometry and not from taste: it
        // stands 30px tall plus a 2px ring and hangs 10px below the card, so
        // 22px of it rises above the card's bottom border — past a 16/20px pad
        // and over the last block of content. 32px at BOTH breakpoints (the
        // chip's size does not change with the viewport) leaves ~11px between
        // the content's bottom edge and the top of the chip. Re-derive this if
        // the chip's height or its `-bottom-*` offset ever moves.
        signedBy !== null && "pb-8 sm:pb-8",
        entry.kind === "future" && prominent && "border-info/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <SessionDateLine labels={labels} />
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {entry.kind === "future" && (
            // The live tag is the same shared `sessionBadge` copy the family
            // feed reads, in a filled tone rather than an outline one: a
            // session happening right now is the one thing on this feed worth
            // finding from across the room. "Next session" on a club that is
            // running would be technically true and read as a mistake.
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase tracking-wide",
                live
                  ? "border-info bg-info/10 text-info"
                  : "border-info/50 text-info",
              )}
            >
              {live ? b("live") : prominent ? b("nextSession") : b("upcoming")}
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
              ref={registerEditButton}
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
          live={live}
          clampReport={clampReport}
        />
      </CollapsibleRegion>

      {recordEditor}

      {plannable && (
        <CollapsibleRegion open={editing} instant id={editorId}>
          <SessionPlanEditor
            open={editing}
            initialState={planEditorStateFromEntry(entry)}
            committing={committing}
            error={saveError}
            onCancel={onCancelEdit}
            onSave={onSave}
          />
        </CollapsibleRegion>
      )}
    </Card>
  );

  // The wrapper gives the chip a positioning context of **exactly one card**,
  // so its offsets resolve against this row rather than against whatever
  // ancestor happens to be positioned. It is **unconditional** — present on
  // every carded entry, signed or not — because it is what keeps the card's
  // subtree identity stable across state flips. It used to appear and vanish
  // with the chip, which meant toggling this entry's editor swapped the whole
  // card for a structurally different tree: React discarded the node mid-flush,
  // taking the Edit button the feed refocuses on close and the report's
  // Read-more state with it. The shell wraps the whole card — collapsible
  // regions and all — so the row still renders exactly one element either way.
  return (
    <div className="relative">
      {card}
      {signedBy !== null && (
        <SessionAttributionChip
          id={signedBy.id}
          firstName={signedBy.firstName}
        />
      )}
    </div>
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
  live,
  clampReport,
}: {
  entry: SessionFeedEntry;
  roster: readonly SessionFeedGamer[];
  /** Whether this is the session in progress — see the attendance note below. */
  live: boolean;
  clampReport: boolean;
}) {
  const t = useTranslations("gedu.sessionFeed");

  switch (entry.kind) {
    case "future": {
      const hasNotes =
        hasText(entry.report) || hasText(entry.staffNote);
      /*
       * **A live session shows its register; a session still ahead has none to
       * show.** Both are `future` entries — the kind flips at the session's end
       * — so the difference is the clock, not the shape.
       *
       * The attendance line is conditional here rather than unconditional as it
       * is on a past entry, and each half of that is deliberate. On a session
       * that has not begun there is genuinely nothing to say: the register
       * cannot be opened before the start, so the map is empty and a "0 of 8
       * marked" line would be inventing a deficit out of a session nobody could
       * have marked yet. On the session in progress there very much is — a gedu
       * who marks six of eight and saves stays on a `future` entry (the save
       * must not move the card mid-roll-call), and if the line were suppressed
       * they would look at the card they just saved and see no trace of the
       * work. That is the bug this condition exists to prevent, and it is the
       * card a gedu spends the whole session looking at.
       *
       * Gated on *having marks* rather than on being live alone, so the moment
       * the session opens the card does not immediately grow a "0 of 8" scold
       * for a register nobody has had a chance to touch. The line appears with
       * the first mark and stays.
       *
       * The report renders bare either way, exactly as on a past entry — no
       * "Planned" heading over it. Written before the session and written after
       * it are the same field at two moments; labelling one made the feed claim
       * a distinction the model does not have.
       */
      const marks = entry.attendance;
      const showAttendance =
        live && roster.some((gamer) => marks[gamer.id] !== undefined);
      return (
        <div className="space-y-3 pb-1 pt-3">
          {showAttendance && (
            <AttendanceSummary roster={roster} attendance={marks} />
          )}
          <WrittenFields entry={entry} clampReport={clampReport} />
          {/* A future session with nothing on it still needs a line, or the
              card is a bare date with no reason to exist on the page. It stays
              up alongside a live register too: "no notes yet" is still true
              then, and it is the standing reminder that the other owed half of
              the session has not been written. */}
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
 * not here, because a past entry says the same thing a different way — the
 * missing report is one of the two gaps its header is already alerting on, and a
 * second line in the body restating it would be the same nag twice.
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
