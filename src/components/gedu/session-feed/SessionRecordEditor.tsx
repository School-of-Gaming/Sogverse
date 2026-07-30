"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  allPresentMarks,
  attendanceProgress,
  draftFromEditorState,
} from "./entry-state";
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
 * The inline write-up editor: the attendance sheet, the public note families
 * will read, the gedu-only note they won't, and the "this session didn't run"
 * escape hatch.
 *
 * **Attendance is the mandatory half and Save enforces it.** Every roster member
 * has to be explicitly present or absent before the button enables, because that
 * rule is the only thing that makes the stored record mean anything: without it
 * a half-filled sheet saves as "two present, six absent" and nobody can tell it
 * apart from a room where six children genuinely didn't turn up. Both notes stay
 * optional — attendance is what the gedu is paid on, a write-up is a nicety.
 * "Mark all present" keeps the common case (a full house) to one action, so the
 * rule costs a click rather than eight.
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

  const { marked, total, complete } = attendanceProgress(
    roster,
    draft.attendance,
  );
  // An empty roster has nothing to mark, so it can't be what blocks a save.
  const canSave = draft.didNotRun || complete;

  const markGamer = (gamerId: string, mark: AttendanceMark) => {
    setDraft((d) => ({
      ...d,
      attendance: { ...d.attendance, [gamerId]: mark },
    }));
  };

  const handleSave = () => {
    const record = draftFromEditorState(draft, roster);
    if (record !== null) onSave(record);
  };

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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-sm font-medium leading-none">
                {t("attendanceLegend")}
                <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                  {t("attendanceMarkedCount", { marked, total })}
                </span>
              </p>
              {roster.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({ ...d, attendance: allPresentMarks(roster) }))
                  }
                >
                  {t("markAllPresent")}
                </Button>
              )}
            </div>
            {/* Always rendered, never conditional on the sheet being
                incomplete: a hint that appears the moment you start marking
                would reflow the notes below it while the gedu is working. */}
            <p className="text-xs text-muted-foreground">
              {t("attendanceRequiredHint")}
            </p>
            <div className="pt-1">
              <AttendanceRoster
                roster={roster}
                attendance={draft.attendance}
                namePrefix={`${fieldId}-attendance`}
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
        <Button type="button" size="sm" disabled={!canSave} onClick={handleSave}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
