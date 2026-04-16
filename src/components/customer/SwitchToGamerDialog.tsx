"use client";

import { useState } from "react";
import { Info } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SwitchToGamerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamerId: string;
  gamerDisplayName: string;
  redirectUrl: string;
}

export function SwitchToGamerDialog({
  open,
  onOpenChange,
  gamerId,
  gamerDisplayName,
  redirectUrl,
}: SwitchToGamerDialogProps) {
  const t = useTranslations('parent');
  const c = useTranslations('common');
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function handleSwitch() {
    setIsSwitching(true);
    setSwitchError(null);

    try {
      const res = await fetch("/api/auth/switch-to-gamer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamerId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('switchToGamer.failedSwitch'));
      }

      // Full page navigation to force root layout re-hydration with gamer session
      window.location.href = redirectUrl;
    } catch (err) {
      setIsSwitching(false);
      setSwitchError(err instanceof Error ? err.message : c('somethingWentWrong'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSwitching) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-info" />
            {t('switchToGamer.title', { name: gamerDisplayName })}
          </DialogTitle>
          <DialogDescription>
            {t.rich('switchToGamer.description', { name: gamerDisplayName, bold: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
          </DialogDescription>
        </DialogHeader>

        {switchError && (
          <Alert variant="destructive">
            <AlertDescription>{switchError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSwitching}
          >
            {c('cancel')}
          </Button>
          <Button
            className="bg-info text-info-foreground hover:bg-info/90"
            onClick={handleSwitch}
            disabled={isSwitching}
          >
            {isSwitching ? t('switchToGamer.switching') : t('switchToGamer.confirm', { name: gamerDisplayName })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
