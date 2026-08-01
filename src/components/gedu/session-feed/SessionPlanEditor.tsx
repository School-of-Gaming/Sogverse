"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { planDraftFromEditorState } from "./entry-state";
import { RichNoteField } from "./RichNoteField";
import { StaffNoteBlock } from "./StaffNoteBlock";
import type { SessionPlanDraft, SessionPlanEditorState } from "./types";

interface SessionPlanEditorProps {
  /**
   * Whether the entry around this editor is expanded. It stays mounted while
   * collapsed — the close is instant here, chased by a scroll correction that
   * cannot follow a transition, so staying mounted is what keeps the fields
   * alive rather than what gives them an animation. It therefore re-seeds its
   * draft on each opening, or a cancelled edit would still be sitting there next
   * time.
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
 * Both fields are technically optional and neither says so — a marker there
 * would read as permission to skip the only two things this editor exists for.
 * The Save/Cancel row stays pinned at the bottom so neither field growing under
 * the writer moves it.
 */
export function SessionPlanEditor({
  open,
  initialState,
  onCancel,
  onSave,
}: SessionPlanEditorProps) {
  const t = useTranslations("gedu.sessionFeed");
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
      <RichNoteField
        label={t("reportLabel")}
        hint={t("reportFormattingHint")}
        placeholder={t("reportPlaceholder")}
        value={initialState.report}
        seed={opens}
        ready={opens > 0}
        onChange={(report) => setDraft((d) => ({ ...d, report }))}
      />

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
