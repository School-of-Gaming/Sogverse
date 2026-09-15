"use client";

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

/**
 * "I can make it after all" — the confirm step in front of taking an absence
 * back.
 *
 * **It is confirmed, unlike the send two blocks down the same card**, and the
 * difference is what the press costs somebody else. A send is idempotent at the
 * server and says everything it does in its own label; withdrawing drops every
 * offer colleagues have already made on a session they set aside time for, and
 * a gedu who meant to press Edit has no way back from it. So the dialog exists
 * to name that consequence, which is the only thing it has to add.
 *
 * Built from the dialog primitive directly rather than from the shared
 * `ConfirmDialog` because that one dismisses itself on the click: the write is
 * awaited here and the dialog stays up, disabled, until it lands — the same
 * discipline every other committing control on this page follows.
 */
export function SessionCoverWithdrawDialog({
  open,
  onOpenChange,
  committing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  committing: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const c = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("coverWithdrawTitle")}</DialogTitle>
          <DialogDescription>{t("coverWithdrawBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={committing}
            onClick={() => onOpenChange(false)}
          >
            {c("cancel")}
          </Button>
          <Button
            type="button"
            disabled={committing}
            onClick={onConfirm}
            className="gap-1.5"
          >
            {committing && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {t("coverWithdrawConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
