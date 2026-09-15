"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { COVER_REASON_NOTE_MAX_LENGTH } from "@/services/session-cover";
import { cn } from "@/lib/utils";
import { Constants, type CoverReason } from "@/types";
import type { SessionCoverRequestDraft } from "./SessionStaffingRegion";

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
 */
export function SessionCoverRequestDialog({
  open,
  onOpenChange,
  committing,
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
  onConfirm: (draft: SessionCoverRequestDraft) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CoverRequestForm
        committing={committing}
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
 */
function CoverRequestForm({
  committing,
  onCancel,
  onConfirm,
}: {
  committing: boolean;
  onCancel: () => void;
  onConfirm: (draft: SessionCoverRequestDraft) => void;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const c = useTranslations("common");
  const groupName = useId();
  const noteId = useId();

  const [reason, setReason] = useState<CoverReason>("sick");
  const [note, setNote] = useState("");

  const remaining = COVER_REASON_NOTE_MAX_LENGTH - note.length;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("coverRequestDialogTitle")}</DialogTitle>
        <DialogDescription>{t("coverRequestDialogBody")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-2.5">
          <Label id={`${groupName}-label`}>{t("coverReasonLabel")}</Label>
          <div
            role="radiogroup"
            aria-labelledby={`${groupName}-label`}
            className="flex flex-col gap-2"
          >
            {COVER_REASONS.map((value) => {
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
                      ? t("coverReasonSick")
                      : t("coverReasonOther")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          label={t("coverNoteLabel")}
          htmlFor={noteId}
          optional
          hint={t("coverNoteRemaining", { count: Math.max(remaining, 0) })}
        >
          <Textarea
            id={noteId}
            rows={3}
            maxLength={COVER_REASON_NOTE_MAX_LENGTH}
            disabled={committing}
            placeholder={t("coverNotePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={committing}
          onClick={onCancel}
        >
          {c("cancel")}
        </Button>
        <Button
          type="button"
          disabled={committing}
          onClick={() => onConfirm({ reason, note })}
          className="gap-1.5"
        >
          {committing && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {t("coverRequestConfirm")}
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
const COVER_REASONS = Constants.public.Enums.cover_reason;
