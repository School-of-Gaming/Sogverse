"use client";

import { AlertTriangle } from "lucide-react";
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
import type { BlockedDropReason } from "./panel-rules";

interface BlockedMoveDialogProps {
  /** Which refusal to explain; also selects the copy. */
  reason: BlockedDropReason;
  /** The dragged gamer's first name, woven into the copy. */
  gamerName: string;
  onClose: () => void;
}

// Reason → message namespace. A total map rather than a ternary chain: a fourth
// refusal then fails to compile until its copy exists, instead of silently
// falling through to whichever branch was last. `as const satisfies` rather than
// an annotation, because next-intl's `t()` checks the key against the message
// tree — widening these values to `string` would defeat that and let a typo
// through.
const COPY_KEY = {
  unpaidPromote: "promoteUnpaid",
  liveSubscription: "demoteSubscribed",
  removeSubscribed: "removeSubscribed",
} as const satisfies Record<BlockedDropReason, string>;

/**
 * Explains a drop the panel refused to perform. Acknowledge-only by design:
 * nothing was written and there is no "do it anyway" — every refusal is a money
 * problem (a seat given away for free, a subscription left billing for a seat
 * that is gone) that the admin has to settle outside the panel, so the dialog's
 * job is to name the problem and hand over the manual path.
 */
export function BlockedMoveDialog({
  reason,
  gamerName,
  onClose,
}: BlockedMoveDialogProps) {
  const t = useTranslations("admin.products.groupsPanel.blockedMove");
  const copy = COPY_KEY[reason];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          {/* Only the description names the gamer: a title and a next step that
              inflect a name are the two places a translation would fight the
              placeholder, and neither needs it. */}
          <DialogTitle>{t(`${copy}.title`)}</DialogTitle>
          <DialogDescription>
            {t(`${copy}.description`, { name: gamerName })}
          </DialogDescription>
        </DialogHeader>
        {/* The way forward, not a second warning — so the callout is toned
            warning but the sentence stays in body colour and is readable. */}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-warning bg-muted px-3 py-2.5 text-sm text-foreground">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning"
            aria-hidden
          />
          <span>{t(`${copy}.nextStep`)}</span>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("acknowledge")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
