"use client";

import { useId, useState, type ReactNode } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  CollapsibleRegion,
  StaffNoteBlock,
} from "@/components/gedu/session-feed";

/** A pair of standing notes: one families read, one only Gedus and admins do. */
export interface TwoAudienceNotesDraft {
  publicNote: string;
  staffNote: string;
}

/**
 * Every string the panel renders. Passed in rather than read from a namespace
 * so one component can serve scopes whose copy differs entirely — a note about
 * *this group* and a note about *the building* are not the same sentence with a
 * word swapped, and pretending otherwise would produce copy that is vague in
 * both places.
 */
export interface TwoAudienceNotesCopy {
  heading: string;
  /** Label on the affordance when there is nothing written yet. */
  add: string;
  edit: string;
  cancel: string;
  save: string;
  emptyHint: string;
  publicLabel: string;
  publicHint: string;
  publicPlaceholder: string;
  staffLabel: string;
  staffHint: string;
  staffPlaceholder: string;
}

interface TwoAudienceNotesPanelProps {
  copy: TwoAudienceNotesCopy;
  /**
   * Always-visible line under the heading — the place to say who else this note
   * belongs to. Deliberately outside both collapsing regions: a caveat about
   * the *scope* of what you are about to edit is worthless if it disappears the
   * moment you open the editor.
   */
  caption?: ReactNode;
  /** Always-visible read-only detail under the caption, e.g. a street address. */
  intro?: ReactNode;
  publicNote: string | null;
  staffNote: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (draft: TwoAudienceNotesDraft) => void;
}

/**
 * The standing-notes panel: a public note, a Gedu-only note, and one inline
 * editor for both.
 *
 * These are deliberately not session notes. A session note answers "what
 * happened on this date"; these answer "what should anyone know about this
 * thing at all" — how the shared world works, who the siblings are, which door
 * the group comes in through. There is no free-floating "post to the club"
 * action anywhere in the feed, so panels like this are the one home for
 * information that isn't anchored to an occurrence, and they read *before* the
 * sessions do because they are the context those sessions happen in.
 *
 * The public note is rendered first and unadorned because it is the one families
 * will eventually read; the Gedu note sits beneath it in the padlocked recessed
 * treatment so the two audiences can never be misread for each other. That
 * split is the same everywhere, and for the same reason: a Gedu note written
 * under an assumption of privacy can never be retro-published, so it wears the
 * padlocked treatment both when read and while being written, and the two are
 * never one field.
 *
 * Interaction grammar mirrors the session editor exactly, so a Gedu learns it
 * once: the header row with the pencil never moves, the display body and the
 * editor are sibling collapsing regions *below* it, and opening grows the panel
 * downward rather than sliding the pencil out from under the cursor. An empty
 * scope gets a quiet "add a note" affordance rather than an empty box shouting
 * for input — most groups genuinely have nothing standing to say.
 *
 * **Neither field is marked "(optional)"**, though both are. On a gedu surface
 * the marker reads as permission: it lands on somebody at the exact moment they
 * are deciding whether to bother writing the thing, and tells them nobody
 * minds. Every field on this side of the product drops it.
 *
 * **Both stay plain text**, unlike the session-level notes beside them, which
 * are markdown. That is a deliberate stopping point rather than an oversight:
 * this panel serves two scopes with one component and stores whatever it is
 * given, so making it rich means the group note, the site note and both of
 * their public halves all become markdown at once — four fields, two of them
 * family-facing, on a schema that has not been asked about it. A standing note
 * is also a paragraph about how a room works, not a write-up with sections.
 *
 * It is presentational to the bone: it owns the text being typed and nothing
 * else. Which scope it is describing, what the strings say, and where a save
 * goes are all the caller's.
 */
export function TwoAudienceNotesPanel({
  copy,
  caption,
  intro,
  publicNote,
  staffNote,
  editing,
  onEditingChange,
  onSave,
}: TwoAudienceNotesPanelProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<TwoAudienceNotesDraft>({
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

  // No divider or top padding of its own: the panel is a whole section of the
  // card it sits in, so its header row *is* that section's heading row.
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {copy.heading}
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
          {isEmpty ? copy.add : copy.edit}
        </Button>
      </div>

      {caption}
      {intro}

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
            <p className="text-sm text-muted-foreground">{copy.emptyHint}</p>
          )}
        </div>
      </CollapsibleRegion>

      <CollapsibleRegion open={editing}>
        {/* `pb-1` gives the Save row's focus ring room: a collapsible region
            has to clip its overflow for the open/close animation to work. */}
        <div className="space-y-4 pb-1 pt-3">
          <Field
            label={copy.publicLabel}
            htmlFor={`${fieldId}-public`}
            hint={copy.publicHint}
          >
            <Textarea
              id={`${fieldId}-public`}
              rows={4}
              value={draft.publicNote}
              placeholder={copy.publicPlaceholder}
              onChange={(e) =>
                setDraft((d) => ({ ...d, publicNote: e.target.value }))
              }
            />
          </Field>

          <StaffNoteBlock>
            <Field
              label={copy.staffLabel}
              htmlFor={`${fieldId}-staff`}
              hint={copy.staffHint}
            >
              <Textarea
                id={`${fieldId}-staff`}
                rows={3}
                value={draft.staffNote}
                placeholder={copy.staffPlaceholder}
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
              {copy.cancel}
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
              {copy.save}
            </Button>
          </div>
        </div>
      </CollapsibleRegion>
    </div>
  );
}
