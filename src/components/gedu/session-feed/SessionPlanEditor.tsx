"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
 * intends to do, and a reminder for whoever runs it.
 *
 * Deliberately **not** the write-up editor with half its fields hidden. There is
 * no attendance sheet and no didn't-run toggle, because neither can be true of a
 * session in the future — attendance is a record, and the whole reason it
 * doubles as pay confirmation is that it describes something that actually
 * happened. Offering either here would invite a gedu to pre-mark a room full of
 * children who haven't turned up yet.
 *
 * Both fields are optional; the Save/Cancel row stays pinned at the bottom so
 * neither textarea growing moves it.
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
    // `pb-1` leaves the Save row's focus ring somewhere to land — this editor
    // renders inside a collapsible region, which clips its overflow so the
    // open/close animation has something to reveal.
    <div className="space-y-4 pb-1 pt-4">
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
