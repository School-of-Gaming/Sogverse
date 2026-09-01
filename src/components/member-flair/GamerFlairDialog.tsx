"use client";

import { useId, useState } from "react";
import { Eye, Lock, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GAMER_CREATION_MAX_ENTRIES,
  GAMER_CREATION_TITLE_MAX_LENGTH,
  GAMER_CREATION_URL_MAX_LENGTH,
} from "@/services/member-flair/member-flair.contracts";
import type { GamerCreation } from "@/types";

/**
 * How much a Gedu may write about one member. Generous enough that nobody
 * meets it in normal use, bounded so a paste accident can't post a novel.
 */
export const GAMER_NOTE_MAX_LENGTH = 2000;

/**
 * How tall the creations list may grow before it scrolls inside itself.
 *
 * The cap is twenty entries and the dialog is centred in the viewport with no
 * scroll of its own, so a member with a long list would push the footer — and
 * the Save the Gedu is reaching for — off the bottom of the screen. Almost
 * every member has zero or one, so this bites essentially never; it is here so
 * that the one member who has fifteen does not cost the dialog its buttons.
 */
const CREATION_LIST_MAX_HEIGHT = "max-h-[40vh]";

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
   * The stored creations, in the order staff arranged them. An empty array is
   * how "none" is spelled, and it is the common case.
   */
  creations: readonly GamerCreation[];
  /** Receives the trimmed note; an empty string means "clear the note". */
  onSaveNote: (text: string) => void | Promise<void>;
  /**
   * Receives the whole list, replacing whatever is stored. An empty array
   * deletes the row — the write is a replace, so it is retry-safe.
   */
  onSaveCreations: (creations: readonly GamerCreation[]) => void | Promise<void>;
}

/** One row of the creations editor, with a key that survives a removal. */
interface CreationRow {
  key: number;
  title: string;
  url: string;
}

/** The rows being edited, plus the counter that keys the next one added. */
interface CreationDraft {
  rows: readonly CreationRow[];
  nextKey: number;
}

function seedCreationDraft(
  creations: readonly GamerCreation[],
): CreationDraft {
  return {
    rows: creations.map((creation, index) => ({
      key: index,
      title: creation.title,
      url: creation.url,
    })),
    nextKey: creations.length,
  };
}

/**
 * **The** per-gamer dialog: everything staff record about one member in one
 * group, in one place, identical in every mount — the gedu product page, the
 * admin group details page, and the voice room.
 *
 * **Two halves, two audiences, and the split is the whole design.** The private
 * note on top is staff working memory about a child — per-(gamer, group),
 * because what a Gedu needs to remember is about how the sessions in *this*
 * group are going, and never shown to a family. The creations below it are the
 * opposite: staff write them and the gamer's **own family reads them** on their
 * product page. Getting those two the wrong way round is the only real risk
 * this dialog carries, so each half states its audience in words above the
 * fields, in the two-audience grammar the standing-notes panel already
 * established — a padlocked recessed block for the staff half, a solid-bordered
 * block for the family-facing one, opposites rather than merely different.
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
 * guidance that no longer applies, and the same is true of removing the last
 * creation.
 *
 * **One Save, committing only the halves that changed.** The dialog asks one
 * question, so it has one affirmative button — and it must not write the half
 * nobody touched, because both rows carry their own `updated_by`/`updated_at`:
 * re-sending an unchanged note when somebody adds a creation would restamp the
 * note with the wrong editor and the wrong time, and the "Last edited by" line
 * a colleague reads would be a lie. Both writes are idempotent replaces, and a
 * half that has landed is remembered for the life of the open dialog, so a
 * retry after a partial failure sends only what is still outstanding.
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
  /** Whether a row is half-filled — set by a refused Save, cleared by editing. */
  const [incomplete, setIncomplete] = useState(false);
  /**
   * Which halves this dialog has already written since it opened.
   *
   * A save can half-land — the note goes through and the creations write is
   * refused — and the only honest thing to leave behind is exactly what still
   * needs doing. The same shape the session card's photo saves use, and for the
   * same reason: a second press of Save retries the remainder and nothing twice.
   */
  const [landed, setLanded] = useState({ note: false, creations: false });

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
      setLanded({ note: false, creations: false });
    }
  }

  const rows = creationDraft.rows;

  const editRow = (key: number, patch: Partial<Omit<CreationRow, "key">>) => {
    setIncomplete(false);
    setCreationDraft((current) => ({
      ...current,
      rows: current.rows.map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addRow = () => {
    setCreationDraft((current) => ({
      rows: [...current.rows, { key: current.nextKey, title: "", url: "" }],
      nextKey: current.nextKey + 1,
    }));
  };

  const removeRow = (key: number) => {
    setIncomplete(false);
    setCreationDraft((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.key !== key),
    }));
  };

  const handleSave = async () => {
    if (committing) return;

    /**
     * A **fully blank row is dropped**, exactly as a trimmed-empty note means
     * "no note": a Gedu who pressed Add and changed their mind has not asked
     * for anything. A **half-filled** row is the opposite — somebody typed one
     * of the two and stopped — so it blocks the save and says so, which is what
     * keeps the table's CHECK a loud backstop rather than a routine error path.
     */
    const kept = rows
      .map((row) => ({ title: row.title.trim(), url: row.url.trim() }))
      .filter((row) => row.title.length > 0 || row.url.length > 0);
    if (kept.some((row) => row.title.length === 0 || row.url.length === 0)) {
      setIncomplete(true);
      return;
    }

    const nextNote = draft.trim();
    const noteChanged = nextNote !== note;
    const creationsChanged =
      kept.length !== creations.length ||
      kept.some(
        (row, index) =>
          row.title !== creations[index].title ||
          row.url !== creations[index].url,
      );

    setCommitting(true);
    setError(null);

    // A local copy rather than the state directly: two awaits happen before any
    // re-render, so reading `landed` back between them would read the value the
    // dialog opened with.
    const done = { ...landed };
    try {
      if (!done.note && noteChanged) {
        await onSaveNote(nextNote);
        done.note = true;
      }
      if (!done.creations && creationsChanged) {
        await onSaveCreations(kept);
        done.creations = true;
      }
      // `committing` left set: the dialog unmounts its content on close, so
      // there is no frame in which the button could re-enable under the cursor.
      onOpenChange(false);
    } catch (err) {
      setLanded(done);
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
          <StaffOnlyBlock label={t("noteAudience")}>
            <Field
              label={t("noteLabel")}
              htmlFor={`${fieldId}-note`}
              hint={t("noteHint")}
            >
              {({ hintId }) => (
                <Textarea
                  id={`${fieldId}-note`}
                  autoFocus
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

          <FamilyVisibleBlock label={t("creationsAudience")}>
            <Field label={t("creationsLabel")} hint={t("creationsHint", { name })}>
              {({ hintId, labelId }) => (
                // A group rather than one control, so the label and the hint
                // reach every row inside it — the composite case the field's
                // own `labelId` descriptor exists for.
                <div
                  role="group"
                  aria-labelledby={labelId}
                  aria-describedby={hintId}
                >
                  {rows.length > 0 && (
                    // Scrolls inside itself rather than growing the dialog past
                    // the viewport — see CREATION_LIST_MAX_HEIGHT.
                    <ul
                      className={cn(
                        "space-y-3 overflow-y-auto",
                        CREATION_LIST_MAX_HEIGHT,
                      )}
                    >
                      {rows.map((row, index) => (
                        <li key={row.key} className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {/* Named for assistive technology rather than
                                labelled on screen: the group above says what
                                these are, and twenty rows each carrying two
                                visible field labels would be a wall of chrome
                                over two inputs. The same treatment the roster's
                                inline username editor makes, for the same
                                reason. */}
                            <Input
                              value={row.title}
                              maxLength={GAMER_CREATION_TITLE_MAX_LENGTH}
                              placeholder={t("creationTitlePlaceholder")}
                              aria-label={t("creationTitleLabel", {
                                number: index + 1,
                              })}
                              disabled={committing}
                              onChange={(e) =>
                                editRow(row.key, { title: e.target.value })
                              }
                            />
                            <Input
                              value={row.url}
                              maxLength={GAMER_CREATION_URL_MAX_LENGTH}
                              placeholder={t("creationUrlPlaceholder")}
                              aria-label={t("creationUrlLabel", {
                                number: index + 1,
                              })}
                              disabled={committing}
                              onChange={(e) =>
                                editRow(row.key, { url: e.target.value })
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={committing}
                            aria-label={t("creationRemove", {
                              number: index + 1,
                            })}
                            onClick={() => removeRow(row.key)}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {rows.length < GAMER_CREATION_MAX_ENTRIES ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-1.5"
                      disabled={committing}
                      onClick={addRow}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      {t("creationAdd")}
                    </Button>
                  ) : (
                    // The cap is reached by adding rows, so this line replaces
                    // the button in answer to the Gedu's own click rather than
                    // arriving on data's schedule.
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("creationsAtCap", {
                        count: GAMER_CREATION_MAX_ENTRIES,
                      })}
                    </p>
                  )}

                  {incomplete && (
                    <p role="alert" className="mt-2 text-xs text-destructive">
                      {t("creationIncomplete")}
                    </p>
                  )}
                </div>
              )}
            </Field>
          </FamilyVisibleBlock>

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
