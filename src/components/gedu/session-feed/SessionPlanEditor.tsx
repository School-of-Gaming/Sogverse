"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { planDraftFromEditorState } from "./entry-state";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type { SessionPlanDraft, SessionPlanEditorState } from "./types";

interface SessionPlanEditorProps {
  /**
   * Whether the entry around this editor is expanded. It stays mounted while
   * collapsed (that is what gives the close its animation), so it re-seeds its
   * draft on each opening — otherwise a cancelled edit would still be sitting
   * there next time.
   */
  open: boolean;
  initialState: SessionPlanEditorState;
  onCancel: () => void;
  onSave: (draft: SessionPlanDraft) => void;
}

/**
 * The planning editor for a session that hasn't happened yet: what the gedu
 * intends to do, a reminder for the team, and "I can't run this one".
 *
 * Deliberately **not** the write-up editor with half its fields hidden. There is
 * no attendance checklist and no didn't-run toggle, because neither can be true
 * of a session in the future — attendance is a record and the whole reason it
 * doubles as pay confirmation is that it describes something that actually
 * happened. Offering either here would invite a gedu to pre-tick a room full of
 * children who haven't turned up yet.
 *
 * The substitute request sits at the top, above the notes, because it is the one
 * field with a reader other than the gedu themselves: it is a message to admins
 * and peers, and burying it under two textareas would make it feel optional. The
 * Save/Cancel row stays pinned at the bottom so neither field growing moves it.
 */
export function SessionPlanEditor({
  open,
  initialState,
  onCancel,
  onSave,
}: SessionPlanEditorProps) {
  const t = useTranslations("gedu.sessionFeed");
  const fieldId = useId();
  const [draft, setDraft] = useState<SessionPlanEditorState>(initialState);

  // Re-seed on open using React's documented "adjust state during render"
  // pattern rather than an effect, so the reset lands in the same commit as the
  // expansion and no frame of the stale draft is ever painted.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initialState);
  }

  return (
    <div className="space-y-4 pt-4">
      <label className="flex cursor-pointer items-start gap-2 text-sm font-medium">
        <Checkbox
          checked={draft.needsSubstitute}
          onChange={(e) =>
            setDraft((d) => ({ ...d, needsSubstitute: e.target.checked }))
          }
        />
        <span>
          {t("needsSubstituteLabel")}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {t("needsSubstituteHint")}
          </span>
        </span>
      </label>

      <Field
        label={t("plannedPublicNoteLabel")}
        htmlFor={`${fieldId}-public`}
        optional
        hint={t("plannedPublicNoteHint")}
      >
        <Textarea
          id={`${fieldId}-public`}
          rows={4}
          value={draft.publicNote}
          placeholder={t("plannedPublicNotePlaceholder")}
          onChange={(e) =>
            setDraft((d) => ({ ...d, publicNote: e.target.value }))
          }
        />
      </Field>

      <StaffNoteBlock>
        <Field
          label={t("plannedStaffNoteLabel")}
          htmlFor={`${fieldId}-staff`}
          optional
          hint={t("plannedStaffNoteHint")}
        >
          <Textarea
            id={`${fieldId}-staff`}
            rows={3}
            value={draft.staffNote}
            placeholder={t("plannedStaffNotePlaceholder")}
            onChange={(e) =>
              setDraft((d) => ({ ...d, staffNote: e.target.value }))
            }
          />
        </Field>
      </StaffNoteBlock>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(planDraftFromEditorState(draft))}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
