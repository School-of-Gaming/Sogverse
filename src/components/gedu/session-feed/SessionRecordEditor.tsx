"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { attendanceTally, draftFromEditorState } from "./entry-state";
import { AttendanceRoster } from "./AttendanceRoster";
import { RichNoteField } from "./RichNoteField";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type {
  AttendanceMark,
  SessionEditorState,
  SessionFeedGamer,
  SessionRecordDraft,
} from "./types";

interface SessionRecordEditorProps {
  /**
   * Whether the entry around this editor is currently expanded. The editor
   * stays mounted while collapsed, so it re-seeds its draft on each opening —
   * otherwise a cancelled edit would still be sitting there the next time it
   * opened.
   */
  open: boolean;
  roster: readonly SessionFeedGamer[];
  initialState: SessionEditorState;
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
 * The Save/Cancel row is pinned at the bottom, so neither field growing under
 * the writer moves the buttons they are heading for.
 */
export function SessionRecordEditor({
  open,
  roster,
  initialState,
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
            onMark={markGamer}
          />
        </div>
      </div>

      <RichNoteField
        label={t("reportLabel")}
        hint={t("reportFormattingHint")}
        placeholder={t("reportPlaceholder")}
        value={initialState.report}
        seed={opens}
        ready={opens > 0}
        onChange={(report) => setDraft((d) => ({ ...d, report }))}
      />

      {/* The gedu note keeps the padlocked recessed treatment while it is being
          *written*, not only while it is read: the whole risk of a two-audience
          field is somebody typing for one and picturing the other. */}
      <StaffNoteBlock>
        <RichNoteField
          label={t("staffNoteFieldLabel")}
          hint={t("staffNoteHint")}
          placeholder={t("staffNotePlaceholder")}
          value={initialState.staffNote}
          seed={opens}
          ready={opens > 0}
          onChange={(staffNote) => setDraft((d) => ({ ...d, staffNote }))}
        />
      </StaffNoteBlock>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" onClick={handleSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
