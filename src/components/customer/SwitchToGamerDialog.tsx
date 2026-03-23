"use client";

import { useState } from "react";
import { Info } from "lucide-react";
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
        throw new Error(data.error || "Failed to switch account");
      }

      // Full page navigation to force root layout re-hydration with gamer session
      window.location.href = redirectUrl;
    } catch (err) {
      setIsSwitching(false);
      setSwitchError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSwitching) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-info" />
            Join as {gamerDisplayName}?
          </DialogTitle>
          <DialogDescription>
            Only gamers can join voice sessions. Continuing will sign you out of
            your parent account and sign in as{" "}
            <span className="font-medium text-foreground">{gamerDisplayName}</span>.
            You&apos;ll need to log in again to return to your parent account.
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
            Cancel
          </Button>
          <Button
            className="bg-info text-info-foreground hover:bg-info/90"
            onClick={handleSwitch}
            disabled={isSwitching}
          >
            {isSwitching ? "Switching..." : `Sign in as ${gamerDisplayName} & Join`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
