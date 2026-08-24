"use client";

import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";

/**
 * The signing ceremony: sign, date, accept — in that order, and all three on
 * screen at once so the reader can see what they are about to do before they do
 * any of it.
 *
 * **The first two steps are pure UI and the third is the only write.** Putting a
 * name and a date on a line changes nothing anywhere; it is the ritual half of
 * signing, and it exists because a button labelled "I agree" is not what a
 * person recognises as signing a contract. Accept is what reaches the database,
 * and the moment it records is the *server's*, never this dialog's date — the
 * date on the line is the ceremony, `accepted_at` is the record.
 *
 * **Nothing typed, nothing chosen.** The signature is the signer's own profile
 * name and the date is today, so neither step can produce a value that
 * contradicts what the RPC will store (which reads the name off the profile at
 * the instant of the write). A free-text signature field would invite exactly
 * that disagreement.
 *
 * **Mounted per opening rather than held across one.** The host renders this
 * only while its dialog is open, so each opening starts unsigned and undated
 * with no reset effect to forget — and closing a half-finished ceremony
 * genuinely abandons it, which is what a reader who backed out expects. The
 * failure flag is the one piece of ceremony state that is *not* local, so the
 * host clears it as this opens; nothing here has to remember the last attempt.
 *
 * **A signer with no name cannot start.** The signature is the profile's name
 * and nothing else, so an absent profile would fill the rule with an empty
 * string and leave a signed-looking line with nothing on it. The write itself is
 * safe either way — the RPC reads the name server-side — but the ceremony is a
 * display of what is being agreed to, and a blank display agrees to nothing.
 */
export function GeduContractSigningDialog({
  signerName,
  committing,
  acceptFailed,
  onAccept,
  onClose,
}: {
  /** The signer's own name, rendered onto the signature line as they sign. */
  signerName: string;
  /**
   * The host's committing flag — set synchronously before the mutation and
   * deliberately left set on the success path, because success swaps the panel
   * behind this dialog and unmounts it. It drives both the spinner and the
   * disabled state; React Query's `isPending` is not enough (see CLAUDE.md).
   */
  committing: boolean;
  /** Did the last accept attempt fail? Shows the retry line. */
  acceptFailed: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("gedu.contract.dialog");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const [signature, setSignature] = useState<string | null>(null);
  /**
   * Stamped at the moment of the click rather than derived from `now` on every
   * render: `useNow()` ticks, and a date that could silently re-render itself
   * mid-ceremony is not a date somebody put on a line. The viewer's own zone,
   * because "today" is a fact about where the reader is.
   */
  const [signedDate, setSignedDate] = useState<string | null>(null);

  const ready = signature !== null && signedDate !== null;
  /** Nothing to put on the line means there is no signing step to offer. */
  const canSign = signerName.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          <CeremonyLine
            label={t("signatureLabel")}
            actionLabel={t("signAction")}
            value={signature}
            // Generous, because a signature is meant to look like one — and the
            // cursive face is the only place in the app it is used.
            valueClassName="font-cursive text-3xl leading-none sm:text-4xl"
            disabled={!canSign}
            onFill={() => setSignature(signerName)}
          />
          <CeremonyLine
            label={t("dateLabel")}
            actionLabel={t("dateAction")}
            value={signedDate}
            // The ordinary text face, deliberately: cursive is the signature's
            // and only the signature's — a date is filled in, not signed.
            valueClassName="text-lg leading-none sm:text-xl"
            onFill={() =>
              setSignedDate(
                formatDate(now, locale, { dateStyle: "long", timeZone }),
              )
            }
          />
        </div>

        {/* Only after a failed attempt, and it pushes the footer down by a line
            when it appears. That is a change the reader asked for — it is the
            direct result of the Accept they just clicked — so the layout rule
            permits it, and reserving a line for a message most signers never
            see would leave a hole under every ceremony instead. */}
        {acceptFailed && (
          <p className="mt-4 text-sm text-destructive">{t("error")}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={committing}>
            {t("cancel")}
          </Button>
          <Button onClick={onAccept} disabled={!ready || committing}>
            {committing && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One line of the ceremony: a label, and a rule with either an invitation to
 * fill it or the thing it was filled with.
 *
 * **The height is fixed and the two states share it.** This is the reserve the
 * layout rule actually asks for — the empty line is a placeholder for the very
 * value the next click puts there, so the slot is never dead space, and the
 * Accept button below cannot move out from under the cursor between signing and
 * dating.
 *
 * `disabled` is for a line that has no value to fill itself with — the
 * invitation stays on screen so the ceremony keeps its shape, but it cannot be
 * taken, and the Accept button stays out of reach behind it.
 */
function CeremonyLine({
  label,
  actionLabel,
  value,
  valueClassName,
  disabled = false,
  onFill,
}: {
  label: string;
  actionLabel: string;
  value: string | null;
  valueClassName: string;
  disabled?: boolean;
  onFill: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex h-16 items-end border-b border-border">
        {value === null ? (
          <button
            type="button"
            onClick={onFill}
            disabled={disabled}
            className="flex h-full w-full items-center gap-2 rounded-t-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <PenLine className="h-4 w-4 shrink-0" aria-hidden />
            {actionLabel}
          </button>
        ) : (
          <span className={cn("px-2 pb-2", valueClassName)}>{value}</span>
        )}
      </div>
    </div>
  );
}
