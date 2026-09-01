"use client";

import { useId, useState } from "react";
import { Eye, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GAMER_CREATION_TITLE_MAX_LENGTH,
  GAMER_CREATION_URL_MAX_LENGTH,
} from "@/services/member-flair/member-flair.contracts";
import type { GamerCreation } from "@/types";

/**
 * How much a Gedu may write about one member. Generous enough that nobody
 * meets it in normal use, bounded so a paste accident can't post a novel.
 */
export const GAMER_NOTE_MAX_LENGTH = 2000;

interface GamerFlairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The member this is about; only their name appears in the copy. */
  name: string;
  /** The stored note. `""` means no note has been written yet. */
  note: string;
  /** Who last wrote the stored note, when that is known. */
  lastEditedBy?: string | null;
  /**
   * The stored creations. An empty array is how "none" is spelled, and it is
   * the common case.
   *
   * **A list on the wire, one entry in this editor.** The table, the RPC and
   * every document that carries this field hold an array, because a member
   * having several is a shape we may want back later without a migration. What
   * a Gedu can *author* is one — see the editor's own note below — so this
   * dialog reads the first entry and writes at most one back.
   */
  creations: readonly GamerCreation[];
  /** Receives the trimmed note; an empty string means "clear the note". */
  onSaveNote: (text: string) => void | Promise<void>;
  /**
   * Receives the whole list, replacing whatever is stored: one entry, or none.
   * An empty array deletes the row — the write is a replace, so it is retry-safe.
   */
  onSaveCreations: (creations: readonly GamerCreation[]) => void | Promise<void>;
}

/** The one creation being edited, as two raw field values. */
interface CreationDraft {
  title: string;
  url: string;
}

const BLANK_CREATION: CreationDraft = { title: "", url: "" };

/**
 * The stored list as this editor's one pair of fields.
 *
 * A list holding more than one is not a state the editor can produce, so the
 * first entry is what it shows — and this is also what a save measures the
 * draft *against*, so a longer list left untouched is left alone. Editing the
 * pair replaces the whole list with what is in the fields, which is the
 * normalisation and not a silent loss of a state anything here could have
 * created.
 */
function seedCreationDraft(creations: readonly GamerCreation[]): CreationDraft {
  if (creations.length === 0) return BLANK_CREATION;
  const stored = creations[0];
  return { title: stored.title, url: stored.url };
}

/**
 * **The** per-gamer dialog: everything staff record about one member in one
 * group, in one place, identical in every mount — the gedu product page, the
 * admin group details page, and the voice room.
 *
 * **Two halves, two audiences, and the split is the whole design.** The
 * creation on top is written by staff and read by the gamer's **own family** on
 * their product page. The private note below it is the opposite: staff working
 * memory about a child — per-(gamer, group), because what a Gedu needs to
 * remember is about how the sessions in *this* group are going — and never
 * shown to a family. Getting those two the wrong way round is the only real
 * risk this dialog carries, so each half states its audience in words above the
 * fields, in the two-audience grammar the standing-notes panel already
 * established — a solid-bordered block for the family-facing half, a padlocked
 * recessed block for the staff one, opposites rather than merely different.
 *
 * **Public half first, private half second**, which is the order the
 * standing-notes panel already reads in and therefore the one a Gedu who has
 * met that panel expects. Two surfaces asking a Gedu the same two-audience
 * question in opposite orders is how somebody types into the wrong one. The
 * autofocus follows the order rather than the field — it is on whatever is
 * first, so nothing opens with the caret below a field the reader has not
 * passed yet.
 *
 * **One creation, not a list.** The wire shape is an array everywhere — the
 * table, the RPC and all four documents that carry it — and the editor
 * deliberately is not: essentially every member has zero or one, and a list
 * editor priced in add and remove controls, per-row numbering, a cap message
 * and a half-filled-row rule for a second entry nobody writes. So this is one
 * title and one link. Blanking both clears the creation; the array shape stays
 * on the wire, so wanting several back later is an editor, not a migration.
 *
 * **The blocks are drawn here rather than imported.** The gedu tree owns a pair
 * of components saying exactly this, and this dialog may not reach for them:
 * it mounts inside the voice room, where a child's client renders the very same
 * participant list, so a gedu-tree import would pull staff workspace code into
 * a child's bundle. Two small local blocks are the price of that boundary.
 *
 * **Both fields are plain text on purpose.** The authored-markdown fields in
 * this app exist because their content is rendered somewhere else and wants
 * structure; a note is read only here, and a creation is a title and a link.
 * Offering headings and emphasis would buy nothing and cost the editor's whole
 * apparatus.
 *
 * **The URL is not validated**, deliberately: staff are trusted and the value
 * is stored as raw text. The safety lives on the family's render side, where a
 * value that does not parse as http(s) degrades to its title in plain text
 * rather than becoming an anchor — which is why a title is required beside it.
 * The accepted consequence is that a Gedu gets no signal here that a mistyped
 * link will render as plain words there.
 *
 * The draft is seeded from the stored values each time the dialog opens, and
 * never re-seeded while it is open — so cancelling genuinely discards, and a
 * refetch landing mid-edit cannot overwrite what is being typed. Saving an
 * empty note is a real action: it clears the note, which is how a Gedu retires
 * guidance that no longer applies, and the same is true of emptying both
 * creation fields.
 *
 * **One Save, committing only the halves that changed.** The dialog asks one
 * question, so it has one affirmative button — and it must not write the half
 * nobody touched, because both rows carry their own `updated_by`/`updated_at`:
 * re-sending an unchanged note when somebody adds a creation would restamp the
 * note with the wrong editor and the wrong time, and the "Last edited by" line
 * a colleague reads would be a lie. Both writes are idempotent replaces, so a
 * retry after a partial failure sends only what is still outstanding — see
 * `committed` for what "outstanding" is measured against, which is the half of
 * this that is easy to get wrong.
 */
export function GamerFlairDialog({
  open,
  onOpenChange,
  name,
  note,
  lastEditedBy,
  creations,
  onSaveNote,
  onSaveCreations,
}: GamerFlairDialogProps) {
  const t = useTranslations("memberFlair");
  const c = useTranslations("common");
  const fieldId = useId();

  const [draft, setDraft] = useState(note);
  const [creationDraft, setCreationDraft] = useState<CreationDraft>(() =>
    seedCreationDraft(creations),
  );
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether exactly one of the two creation fields is filled — set by a refused
   * Save, cleared by editing either of them.
   */
  const [incomplete, setIncomplete] = useState(false);
  /**
   * What this dialog believes is stored, updated as each half lands.
   *
   * A save can half-land — the note goes through and the creations write is
   * refused — and the only honest thing to leave behind is exactly what still
   * needs doing, so a second press of Save retries the remainder and nothing
   * twice. The same shape the session card's photo saves use.
   *
   * **It holds the landed *values*, not a pair of booleans**, and that is the
   * whole point of it. A flag says "this half is done" and goes on saying it
   * after the Gedu edits that half again — so a note written, refused alongside
   * a failing creations write, then corrected and saved a second time would be
   * silently dropped, which is the worst outcome available: the dialog closes,
   * nothing errors, and the correction is gone. Comparing against the value
   * that actually landed cannot make that mistake, and it needs no separate
   * clearing from every field's change handler.
   *
   * Seeded from the props on open, so before anything has landed "what is
   * stored" is simply what the dialog was handed.
   */
  const [committed, setCommitted] = useState({ note, creations });

  // Seeding during render on the closed→open edge, rather than in an effect:
  // an effect would paint one frame of the previous draft before correcting
  // it, and the correction lands in the fields the Gedu is already typing
  // into. React re-renders this component before committing anything, so the
  // seeded values are what the first frame shows.
  const [openedWith, setOpenedWith] = useState(open);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) {
      setDraft(note);
      setCreationDraft(seedCreationDraft(creations));
      setCommitting(false);
      setError(null);
      setIncomplete(false);
      setCommitted({ note, creations });
    }
  }

  const editCreation = (patch: Partial<CreationDraft>) => {
    setIncomplete(false);
    setCreationDraft((current) => ({ ...current, ...patch }));
  };

  const handleSave = async () => {
    if (committing) return;

    /**
     * **Both fields blank clears the creation**, exactly as a trimmed-empty
     * note means "no note": a Gedu who opened the dialog and changed their mind
     * has not asked for anything, and one who emptied a filled pair is retiring
     * a creation the same way they retire guidance. **One field filled** is the
     * opposite — somebody typed one of the two and stopped — so it blocks the
     * save and says so, which is what keeps the table's CHECK a loud backstop
     * rather than a routine error path.
     */
    const nextTitle = creationDraft.title.trim();
    const nextUrl = creationDraft.url.trim();
    const cleared = nextTitle.length === 0 && nextUrl.length === 0;
    if (!cleared && (nextTitle.length === 0 || nextUrl.length === 0)) {
      setIncomplete(true);
      return;
    }
    const nextCreations: readonly GamerCreation[] = cleared
      ? []
      : [{ title: nextTitle, url: nextUrl }];

    /**
     * **Both halves compare the draft raw, against the raw stored value.** What
     * is *sent* is trimmed, so comparing the trimmed value would call a stored
     * entry that carries padding "changed" every single time the dialog is
     * opened — and a Gedu who opened it, read it and pressed Save would restamp
     * somebody else's provenance without having typed a character. Only a
     * caller outside this editor can store padding (the RPC writes verbatim),
     * which is precisely why the comparison must not assume nobody has.
     */
    const nextNote = draft.trim();
    const noteChanged = draft !== committed.note;

    /**
     * **The creations half is measured against what the editor was *seeded*
     * with** — the same first-entry reduction the fields show — and never
     * against the stored list's length.
     *
     * A stored list longer than one is unreachable from this editor and
     * perfectly reachable by data: the RPC writes whatever list it is handed.
     * Measured by length, such a list reads as "changed" on every save,
     * including one where nothing but the note was touched — so a note edit
     * would silently truncate somebody's pair to the single entry these fields
     * happen to hold. Measured against the seed, an untouched pair writes
     * nothing and the longer list survives. A Gedu who genuinely edits the
     * creation still normalises it to one, which is this editor's documented
     * intent rather than a loss of a state anything here created.
     */
    const seeded = seedCreationDraft(committed.creations);
    const creationsChanged =
      creationDraft.title !== seeded.title || creationDraft.url !== seeded.url;

    setCommitting(true);
    setError(null);

    // A local copy rather than the state directly: two awaits happen before any
    // re-render, so reading `committed` back between them would read the value
    // the dialog opened with.
    const done = { ...committed };
    try {
      if (noteChanged) {
        await onSaveNote(nextNote);
        done.note = nextNote;
        // The field now holds exactly what was written — see the creations
        // re-seed below, which both halves need for the same reason.
        setDraft(nextNote);
      }
      if (creationsChanged) {
        await onSaveCreations(nextCreations);
        done.creations = nextCreations;
        // The fields now hold exactly what was written. Both halves are
        // compared raw against what landed, and what landed is trimmed, so a
        // draft left carrying padding would read as changed on a retry over
        // nothing but a trailing space. It is invisible — it removes
        // whitespace the Gedu cannot see — and it touches only the half that
        // landed, never the one still to be sent.
        setCreationDraft(seedCreationDraft(nextCreations));
      }
      // `committing` left set: the dialog unmounts its content on close, so
      // there is no frame in which the button could re-enable under the cursor.
      onOpenChange(false);
    } catch (err) {
      setCommitted(done);
      // A message is shown only when there is one to show. Both flair writes map
      // a database refusal — a `42501` reading `Forbidden`, a CHECK violation
      // reading a constraint name — to an error carrying no message at all,
      // precisely so this falls back to the localized copy; a failure that does
      // have something to say still says it. Which failures those are is the
      // service's call, once, for all three surfaces that mount this dialog.
      const message = err instanceof Error ? err.message : "";
      setError(message.length > 0 ? message : c("unexpectedError"));
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("memberTitle", { name })}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <FamilyVisibleBlock label={t("creationAudience")}>
            <Field label={t("creationLabel")} hint={t("creationHint", { name })}>
              {({ hintId, labelId }) => (
                // A group rather than one control, because the pair of fields is
                // one thing: the label and the hint belong to both of them, and
                // neither field alone is a creation. This is the composite case
                // the field's own `labelId` descriptor exists for.
                <div
                  role="group"
                  aria-labelledby={labelId}
                  aria-describedby={hintId}
                  className="space-y-1.5"
                >
                  {/* Named for assistive technology rather than labelled on
                      screen: the group above says what these are, and two more
                      visible labels over two inputs inside a bordered block
                      already carrying a label and a hint would be more chrome
                      than content. The same treatment the roster's inline
                      username editor makes, for the same reason. */}
                  <Input
                    autoFocus
                    value={creationDraft.title}
                    maxLength={GAMER_CREATION_TITLE_MAX_LENGTH}
                    placeholder={t("creationTitlePlaceholder")}
                    aria-label={t("creationTitleLabel")}
                    disabled={committing}
                    onChange={(e) => editCreation({ title: e.target.value })}
                  />
                  <Input
                    value={creationDraft.url}
                    maxLength={GAMER_CREATION_URL_MAX_LENGTH}
                    placeholder={t("creationUrlPlaceholder")}
                    aria-label={t("creationUrlLabel")}
                    disabled={committing}
                    onChange={(e) => editCreation({ url: e.target.value })}
                  />

                  {incomplete && (
                    <p role="alert" className="pt-0.5 text-xs text-destructive">
                      {t("creationIncomplete")}
                    </p>
                  )}
                </div>
              )}
            </Field>
          </FamilyVisibleBlock>

          <StaffOnlyBlock label={t("noteAudience")}>
            <Field
              label={t("noteLabel")}
              htmlFor={`${fieldId}-note`}
              hint={t("noteHint")}
            >
              {({ hintId }) => (
                <Textarea
                  id={`${fieldId}-note`}
                  rows={5}
                  value={draft}
                  maxLength={GAMER_NOTE_MAX_LENGTH}
                  placeholder={t("notePlaceholder", { name })}
                  aria-describedby={hintId}
                  disabled={committing}
                  onChange={(e) => setDraft(e.target.value)}
                />
              )}
            </Field>
            {lastEditedBy != null && note.length > 0 && (
              <p className="mt-2.5 text-xs text-muted-foreground">
                {t("noteLastEdited", { name: lastEditedBy })}
              </p>
            )}
          </StaffOnlyBlock>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={committing}
          >
            {c("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={committing}>
            {c("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The staff-only half, wearing the same treatment the workspace's staff note
 * block does: recessed, dashed, muted, with a padlocked banner naming who reads
 * it.
 *
 * Local rather than imported — see the dialog's own note. The two blocks are
 * deliberately *opposites* rather than merely different, because the risk this
 * dialog carries is somebody typing into the wrong one while picturing the
 * other, and that has to be legible before a word is read.
 */
function StaffOnlyBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/60 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** The family-facing half: solid-bordered, on the card's own ground. */
function FamilyVisibleBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Eye className="h-3 w-3" aria-hidden />
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
