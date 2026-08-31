"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  CollapsibleRegion,
  FamilyNoteBlock,
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
  edit: string;
  cancel: string;
  save: string;
  /**
   * Ghost line standing in for an unwritten public note. It renders bare, with
   * no banner above it, so it has to **name the audience itself** — it is the
   * only thing on screen saying who that half is for.
   *
   * **Read-only panels render no ghost at all** — see {@link
   * TwoAudienceNotesPanelProps.onSave}. An imperative shown to somebody who
   * cannot act on it is an instruction with nothing behind it.
   *
   * Both ghosts are worded as **imperatives** ("Add a note…"), and that mood is
   * load-bearing: visually a ghost differs from a saved note only by italics,
   * so the imperative is the one cue a screen reader gets that this is an
   * invitation rather than content. A rewording or translation that drifts
   * into a descriptive phrasing removes that cue. Each ghost also deliberately
   * echoes its scope's editor placeholder — keep the pair in step when either
   * is edited.
   */
  publicEmpty: string;
  /**
   * Ghost line standing in for an unwritten Gedu note. It renders inside the
   * padlocked block, which states the audience, so this says what belongs there
   * rather than restating who reads it. Same imperative-mood and
   * placeholder-pairing constraints as {@link publicEmpty}.
   */
  staffEmpty: string;
  publicLabel: string;
  publicHint: string;
  publicPlaceholder: string;
  staffLabel: string;
  staffHint: string;
  staffPlaceholder: string;
  /** One line for a refused save. Scope-specific, like everything else here. */
  saveFailed: string;
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
  /**
   * A quiet link in the header row, left of the pencil — the way *out* of this
   * panel to wherever the thing it describes is actually edited.
   *
   * A node rather than an href, because the panel has no business knowing which
   * route a scope's record lives on or what to call it; the caller builds the
   * link and this decides only where it sits. It is left of the pencil because
   * the pencil is this panel's own action and the link leaves for another page:
   * primary rightmost, the app-wide button order in a header row.
   */
  headerLink?: ReactNode;
  /**
   * Fields at the **head of the editor**, for a scope whose caller can write
   * more than the two notes.
   *
   * A function rather than a node, because the one thing these fields cannot
   * own is whether they are usable: the round trip belongs to this panel, so it
   * hands `disabled` down and every control in here honours it, exactly as the
   * two textareas do. Everything else about them — their labels, their drafts,
   * what a Save does with them — is the caller's, and a caller with nothing
   * extra to offer passes nothing and gets the editor it always had.
   *
   * They render **inside** the editor's collapsing region, so they exist only
   * while it is open and there is still one Save for whatever it holds.
   */
  editorFields?: (state: { disabled: boolean }) => ReactNode;
  /**
   * Why this draft cannot be saved yet, or `null` when it can.
   *
   * Non-null disables Save **and says so in words** in the line above it. A
   * greyed button with no explanation is the failure mode this exists to avoid:
   * the one thing worse than refusing a save is refusing it silently, which is
   * what closing the editor over a discarded field would do.
   */
  saveBlockedReason?: string | null;
  publicNote: string | null;
  staffNote: string | null;
  /**
   * Whether the editor is open. Owned by the caller — the panel never owns it.
   *
   * Required in spirit whenever {@link onSave} is supplied, and meaningless
   * without it: a read-only panel has nothing to open, so a caller in that mode
   * omits both this and {@link onEditingChange}.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /**
   * Persist both notes. **Awaited**: the panel greys itself out for the round
   * trip, closes only once the write has landed, and on a rejection stays open
   * with both textareas exactly as they were. A synchronous handler resolves
   * immediately and the panel behaves as it always did.
   *
   * **Omitted, the panel is a pure view of what is stored.** No pencil, no
   * editor region, no ghosts — nothing that invites or accepts a change is
   * rendered at all, rather than rendered disabled. That is the difference
   * between "you may not write this here" and "this is broken", and a panel
   * reached from a page with no claim on the record has to say the first: the
   * way to change it is {@link headerLink}, which goes to the page that does.
   */
  onSave?: (draft: TwoAudienceNotesDraft) => void | Promise<void>;
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
 * downward rather than sliding the pencil out from under the cursor.
 *
 * **The display state always renders both slots, with a greyed ghost line
 * standing in for whichever note has no content.** This reverses an earlier
 * decision — an empty scope used to get one quiet "add a note" line and a `+`
 * button, on the reasoning that most groups have nothing standing to say — and
 * it was reversed on Gedus telling us they never discovered there were two
 * notes at all. The structure was invisible until the editor was open, so the
 * feature was invisible to anyone who never opened it. Mirroring the filled
 * shape is what teaches the split: the ghosts show that there are two places to
 * write, the bare public ghost names the audience it is for, and the staff
 * ghost sits *inside* the padlocked block so the banner — the lock beside the
 * session feed's "Gedus and admins" label — carries the privacy half of the
 * lesson rather than a sentence claiming it. That is why the staff ghost must
 * never be rendered beside the block instead of within it. Ghosts are italic
 * as well as muted, because the real Gedu note is muted too and nothing here
 * may read as saved content that is not.
 *
 * The pencil follows from that: there is no "empty" state to have a different
 * affordance for, so the header control is always Edit.
 *
 * **All of which is true of an *editable* panel, and a panel with no `onSave` is
 * not one.** There, nothing that invites or accepts a change is rendered — no
 * pencil, no editor region, and no ghosts, because a ghost is an imperative and
 * the two reasons for one (teach that the split exists, offer somewhere to
 * write) both need an editor behind them. It is deliberately not a disabled
 * editor: greyed-out controls say "you may not do this *now*", where the honest
 * message is that this page is not where the thing is written. The way to write
 * it is `headerLink`, which goes to the page that is.
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
 * **A save in flight greys both fields and both buttons, and never drops what
 * was typed.** The panel closes only once the write has landed; a refused one
 * leaves it open, re-enabled, with the text untouched and one line saying so.
 * That matters more here than almost anywhere else on the page, because the
 * site scope's fields are shared by every product in that building — retyping two
 * paragraphs somebody had just finished is a good way to get them typed
 * shorter the second time.
 *
 * **A scope may put more than two notes behind that one Save.** The site scope
 * does: a site's name and address are fields of the same record the notes hang
 * off, so a caller that may write them hands them in through `editorFields`,
 * and they open, grey out and close *with* the notes rather than beside them.
 * What the panel keeps either way is the grammar — one pencil, one open editor,
 * one Save, one line when it refuses — and a scope with nothing extra to offer
 * never learns the option exists.
 *
 * It owns the text being typed, whether a save is in the air, and nothing else.
 * Which scope it is describing, what the strings say, what else rides along in
 * the editor, and where a save goes are all the caller's.
 */
export function TwoAudienceNotesPanel({
  copy,
  caption,
  intro,
  headerLink,
  editorFields,
  saveBlockedReason = null,
  publicNote,
  staffNote,
  editing = false,
  onEditingChange,
  onSave,
}: TwoAudienceNotesPanelProps) {
  const fieldId = useId();

  /**
   * **The whole capability, and it is one question: was a save supplied?**
   *
   * Everything downstream reads `editable` rather than asking who is looking —
   * the pencil, the editor region, the ghosts, and whether an `editing` prop
   * means anything at all. A read-only caller that still passed `editing` (an
   * old call site, a scene) is answered here rather than opening an editor with
   * no Save behind it.
   */
  const editable = onSave !== undefined;
  const isEditing = editable && editing;
  const [draft, setDraft] = useState<TwoAudienceNotesDraft>({
    publicNote: publicNote ?? "",
    staffNote: staffNote ?? "",
  });
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed on open with React's "adjust state during render" pattern, so a
  // cancelled edit is gone the next time the editor opens and no frame of the
  // stale draft is ever painted. A stale failure message goes with it.
  const [wasEditing, setWasEditing] = useState(isEditing);
  if (isEditing !== wasEditing) {
    setWasEditing(isEditing);
    if (isEditing) {
      setDraft({ publicNote: publicNote ?? "", staffNote: staffNote ?? "" });
      setError(null);
    }
  }

  // A live blocked reason takes the error's slot below, so an error standing
  // behind one is an error nobody is being shown — and it would reappear the
  // moment the block lifted, describing an attempt from two edits ago. Clearing
  // it as the block arrives is what keeps that slot honest. No previous-value
  // tracker: the condition is self-cancelling, and Save is unreachable while a
  // reason is live, so nothing can set an error the block is meant to preserve.
  if (saveBlockedReason !== null && error !== null) setError(null);

  /**
   * `committing` is flipped **before** the caller's write is reached, so no
   * render between the click and the disabled state can leave Save clickable.
   * It is cleared on the failure path — where the gedu needs it back — and in
   * the same commit as the close, where the region shuts around it anyway.
   */
  const handleSave = async () => {
    if (onSave === undefined) return;
    setError(null);
    setCommitting(true);
    try {
      await onSave({
        publicNote: draft.publicNote.trim(),
        staffNote: draft.staffNote.trim(),
      });
    } catch {
      setCommitting(false);
      setError(copy.saveFailed);
      return;
    }
    setCommitting(false);
    onEditingChange?.(false);
  };

  const hasPublic = publicNote !== null && publicNote.length > 0;
  const hasStaff = staffNote !== null && staffNote.length > 0;

  /**
   * What is stored, and — on an editable panel only — a ghost where nothing is.
   *
   * **A read-only panel shows an empty note as nothing at all**, its padlocked
   * block included: the ghosts are imperatives inviting a write ("Add a note for
   * families…"), and the reason they exist is that a Gedu who never opened the
   * editor never discovered there were two notes. Neither half of that survives
   * where there is no editor to open. An empty `StaffNoteBlock` would be worse
   * still — a padlock banner over nothing, which reads as content that failed to
   * load. So a site with nothing written renders its heading, its caption and
   * the way out, and says nothing it cannot back up.
   */
  const body = (
    <div className="space-y-3 pt-2">
      {hasPublic ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {publicNote}
        </p>
      ) : (
        editable && (
          <p className="text-sm italic leading-relaxed text-muted-foreground">
            {copy.publicEmpty}
          </p>
        )
      )}
      {(hasStaff || editable) && (
        <StaffNoteBlock>
          {hasStaff ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {staffNote}
            </p>
          ) : (
            <p className="text-sm italic leading-relaxed text-muted-foreground">
              {copy.staffEmpty}
            </p>
          )}
        </StaffNoteBlock>
      )}
    </div>
  );

  // No divider or top padding of its own: the panel is a whole section of the
  // card it sits in, so its header row *is* that section's heading row.
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {copy.heading}
        </h2>
        {(headerLink !== undefined || editable) && (
          <div className="flex shrink-0 items-center gap-2">
            {headerLink}
            {editable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={committing}
                onClick={() => onEditingChange?.(!isEditing)}
                aria-expanded={isEditing}
                className="-my-1 gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                {copy.edit}
              </Button>
            )}
          </div>
        )}
      </div>

      {caption}
      {intro}

      {/* A read-only panel has no second region to animate between, so the body
          is rendered directly: a collapsing region that can never collapse is
          an overflow clip and a transition maintained for nothing. */}
      {editable ? (
        <CollapsibleRegion open={!isEditing}>{body}</CollapsibleRegion>
      ) : (
        body
      )}

      {editable && (
      <CollapsibleRegion open={isEditing}>
        {/* `pb-1` gives the Save row's focus ring room: a collapsible region
            has to clip its overflow for the open/close animation to work. */}
        <div className="space-y-4 pb-1 pt-3">
          {editorFields?.({ disabled: committing })}

          <FamilyNoteBlock>
            <Field
              label={copy.publicLabel}
              htmlFor={`${fieldId}-public`}
              hint={copy.publicHint}
            >
              {({ hintId }) => (
                <Textarea
                  id={`${fieldId}-public`}
                  rows={4}
                  value={draft.publicNote}
                  placeholder={copy.publicPlaceholder}
                  aria-describedby={hintId}
                  disabled={committing}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, publicNote: e.target.value }))
                  }
                />
              )}
            </Field>
          </FamilyNoteBlock>

          <StaffNoteBlock>
            <Field
              label={copy.staffLabel}
              htmlFor={`${fieldId}-staff`}
              hint={copy.staffHint}
            >
              {({ hintId }) => (
                <Textarea
                  id={`${fieldId}-staff`}
                  rows={3}
                  value={draft.staffNote}
                  placeholder={copy.staffPlaceholder}
                  aria-describedby={hintId}
                  disabled={committing}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, staffNote: e.target.value }))
                  }
                />
              )}
            </Field>
          </StaffNoteBlock>

          {/* The failure line sits above the buttons, where the eye already is
              after a click, rather than under a row that may be the last thing
              inside a collapsible region. A live reason why Save is refused
              takes the same slot and wins it: it describes the draft as it
              stands now, where the error describes an attempt already made. It
              is not an alert — it appears as somebody types rather than in
              answer to a click, and announcing every keystroke is noise. */}
          {saveBlockedReason !== null ? (
            <p className="text-right text-xs text-muted-foreground">
              {saveBlockedReason}
            </p>
          ) : (
            error !== null && (
              <p role="alert" className="text-right text-xs text-destructive">
                {error}
              </p>
            )
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={committing}
              onClick={() => onEditingChange?.(false)}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={committing || saveBlockedReason !== null}
              onClick={() => void handleSave()}
              className="gap-1.5"
            >
              {committing && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              )}
              {copy.save}
            </Button>
          </div>
        </div>
      </CollapsibleRegion>
      )}
    </div>
  );
}
