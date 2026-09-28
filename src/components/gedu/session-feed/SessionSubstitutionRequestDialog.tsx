"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUBSTITUTION_REASON_NOTE_MAX_LENGTH } from "@/services/session-substitution";
import { cn } from "@/lib/utils";
import { Constants, type SubstitutionReason } from "@/types";

/** What a gedu tells the office when they file an absence. */
export interface SessionSubstitutionRequestDraft {
  reason: SubstitutionReason;
  /** Trimmed by the caller's RPC; empty means no note at all. */
  note: string;
}

/**
 * "I can't make this session" — the whole form, which is two questions long.
 *
 * **A dialog rather than an inline form, and a small one.** Filing an absence
 * is rare, it is the one thing on this card that reaches the office, and it has
 * a question to ask — so it earns a confirm step; what it does not earn is a
 * page. The reason is a radio pair because there are exactly two categories and
 * a select would hide one of them behind a click, and the note is optional
 * because most absences have nothing to add to "sick".
 *
 * **Both answers are admin-only, and the dialog says so.** A gedu typing here
 * is telling the office, not their colleagues: the reason and the note ride the
 * feed document for an admin caller and are emitted as null for everybody else,
 * so the sentence under the title is a mechanism rather than a reassurance.
 *
 * **The note counts against the same 500 the database applies.** The writer is
 * told before they lose the end of a sentence rather than after, which is the
 * only reason the bound is restated on this side at all — the shared constant
 * is what keeps the two copies one number.
 *
 * **The draft lives in the form inside the dialog, not in this component.** The
 * dialog primitive renders nothing at all while it is closed, so the form
 * unmounts with it and its fields seed themselves from scratch on every open —
 * which is what a dialog reopened after a refusal, or opened on a different
 * session's card, has to do. Holding the draft out here and clearing it in an
 * effect was the other way to get that, and it is the cascading-render shape
 * React asks callers not to write.
 *
 * **There are two ways in and one form.** The session card's overflow menu opens
 * this dialog; the Substitutions page picks a session first and then renders
 * {@link SessionSubstitutionRequestForm} as the second step of its own dialog.
 * Both reach the same write, so the form is the exported piece and this wrapper
 * is only the card's half of the arrangement.
 */
export function SessionSubstitutionRequestDialog({
  open,
  onOpenChange,
  committing,
  error = null,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether the write this dialog started is still in the air. Held by the
   * caller, which is also what closes the dialog once the write lands — a
   * dialog that dismissed itself on the click would take the draft with it
   * before anybody knew whether it had been stored.
   */
  committing: boolean;
  /** Why the last attempt was refused, or `null`. */
  error?: string | null;
  onConfirm: (draft: SessionSubstitutionRequestDraft) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SessionSubstitutionRequestForm
        committing={committing}
        error={error}
        onCancel={() => onOpenChange(false)}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

/**
 * The dialog's contents, and the only place the draft exists.
 *
 * Mounted by the primitive only while the dialog is open, which is what makes
 * the fields seed themselves cleanly every time without anything clearing them.
 *
 * **The refusal is drawn inside the dialog, above the footer.** This form holds
 * its own fields open through a failed write so the gedu can try again, and a
 * line painted on the card behind it would be under the overlay — the one place
 * nobody can read it.
 */
export function SessionSubstitutionRequestForm({
  committing,
  error = null,
  context = null,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  committing: boolean;
  error?: string | null;
  /**
   * What this form is about, where the surface that opened it has to say so —
   * the Substitutions page names the session that was picked, because its
   * dialog is the only one that could be about any of several. The card's own
   * dialog passes nothing: the card *is* the session.
   */
  context?: ReactNode;
  /** Overrides "Cancel" where the negative action is a step back, not a way out. */
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: (draft: SessionSubstitutionRequestDraft) => void;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const c = useTranslations("common");
  const groupName = useId();
  const noteId = useId();

  /**
   * **Nothing is chosen to begin with, and the confirm waits for a choice.**
   * `sick` led the list and was pre-selected, which meant a gedu who pressed
   * straight through recorded health data about themselves that they had never
   * stated — and the admin's own confirm step now asks the same question the
   * same way *(owner, 2026-09)*.
   */
  const [reason, setReason] = useState<SubstitutionReason | null>(null);
  const [note, setNote] = useState("");

  const remaining = SUBSTITUTION_REASON_NOTE_MAX_LENGTH - note.length;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("substitutionRequestDialogTitle")}</DialogTitle>
        <DialogDescription>{t("substitutionRequestDialogBody")}</DialogDescription>
      </DialogHeader>

      {context !== null && (
        <p className="mt-3 text-sm font-medium text-foreground">{context}</p>
      )}

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-2.5">
          <Label id={`${groupName}-label`}>{t("substitutionReasonLabel")}</Label>
          <div
            role="radiogroup"
            aria-labelledby={`${groupName}-label`}
            className="flex flex-col gap-2"
          >
            {SUBSTITUTION_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                    selected && "border-act",
                    committing && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={value}
                    className="h-4 w-4 shrink-0 accent-act"
                    checked={selected}
                    disabled={committing}
                    onChange={() => setReason(value)}
                  />
                  <span className="min-w-0 flex-1 font-medium">
                    {value === "sick"
                      ? t("substitutionReasonSick")
                      : t("substitutionReasonOther")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          label={t("substitutionNoteLabel")}
          htmlFor={noteId}
          optional
          hint={t("substitutionNoteRemaining", { count: Math.max(remaining, 0) })}
        >
          <Textarea
            id={noteId}
            rows={3}
            maxLength={SUBSTITUTION_REASON_NOTE_MAX_LENGTH}
            disabled={committing}
            placeholder={t("substitutionNotePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {error !== null && (
          <StatusLine status="destructive" size="sm" role="alert">
            {error}
          </StatusLine>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={committing}
          onClick={onCancel}
        >
          {cancelLabel ?? c("cancel")}
        </Button>
        <Button
          type="button"
          disabled={committing || reason === null}
          onClick={() => {
            if (reason === null) return;
            onConfirm({ reason, note });
          }}
          className="gap-1.5"
        >
          {committing && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {t("substitutionRequestConfirm")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * The two categories, in the order they are offered, read off the generated
 * enum rather than retyped — so a third category appears here the day the
 * database gains one instead of being silently unofferable. `sick` leads
 * because it is what the handbook's same-day rule is written for and what most
 * of these are.
 */
const SUBSTITUTION_REASONS = Constants.public.Enums.substitution_reason;
