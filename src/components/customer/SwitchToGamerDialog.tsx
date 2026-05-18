"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProfileTile, ProfileTilesRow } from "@/components/family/ProfileTiles";

interface SwitchToGamerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gamerId: string;
  gamerDisplayName: string;
  /**
   * The product name (club / camp / event) the parent is about to join the
   * voice room for. Surfaces in the dialog title so the parent sees which
   * session this confirm applies to even after the underlying card has
   * scrolled out of view.
   */
  productName: string;
  redirectUrl: string;
}

/**
 * Confirms a parent-initiated switch to a gamer account so the parent can
 * land directly in that gamer's voice room.
 *
 * The avatar tile *is* the CTA — clicking it POSTs to
 * `/api/auth/switch-account` and does a full-page nav to `redirectUrl`.
 * Matches the `FamilyProfileSelector` / `/select-profile` pattern (hover
 * lift + spinner overlay while the request is in flight), so a parent who
 * has used either of those surfaces already knows what to do.
 *
 * The info-colored banner signals that this is a one-way change: once the
 * switch lands, the parent is signed out and the planned PIN gate on the
 * return path means going back isn't friction-free. The banner color is
 * the load-bearing affordance; the text is the explanation.
 *
 * Loading state persists through the full-page nav — `isSwitching` stays
 * true after a successful POST because the document is about to unload
 * and we don't want the spinner to flash off in the gap.
 */
export function SwitchToGamerDialog({
  open,
  onOpenChange,
  gamerId,
  gamerDisplayName,
  productName,
  redirectUrl,
}: SwitchToGamerDialogProps) {
  const t = useTranslations('parent');
  const c = useTranslations('common');
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function handleSwitch() {
    if (isSwitching) return;
    setIsSwitching(true);
    setSwitchError(null);

    try {
      const res = await fetch("/api/auth/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: gamerId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('switchToGamer.failedSwitch'));
      }

      window.location.href = redirectUrl;
    } catch (err) {
      setIsSwitching(false);
      setSwitchError(err instanceof Error ? err.message : c('somethingWentWrong'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSwitching) onOpenChange(v); }}>
      {/* DialogContent itself only sets padding — children stack flush
          against each other without explicit vertical spacing. `space-y-4`
          gives the header, banner, tile, and (when present) error alert
          consistent breathing room. */}
      <DialogContent className="space-y-4">
        <DialogHeader>
          <DialogTitle>
            {t('switchToGamer.title', { name: gamerDisplayName, productName })}
          </DialogTitle>
        </DialogHeader>

        {/* Info-blue banner carries the one-way-change signal. Color + icon
            scale (not the lone title icon) is what makes this visible at a
            glance — a tiny header icon disappears, a banner doesn't. */}
        <Alert variant="info">
          <Info className="h-5 w-5 shrink-0" />
          <AlertDescription className="text-info">
            {t('switchToGamer.oneWayWarning')}
          </AlertDescription>
        </Alert>

        {/* The tile is the CTA — clicking it commits the switch. Mirrors
            the FamilyProfileSelector + /select-profile interactions so the
            gesture is consistent across the app. */}
        <ProfileTilesRow>
          <ProfileTile
            member={{ id: gamerId, role: "gamer", first_name: gamerDisplayName }}
            onClick={handleSwitch}
            disabled={isSwitching}
            isLoading={isSwitching}
          />
        </ProfileTilesRow>

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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
