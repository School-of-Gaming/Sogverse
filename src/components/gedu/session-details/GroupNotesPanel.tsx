"use client";

import { useId, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  CollapsibleRegion,
  StaffNoteBlock,
} from "@/components/gedu/session-feed";

/** The two standing notes a group carries, independent of any session. */
export interface GroupNotesDraft {
  publicNote: string;
  staffNote: string;
}

interface GroupNotesPanelProps {
  publicNote: string | null;
  staffNote: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (draft: GroupNotesDraft) => void;
}

/**
 * The group's **standing** notes — a full-width row directly under the page's
 * masthead, above the point where the workspace splits into columns.
 *
 * These are deliberately not session notes. A session note answers "what
 * happened on this date"; these answer "what should anyone know about this
 * group at all" — how the shared world works, who the siblings are, which
 * laptop has bad audio. There is no free-floating "post to the club" action
 * anywhere in the feed, so this panel is the one home for information that isn't
 * anchored to an occurrence, and it reads *before* the sessions do because it is
 * the context they happen in.
 *
 * The public note is rendered first and unadorned because it is the one families
 * will eventually read; the gedu note sits beneath it in the padlocked recessed
 * treatment so the two audiences can never be misread for each other.
 *
 * The same two-audience split as everywhere else, and for the same reason: a
 * gedu note written under an assumption of privacy can never be retro-published,
 * so it wears the padlocked recessed treatment both when read and while being
 * written, and the two are never one field.
 *
 * Interaction grammar mirrors the session editor exactly, so a gedu learns it
 * once: the header row with the pencil never moves, the display body and the
 * editor are sibling collapsing regions *below* it, and opening grows the panel
 * downward rather than sliding the pencil out from under the cursor. An empty
 * group gets a quiet "add a note" affordance rather than an empty box shouting
 * for input — most groups genuinely have nothing standing to say.
 */
export function GroupNotesPanel({
  publicNote,
  staffNote,
  editing,
  onEditingChange,
  onSave,
}: GroupNotesPanelProps) {
  const t = useTranslations("gedu.groupNotes");
  const fieldId = useId();
  const [draft, setDraft] = useState<GroupNotesDraft>({
    publicNote: publicNote ?? "",
    staffNote: staffNote ?? "",
  });

  // Re-seed on open with React's "adjust state during render" pattern, so a
  // cancelled edit is gone the next time the editor opens and no frame of the
  // stale draft is ever painted.
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      setDraft({ publicNote: publicNote ?? "", staffNote: staffNote ?? "" });
    }
  }

  const hasPublic = publicNote !== null && publicNote.length > 0;
  const hasStaff = staffNote !== null && staffNote.length > 0;
  const isEmpty = !hasPublic && !hasStaff;

  // No divider or top padding of its own: the panel is the whole body of the
  // card it sits in, so its header row *is* the card's heading row.
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("heading")}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEditingChange(!editing)}
          aria-expanded={editing}
          className="-my-1 gap-1.5"
        >
          {isEmpty ? (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          )}
          {isEmpty ? t("add") : t("edit")}
        </Button>
      </div>

      <CollapsibleRegion open={!editing}>
        <div className="space-y-3 pt-2">
          {hasPublic && (
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {publicNote}
            </p>
          )}
          {hasStaff && (
            <StaffNoteBlock>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {staffNote}
              </p>
            </StaffNoteBlock>
          )}
          {isEmpty && (
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
          )}
        </div>
      </CollapsibleRegion>

      <CollapsibleRegion open={editing}>
        {/* `pb-1` gives the Save row's focus ring room: a collapsible region
            has to clip its overflow for the open/close animation to work. */}
        <div className="space-y-4 pb-1 pt-3">
          <Field
            label={t("publicLabel")}
            htmlFor={`${fieldId}-public`}
            optional
            hint={t("publicHint")}
          >
            <Textarea
              id={`${fieldId}-public`}
              rows={4}
              value={draft.publicNote}
              placeholder={t("publicPlaceholder")}
              onChange={(e) =>
                setDraft((d) => ({ ...d, publicNote: e.target.value }))
              }
            />
          </Field>

          <StaffNoteBlock>
            <Field
              label={t("staffLabel")}
              htmlFor={`${fieldId}-staff`}
              optional
              hint={t("staffHint")}
            >
              <Textarea
                id={`${fieldId}-staff`}
                rows={3}
                value={draft.staffNote}
                placeholder={t("staffPlaceholder")}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, staffNote: e.target.value }))
                }
              />
            </Field>
          </StaffNoteBlock>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditingChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                onSave({
                  publicNote: draft.publicNote.trim(),
                  staffNote: draft.staffNote.trim(),
                })
              }
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </CollapsibleRegion>
    </div>
  );
}
