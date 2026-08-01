"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { planDraftFromEditorState } from "./entry-state";
import { SessionReportField } from "./SessionReportField";
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
 * The editor for a session that hasn't happened yet: its two notes, and nothing
 * else.
 *
 * There is no attendance sheet and no didn't-run toggle, because neither can be
 * true of a session in the future — attendance is a record, and the whole reason
 * it doubles as pay confirmation is that it describes something that actually
 * happened. Offering either here would invite a gedu to pre-mark a room full of
 * children who haven't turned up yet.
 *
 * **The two fields are labelled exactly as the past editor labels them**,
 * and that is deliberate rather than lazy. A note is a note: the same field, the
 * same audience, the same box — the only thing that changes is which side of the
 * session it was typed on. Giving the future one its own "planned" vocabulary
 * made a gedu writing on Sunday about Monday believe they were filling in a
 * different field from the one they would open on Tuesday, and left every
 * caller deciding which set of words a session sitting on today's date deserved.
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
  // Doubles as the rich editor's remount key and, at zero, as the signal that
  // this entry has never been opened and needs no editor instance yet.
  const [opens, setOpens] = useState(open ? 1 : 0);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialState);
      setOpens((n) => n + 1);
    }
  }

  return (
    // `pb-1` leaves the Save row's focus ring somewhere to land — this editor
    // renders inside a collapsible region, which clips its overflow so the
    // open/close animation has something to reveal.
    <div className="space-y-4 pb-1 pt-4">
      <SessionReportField
        value={initialState.report}
        seed={opens}
        ready={opens > 0}
        onChange={(report) => setDraft((d) => ({ ...d, report }))}
      />

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
