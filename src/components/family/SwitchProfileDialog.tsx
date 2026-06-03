"use client";

import { useState, type ReactNode } from "react";
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
import { FamilyService, type FamilyMember } from "@/services/family";
import { ProfileTile, ProfileTilesRow } from "./ProfileTiles";

interface SwitchProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The family member to switch into. Rendered as the clickable avatar tile —
   * the tile *is* the CTA.
   */
  target: FamilyMember;
  /** Full-page navigation destination once the switch lands. */
  redirectUrl: string;
  /** Dialog title — the caller owns the feature-specific copy and namespace. */
  title: ReactNode;
  /**
   * One-way-change warning shown in the info banner. Switching signs the caller
   * out of their current account, so each surface phrases which account is left
   * ("...your parent account" vs "...your gamer account").
   */
  oneWayWarning: string;
}

/**
 * Confirms an account switch into another family member, then lands the
 * (now-switched) browser on `redirectUrl`. The avatar tile is the CTA —
 * clicking it POSTs to `/api/auth/switch-account` (via `FamilyService`) and
 * does a full-page nav. Mirrors the `FamilyProfileSelector` / `/select-profile`
 * gesture (hover lift + spinner overlay) so a profile switch looks and feels
 * the same everywhere it happens.
 *
 * Both directions of the switch reuse this:
 *  - parent → gamer, to drop the parent straight into a gamer's voice room
 *    (`ParentSessionsSection`).
 *  - gamer → parent, so a gamer who clicked "Add Gamer" can switch into the
 *    parent who's allowed to create one (`FamilyProfileSelector`). There the
 *    `redirectUrl` carries the add-gamer intent marker so the form re-opens
 *    past the parent PIN gate on `/select-profile`.
 *
 * The info-colored banner signals this is a one-way change. `isSwitching`
 * persists through the full-page nav — the document is about to unload and we
 * don't want the spinner to flash off in the gap. Errors surface in-dialog and
 * re-enable the tile for retry.
 */
export function SwitchProfileDialog({
  open,
  onOpenChange,
  target,
  redirectUrl,
  title,
  oneWayWarning,
}: SwitchProfileDialogProps) {
  const c = useTranslations("common");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function handleSwitch() {
    if (isSwitching) return;
    setIsSwitching(true);
    setSwitchError(null);

    try {
      await new FamilyService().switchAccount(target.id);
      // Full-page nav so the new session cookies hydrate the root layout
      // (browser Supabase singleton is seeded at construction time).
      window.location.href = redirectUrl;
    } catch (err) {
      setIsSwitching(false);
      setSwitchError(err instanceof Error ? err.message : c("somethingWentWrong"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSwitching) onOpenChange(v); }}>
      {/* DialogContent itself only sets padding — `space-y-4` gives the header,
          banner, tile, and (when present) error alert consistent spacing. */}
      <DialogContent className="space-y-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Info-blue banner carries the one-way-change signal. Color + icon
            scale is what makes it visible at a glance; the text explains it. */}
        <Alert variant="info">
          <Info className="h-5 w-5 shrink-0" />
          <AlertDescription className="text-info">{oneWayWarning}</AlertDescription>
        </Alert>

        {/* The tile is the CTA — clicking it commits the switch. */}
        <ProfileTilesRow>
          <ProfileTile
            member={target}
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
            {c("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
