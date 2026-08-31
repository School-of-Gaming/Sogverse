"use client";

import { useState, type ReactNode } from "react";
import { Eye, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { AttendanceMark } from "@/components/session-feed";
import { attendanceTally, draftFromEditorState } from "./entry-state";
import { AttendanceRoster } from "./AttendanceRoster";
import { FamilyNoteBlock } from "./FamilyNoteBlock";
import { RichNoteField } from "./RichNoteField";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type {
  SessionEditorState,
  SessionFeedGamer,
  SessionRecordDraft,
} from "./types";

interface SessionRecordEditorProps {
  /**
   * Whether the entry around this editor is currently expanded. The editor stays
   * mounted while collapsed — which keeps its fields alive across a close, not
   * which animates one: the close is instant, because a scroll correction is
   * chasing it. It therefore re-seeds its draft on each opening, or a cancelled
   * edit would still be sitting there the next time it opened.
   */
  open: boolean;
  roster: readonly SessionFeedGamer[];
  initialState: SessionEditorState;
  /**
   * A save is in flight. Every control greys out and stays that way until the
   * write actually lands — the flag is owned by whoever runs the mutation and
   * is live before the first render after the click, so there is no frame in
   * which Save is clickable a second time.
   */
  committing: boolean;
  /**
   * What went wrong with the last save, or `null`. Its presence is the reason
   * the editor is still open: a refused write leaves the sheet and both notes
   * exactly as the gedu left them so the retry costs nothing.
   */
  error: string | null;
  /**
   * The session's photo block, rendered between the family-facing report and
   * the gedu note — or nothing, on an entry that has no stored row to hang a
   * photo off.
   *
   * **A slot rather than props, because the staged photos are not this
   * editor's to hold.** They are draft scope exactly like the register and the
   * two written fields, but the save that commits them is the feed's — and so,
   * for the partial-failure reason written down there, is the state saying what
   * is left to commit. Handing the block in whole keeps this component's own
   * state to what it can honestly answer for. All it decides is *where* the
   * block goes and that it greys with everything else.
   */
  photoStrip?: ReactNode;
  onCancel: () => void;
  onSave: (draft: SessionRecordDraft) => void;
}

/**
 * The inline session editor: the attendance sheet, the session report families
 * will read, and the gedu-only note they won't.
 *
 * **Attendance comes first, here and on the card that this collapses back
 * into.** It is the mandatory half — it doubles as the gedu's confirmation that
 * they ran the session, and is what they are paid on — so it leads the
 * workflow, and the two written fields follow it in the order a reader meets
 * them. The display side was the other way round for a while, report first,
 * which meant the one thing that is actually owed was the last thing either
 * surface mentioned.
 *
 * **Save is always available, and a half-marked roster saves as itself.** It
 * used to be gated on every child having an answer, on the reasoning that a
 * partial sheet is ambiguous — but the sheet was never the ambiguous thing, the
 * *storage* was, and that is fixed at the model instead: marks are kept per
 * child, so an unmarked child stays unmarked rather than being padded into an
 * absence. What the gate actually did was throw away the work of a gedu who got
 * interrupted three children in. Now they save what they have, the entry keeps
 * saying it needs attention, and they come back to five rows instead of eight.
 *
 * **There is deliberately no "mark all present" shortcut**, and its absence is
 * the point rather than an omission. One button that fills the whole sheet is
 * one button that fills the whole sheet *without anyone looking at the room* —
 * and since this record is what the gedu is paid on, the cheapest possible way
 * to produce it must not also be the least honest one. Marking eight children
 * individually is a few seconds of friction bought on purpose.
 *
 * **There is also no "this session didn't run" toggle.** It was here, and it
 * has gone with the substitution UI it belongs beside: declaring a session off
 * is inseparable from who is allowed to cancel one and what that does to a
 * family's billing, and none of that is designed. A mock offering the control
 * would be inventing the half nobody has agreed to.
 *
 * The Cancel/Save row is pinned at the bottom, so neither field growing under
 * the writer moves the buttons they are heading for.
 *
 * **A save in flight greys the whole editor and never drops what was typed.**
 * The sheet, both notes and both buttons lock together — half a locked editor
 * invites an edit that the in-flight write will not carry — and on failure the
 * editor stays exactly where it is, re-enabled, with the text untouched and one
 * line saying so. The only thing that closes this editor is a save that landed.
 *
 * **The photo block greys with everything else, and that is the point of it.**
 * It used to stay live through a save, as a wordless way of saying photos were
 * already stored and not part of the draft. They are part of it now *(owner)* —
 * the whole card edit is held in the browser and only Save touches the backend —
 * so a block that went on accepting files while the write it belongs to was in
 * flight would be inviting work this Save cannot carry.
 */
export function SessionRecordEditor({
  open,
  roster,
  initialState,
  committing,
  error,
  photoStrip,
  onCancel,
  onSave,
}: SessionRecordEditorProps) {
  const t = useTranslations("gedu.sessionFeed");
  const [draft, setDraft] = useState<SessionEditorState>(initialState);

  // Re-seed on open, using React's documented "adjust state during render"
  // pattern rather than an effect — the reset lands in the same commit as the
  // expansion, so the editor never paints one frame of the stale draft.
  //
  // `opens` doubles as the rich editors' remount key and, at zero, as the
  // signal that this entry has never been opened and so needs no editor
  // instances yet.
  const [wasOpen, setWasOpen] = useState(open);
  const [opens, setOpens] = useState(open ? 1 : 0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialState);
      setOpens((n) => n + 1);
    }
  }

  const { marked, total } = attendanceTally(roster, draft.attendance);

  // `undefined` returns the row to unanswered, and the key is dropped rather
  // than set to `undefined` so the map never carries a slot that reads as
  // marked to anything checking for the key's presence.
  const markGamer = (gamerId: string, mark: AttendanceMark | undefined) => {
    setDraft((d) => {
      const attendance = { ...d.attendance };
      if (mark === undefined) delete attendance[gamerId];
      else attendance[gamerId] = mark;
      return { ...d, attendance };
    });
  };

  const handleSave = () => onSave(draftFromEditorState(draft, roster));

  return (
    // `pb-1` gives the Save row's focus ring somewhere to land: this editor is
    // rendered inside a collapsible region, which has to clip its overflow.
    <div className="space-y-4 pb-1 pt-4">
      {/* Not a `fieldset`/`legend`: each roster row is already its own native
          radio group with its own accessible name, so the wrapper would only
          add a second grouping announcement around them. */}
      <div className="space-y-2">
        <p className="text-sm font-medium leading-none">
          {t("attendanceLegend")}
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {t("attendanceMarkedCount", { marked, total })}
          </span>
        </p>
        {/* Always rendered, never conditional on the sheet's state: a hint that
            appeared the moment you started marking would reflow the notes below
            it while the gedu was working. What it says is now only the two
            things a gedu cannot discover by looking — that a second press
            clears a mark, and that a half-finished sheet may be saved. */}
        <p className="text-xs text-muted-foreground">
          {t("attendanceRevertHint")}
        </p>
        <div className="pt-1">
          <AttendanceRoster
            roster={roster}
            attendance={draft.attendance}
            disabled={committing}
            onMark={markGamer}
          />
        </div>
      </div>

      {/* One title per box, naming the field and its audience together, so the
          words a writer reads are attached to the thing they are typing into.
          The public field is not the afterthought: this is the one whose
          mistakes reach every parent in the group. */}
      <FamilyNoteBlock audienceStatedByField>
        <RichNoteField
          label={t("reportTitle")}
          icon={Eye}
          hint={t("reportFormattingHint")}
          placeholder={t("reportPlaceholder")}
          value={initialState.report}
          seed={opens}
          ready={opens > 0}
          disabled={committing}
          onChange={(report) => setDraft((d) => ({ ...d, report }))}
        />
      </FamilyNoteBlock>

      {/* Directly under the report and above the gedu note, which is where the
          collapsed card puts the same photos: the two things families read sit
          together, in one order, whether the card is open or shut. */}
      {photoStrip}

      {/* The gedu note keeps the recessed treatment while it is being
          *written*, not only while it is read: the whole risk of a two-audience
          field is somebody typing for one and picturing the other. */}
      <StaffNoteBlock audienceStatedByField>
        <RichNoteField
          label={t("staffNoteTitle")}
          icon={Lock}
          hint={t("staffNoteHint")}
          placeholder={t("staffNotePlaceholder")}
          value={initialState.staffNote}
          seed={opens}
          ready={opens > 0}
          disabled={committing}
          onChange={(staffNote) => setDraft((d) => ({ ...d, staffNote }))}
        />
      </StaffNoteBlock>

      <EditorActionRow
        committing={committing}
        error={error}
        onCancel={onCancel}
        onSave={handleSave}
      />
    </div>
  );
}

/**
 * The Cancel/Save row both session editors end on, with the failure line above
 * it.
 *
 * **The error sits above the buttons, not below them.** It is the answer to the
 * click that was just made, and the eye is already at the bottom of the editor;
 * putting it under the row would leave it below the fold of a collapsible
 * region on the exact card somebody is trying to save. Nothing else moves when
 * it appears: the editor grows downward inside its own region, which the reader
 * asked for by pressing Save.
 */
export function EditorActionRow({
  committing,
  error,
  onCancel,
  onSave,
}: {
  committing: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div className="space-y-2">
      {error !== null && (
        <p role="alert" className="text-right text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={committing}
          onClick={onCancel}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={committing}
          onClick={onSave}
          className="gap-1.5"
        >
          {committing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
