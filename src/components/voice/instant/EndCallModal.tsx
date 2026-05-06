"use client";

import { useState } from "react";
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

interface EndCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Just leave the call locally. Used by everyone (mods and guests). */
  onLeave: () => void | Promise<void>;
  /** Mods only — broadcast end-for-all then delete the Daily room. */
  onEndForEveryone?: () => void | Promise<void>;
}

/**
 * Confirmation modal triggered by the in-call leave button.
 *
 * For guests this is a simple "Leave call" confirmation. For moderators it
 * adds an "End for everyone" option that destroys the Daily room and
 * disconnects all participants. The destructive option is intentionally
 * the secondary button so a fast click on the primary leaves only the
 * moderator instead of taking down the whole call.
 */
export function EndCallModal({
  open,
  onOpenChange,
  onLeave,
  onEndForEveryone,
}: EndCallModalProps) {
  const t = useTranslations("voice.instant.end");
  const [busy, setBusy] = useState<"leave" | "endAll" | null>(null);

  const handleLeave = async () => {
    setBusy("leave");
    try {
      await onLeave();
    } finally {
      // The leave path navigates the user away, so we don't normally hit
      // this — but reset busy state defensively in case the component is
      // still mounted (e.g. an error path).
      setBusy(null);
    }
  };

  const handleEndForEveryone = async () => {
    if (!onEndForEveryone) return;
    setBusy("endAll");
    try {
      await onEndForEveryone();
    } finally {
      setBusy(null);
    }
  };

  const showEndAll = Boolean(onEndForEveryone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {showEndAll ? t("modTitle") : t("guestTitle")}
          </DialogTitle>
          <DialogDescription>
            {showEndAll ? t("modDescription") : t("guestDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            {t("cancel")}
          </Button>
          {showEndAll && (
            <Button
              variant="destructive"
              onClick={handleEndForEveryone}
              disabled={busy !== null}
              className="gap-2"
            >
              {busy === "endAll" && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("endForEveryone")}
            </Button>
          )}
          <Button
            onClick={handleLeave}
            disabled={busy !== null}
            className="gap-2"
          >
            {busy === "leave" && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("leave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
