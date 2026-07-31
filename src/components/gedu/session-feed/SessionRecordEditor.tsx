"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { attendanceTally, draftFromEditorState } from "./entry-state";
import { AttendanceRoster } from "./AttendanceRoster";
import { CollapsibleRegion } from "./CollapsibleRegion";
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
   * stays mounted while collapsed (that's what gives the close its animation),
   * so it re-seeds its draft from `initialState` on each opening — otherwise a
   * cancelled edit would still be sitting there the next time it opened.
   */
  open: boolean;
  roster: readonly SessionFeedGamer[];
  initialState: SessionEditorState;
  onCancel: () => void;
  onSave: (draft: SessionRecordDraft) => void;
}

/**
 * The inline session editor: the attendance sheet, the public note families
 * will read, the gedu-only note they won't, and the "this session didn't run"
 * escape hatch.
 *
 * **Save is always available, and a half-marked roster saves as itself.** It
 * used to be gated on every child having an answer, on the reasoning that a
 * partial sheet is ambiguous — but the sheet was never the ambiguous thing, the
 * *storage* was, and that is fixed at the model instead: marks are kept per
 * child, so an unmarked child stays unmarked rather than being padded into an
 * absence. What the gate actually did was throw away the work of a gedu who got
 * interrupted three children in. Now they save what they have, the entry keeps
 * saying it needs attention, and they come back to five rows instead of eight.
 * Both notes stay optional — attendance is what the gedu is paid on, a write-up
 * is a nicety.
 *
 * **There is deliberately no "mark all present" shortcut**, and its absence is
 * the point rather than an omission. One button that fills the whole sheet is
 * one button that fills the whole sheet *without anyone looking at the room* —
 * and since this record is what the gedu is paid on, the cheapest possible way
 * to produce it must not also be the least honest one. Marking eight children
 * individually is a few seconds of friction bought on purpose.
 *
 * Two things drive the layout. First, the didn't-run toggle sits at the very
 * top and the Save/Cancel row at the very bottom, with the two swappable field
 * groups animating between them — so flipping the toggle grows and shrinks the
 * middle rather than yanking the controls the user just clicked. Second, the
 * gedu note keeps the same recessed padlocked treatment while it is being
 * *written* as it has when it is read, so the gedu can see which audience they
 * are typing for without having to remember.
 *
 * Both branches of the toggle keep their state alive: ticking "didn't run" and
 * ticking it back returns a half-written note intact.
 */
export function SessionRecordEditor({
  open,
  roster,
  initialState,
  onCancel,
  onSave,
}: SessionRecordEditorProps) {
  const t = useTranslations("gedu.sessionFeed");
  const fieldId = useId();
  const [draft, setDraft] = useState<SessionEditorState>(initialState);

  // Re-seed on open, using React's documented "adjust state during render"
  // pattern rather than an effect — the reset lands in the same commit as the
  // expansion, so the editor never paints one frame of the stale draft.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initialState);
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
    // rendered inside a collapsible region, which has to clip its overflow for
    // the open/close animation to work.
    <div className="space-y-4 pb-1 pt-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={draft.didNotRun}
          onChange={(e) =>
            setDraft((d) => ({ ...d, didNotRun: e.target.checked }))
          }
        />
        {t("didNotRunLabel")}
      </label>

      <CollapsibleRegion open={!draft.didNotRun}>
        <div className="space-y-4">
          {/* Not a `fieldset`/`legend`: each roster row is already its own
              native radio group with its own accessible name, so the wrapper
              would only add a second grouping announcement around them. */}
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">
              {t("attendanceLegend")}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                {t("attendanceMarkedCount", { marked, total })}
              </span>
            </p>
            {/* Always rendered, never conditional on the sheet's state: a hint
                that appeared the moment you started marking would reflow the
                notes below it while the gedu was working. What it says is now
                only the two things a gedu cannot discover by looking — that a
                second press clears a mark, and that a half-finished sheet is
                allowed to be saved. */}
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

          <Field
            label={t("publicNoteLabel")}
            htmlFor={`${fieldId}-public`}
            optional
            hint={t("publicNoteHint")}
          >
            <Textarea
              id={`${fieldId}-public`}
              rows={5}
              value={draft.publicNote}
              placeholder={t("publicNotePlaceholder")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, publicNote: e.target.value }))
              }
            />
          </Field>

          <StaffNoteBlock>
            <Field
              label={t("staffNoteFieldLabel")}
              htmlFor={`${fieldId}-staff`}
              optional
              hint={t("staffNoteHint")}
            >
              <Textarea
                id={`${fieldId}-staff`}
                rows={3}
                value={draft.staffNote}
                placeholder={t("staffNotePlaceholder")}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, staffNote: e.target.value }))
                }
              />
            </Field>
          </StaffNoteBlock>
        </div>
      </CollapsibleRegion>

      <CollapsibleRegion open={draft.didNotRun}>
        <Field
          label={t("skipReasonLabel")}
          htmlFor={`${fieldId}-reason`}
          optional
          hint={t("skipReasonHint")}
        >
          <Input
            id={`${fieldId}-reason`}
            value={draft.skipReason}
            placeholder={t("skipReasonPlaceholder")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, skipReason: e.target.value }))
            }
          />
        </Field>
      </CollapsibleRegion>

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
