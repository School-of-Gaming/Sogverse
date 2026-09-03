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
import {
  commitAccountSwitch,
  type FamilyMember,
  type SwitchAccountCredentials,
  type SwitchGate,
} from "@/services/family";
import { ProfileTile, ProfileTilesRow } from "./ProfileTiles";
import { SwitchGateBody } from "./SwitchGateDialog";

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
  /**
   * What this switch costs, from `switchGateFor`. Defaults to `none`, which is
   * every parent-initiated switch and keeps those exactly as they were: one
   * click on the tile, no second step.
   *
   * Passed in rather than derived here because this dialog is mounted on parent
   * surfaces that have no reason to read a gamer's session provenance — a read
   * gated to customers and gamers, which an admin opening the style guide would
   * turn into a 403.
   */
  gate?: SwitchGate;
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
 *  - parent → gamer, to drop the parent straight into a gamer's voice room,
 *    from an enrollment card on the parent dashboard or a family club page.
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
  gate = { kind: "none" },
}: SwitchProfileDialogProps) {
  const c = useTranslations("common");
  const f = useTranslations("family");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  /**
   * Confirm, then — where a gate applies — the credential, inside this same
   * box. Two steps in one dialog rather than a second dialog opened over the
   * first: stacking them would flash a backdrop over a backdrop, and the tile
   * the reader just pressed is exactly the confirmation the gate is for.
   */
  const [step, setStep] = useState<"confirm" | "gate">("confirm");
  const gated = gate.kind === "pin" || gate.kind === "password";
  // The gate's own answer that this target can never be reached from here, or
  // is not decidable yet. Neither is clickable; the tile says so by not lifting.
  const blockedByGate = gate.kind === "unreachable" || gate.kind === "unknown";

  /**
   * Every way this dialog closes goes through here, which is also the only
   * place the step resets — reopening must not land on the credential prompt
   * for a confirmation the reader never gave.
   */
  function close() {
    setStep("confirm");
    setSwitchError(null);
    onOpenChange(false);
  }

  async function handleSwitch() {
    if (isSwitching) return;
    if (blockedByGate) return;
    if (gated) {
      setStep("gate");
      return;
    }
    setIsSwitching(true);
    setSwitchError(null);

    try {
      // The redirect override is this surface's whole reason for passing one:
      // it carries an intent marker across the switch, so it lands somewhere
      // other than the target's own dashboard.
      await commitAccountSwitch(target, { redirectUrl });
    } catch (err) {
      setIsSwitching(false);
      // The reader gets the translated line; the server's own words (always
      // English, and often a bare HTTP status) go to the console for whoever
      // is debugging it. Same policy on all three switch surfaces.
      console.error("[switch-profile-dialog] account switch failed:", err);
      setSwitchError(f("switchFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSwitching && !v) close(); }}>
      {/* DialogContent itself only sets padding — `space-y-4` gives the header,
          banner, tile, and (when present) error alert consistent spacing. */}
      <DialogContent className="space-y-4">
        {step === "gate" && gated ? (
          <SwitchGateBody
            target={target}
            mode={gate.kind === "pin" ? "pin" : "password"}
            committing={isSwitching}
            onCommittingChange={setIsSwitching}
            onCommit={(credentials: SwitchAccountCredentials) =>
              // The redirect override is this surface's whole reason for
              // passing one: it carries an intent marker across the switch.
              commitAccountSwitch(target, { ...credentials, redirectUrl })
            }
            onClose={close}
          />
        ) : (
          <>
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
              disabled={isSwitching || blockedByGate}
              isLoading={isSwitching}
              note={
                gate.kind === "unreachable"
                  ? f("switchGate.unreachable")
                  : undefined
              }
            />
          </ProfileTilesRow>

          {switchError && (
            <Alert variant="destructive">
              <AlertDescription>{switchError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={isSwitching}>
              {c("cancel")}
            </Button>
          </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
