"use client";

import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useLeaveGuard } from "@/hooks/use-leave-guard";

/**
 * **Asks before a page holding unsaved changes is left**, for as long as
 * `when` is true: the browser's own prompt for a reload, a close or a typed
 * address, and this dialog for a link within the app and for the browser's Back.
 *
 * `when` is the caller's "there is something to lose": true while the form
 * differs from what is saved, and false again once a save lands — and false
 * while a save that leaves the page is on its way, so the save's own
 * navigation is never asked about.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const t = useTranslations("common.unsavedChanges");
  const guard = useLeaveGuard(when);

  return (
    <ConfirmDialog
      open={guard.asking}
      onOpenChange={(open) => {
        if (!open) guard.stay();
      }}
      title={t("title")}
      description={t("description")}
      cancelLabel={t("stay")}
      confirmLabel={t("leave")}
      confirmVariant="destructive"
      onConfirm={guard.leave}
    />
  );
}
