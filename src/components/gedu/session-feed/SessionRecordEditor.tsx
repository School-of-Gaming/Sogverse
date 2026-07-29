"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { attendanceCounts, draftFromEditorState } from "./entry-state";
import { CollapsibleRegion } from "./CollapsibleRegion";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type {
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
 * The inline write-up editor: attendance checklist, the public note families
 * will read, the staff-only note they won't, and the "this session didn't run"
 * escape hatch.
 *
 * Two things drive the layout. First, the didn't-run toggle sits at the very
 * top and the Save/Cancel row at the very bottom, with the two swappable field
 * groups animating between them — so flipping the toggle grows and shrinks the
 * middle rather than yanking the controls the user just clicked. Second, the
 * staff note keeps the same recessed padlocked treatment while it is being
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

  const presentSet = new Set(draft.presentGamerIds);
  const { present, total } = attendanceCounts(roster, draft.presentGamerIds);

  const toggleGamer = (gamerId: string, isPresent: boolean) => {
    setDraft((d) => ({
      ...d,
      presentGamerIds: isPresent
        ? [...d.presentGamerIds, gamerId]
        : d.presentGamerIds.filter((id) => id !== gamerId),
    }));
  };

  return (
    <div className="space-y-4 pt-4">
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">
              {t("attendanceLegend")}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">
                {t("attendanceSummary", { present, total })}
              </span>
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
              {roster.map((gamer) => (
                <label
                  key={gamer.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={presentSet.has(gamer.id)}
                    onChange={(e) => toggleGamer(gamer.id, e.target.checked)}
                  />
                  {gamer.firstName}
                </label>
              ))}
            </div>
          </fieldset>

          <Field
            label={t("publicNoteLabel")}
            htmlFor={`${fieldId}-public`}
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
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(draftFromEditorState(draft))}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
