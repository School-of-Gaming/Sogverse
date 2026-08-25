"use client";

import { FileWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * The dialog both certify affordances raise over an educator who has not
 * accepted the contract in force — one component so the user-detail card and
 * the dashboard queue cannot drift into two versions of the same question.
 *
 * **It reads as a warning, deliberately, without a destructive button.** The
 * two registers answer two different questions. The *button* stays default
 * because certifying an unsigned educator is a supported outcome the admin is
 * registering, not damage to be warned off — a red button would say the
 * opposite of the copy. The *body* still has to stop a skimming admin, so the
 * fact and its consequence sit in the warning callout (the contract's own
 * glyph, the notice band's register) directly above the buttons: the last
 * thing read before the choice is what is actually being chosen past.
 */
export function CertifyWithoutContractDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("admin.geduContract");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("confirmTitle")}
      description={t("confirmBody")}
      confirmLabel={t("confirmAction")}
      confirmVariant="default"
      onConfirm={onConfirm}
    >
      <div className="flex items-start gap-2 rounded-md border border-warning/60 bg-warning/10 px-3 py-2.5 text-sm font-medium text-warning">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("confirmWarning")}</span>
      </div>
    </ConfirmDialog>
  );
}
