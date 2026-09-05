"use client";

import { FileWarning, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * The dialog both certify affordances raise over an educator who is missing one
 * of the two things an admin would ordinarily want in hand first — the contract
 * in force, and a presented criminal record extract. One component so the
 * user-detail card and the dashboard queue cannot drift into two versions of
 * the same question.
 *
 * **It warns about whichever is actually missing, one line each.** Two
 * prerequisites that gate nothing are still two different facts, and a single
 * sentence covering both would either overstate one case or go vague on all
 * three. So the caller says which are missing and the dialog states each as its
 * own warning; a candidate missing neither never opens it at all, and the
 * caller is expected to certify straight through.
 *
 * **An unanswered read is not a missing prerequisite.** Each flag is a claim
 * the dialog makes as fact, so a caller whose read did not land must pass
 * `false` and let the certification go through unasked rather than assert
 * something it does not know.
 *
 * **It reads as a warning, deliberately, without a destructive button.** The
 * two registers answer two different questions. The *button* stays default
 * because certifying an educator with a gap is a supported outcome the admin is
 * registering, not damage to be warned off — a red button would say the
 * opposite of the copy. The *body* still has to stop a skimming admin, so the
 * facts and their consequence sit in warning callouts (each subject's own
 * glyph, the notice band's register) directly above the buttons: the last thing
 * read before the choice is what is actually being chosen past.
 */
export function CertifyWithWarningsDialog({
  open,
  onOpenChange,
  onConfirm,
  contractMissing,
  criminalRecordCheckMissing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** This educator has not accepted the contract version in force. */
  contractMissing: boolean;
  /** No criminal record extract has been recorded for this educator. */
  criminalRecordCheckMissing: boolean;
}) {
  const t = useTranslations("admin.geduCertifyWarnings");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("body")}
      confirmLabel={t("action")}
      confirmVariant="default"
      onConfirm={onConfirm}
    >
      {/* One line per gap, in the order the two facts arise in an educator's
          life: the terms are agreed to on the platform the day they register,
          the extract is presented later. A dialog raised for one of them shows
          one callout and no hole where the other would have gone. */}
      <div className="space-y-2">
        {contractMissing && (
          <WarningLine icon={<FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}>
            {t("contractWarning")}
          </WarningLine>
        )}
        {criminalRecordCheckMissing && (
          <WarningLine icon={<Scale className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}>
            {t("checkWarning")}
          </WarningLine>
        )}
      </div>
    </ConfirmDialog>
  );
}

function WarningLine({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-warning/10 px-3 py-2.5 text-sm font-medium text-warning">
      {icon}
      <span>{children}</span>
    </div>
  );
}
