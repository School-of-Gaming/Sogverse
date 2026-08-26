"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * How much a Gedu may write about one member. Generous enough that nobody
 * meets it in normal use, bounded so a paste accident can't post a novel.
 */
export const GAMER_NOTE_MAX_LENGTH = 2000;

interface GamerNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The member the note is about; only their name appears in the copy. */
  name: string;
  /** The stored note. `""` means no note has been written yet. */
  note: string;
  /** Who last wrote the stored note, when that is known. */
  lastEditedBy?: string | null;
  /** Receives the trimmed draft; an empty string means "clear the note". */
  onSave: (text: string) => void | Promise<void>;
}

/**
 * A Gedu's private working memory about one member in one group.
 *
 * The note is staff-only and per-(gamer, group): the same child in two clubs
 * has two notes, because what a Gedu needs to remember is about how the
 * sessions in *this* group are going — who to pair them with, what settled
 * them last week, what their parent mentioned at drop-off. It is never shown
 * to the family, so it is written in the register a colleague reads, not one
 * addressed to a parent.
 *
 * **It is plain text on purpose.** The authored-markdown fields in this app
 * exist because their content is later rendered somewhere else (a page, a
 * mail) and wants structure; a note is read only here, in a box the width of
 * this dialog, by someone who is about to run a session. Offering headings and
 * emphasis would buy nothing and cost the editor's whole apparatus, and it
 * would invite a Gedu to compose the note as a document rather than jot it.
 *
 * The draft is seeded from the stored value each time the dialog opens, and
 * never re-seeded while it is open — so cancelling genuinely discards, and a
 * refetch landing mid-edit cannot overwrite what is being typed. Saving an
 * empty draft is a real action: it clears the note, which is how a Gedu
 * retires guidance that no longer applies.
 */
export function GamerNoteDialog({
  open,
  onOpenChange,
  name,
  note,
  lastEditedBy,
  onSave,
}: GamerNoteDialogProps) {
  const t = useTranslations("memberFlair");
  const c = useTranslations("common");

  const [draft, setDraft] = useState(note);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeding during render on the closed→open edge, rather than in an effect:
  // an effect would paint one frame of the previous draft before correcting
  // it, and the correction lands in the textarea the Gedu is already typing
  // into. React re-renders this component before committing anything, so the
  // seeded value is what the first frame shows.
  const [openedWith, setOpenedWith] = useState(open);
  if (open !== openedWith) {
    setOpenedWith(open);
    if (open) {
      setDraft(note);
      setCommitting(false);
      setError(null);
    }
  }

  const handleSave = async () => {
    if (committing) return;
    setCommitting(true);
    setError(null);
    try {
      await onSave(draft.trim());
      // Left set: the dialog unmounts its content on close, so there is no
      // frame in which the button could re-enable under the cursor.
      onOpenChange(false);
    } catch (err) {
      // A message is shown only when there is one to show. The note write maps
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
          <DialogTitle>{t("noteTitle", { name })}</DialogTitle>
          <DialogDescription>{t("notePrivacy")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-2">
          <Textarea
            autoFocus
            rows={5}
            value={draft}
            maxLength={GAMER_NOTE_MAX_LENGTH}
            placeholder={t("notePlaceholder", { name })}
            onChange={(e) => setDraft(e.target.value)}
          />
          {lastEditedBy != null && note.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("noteLastEdited", { name: lastEditedBy })}
            </p>
          )}
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
