"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { regionLockCopy } from "./region-lock-copy";

/**
 * **Setting the family's location without leaving the product page.**
 *
 * The no-location half of the region lock is a missing input, not a refusal, so
 * every candidate variant offers a way to supply it right here rather than
 * sending a parent to settings and hoping they come back. The dialog is the
 * same interaction shape the panel's other in-place fix already uses — the
 * add-a-child dialog opened from the picker — for the same reason: the parent
 * is mid-purchase, and a page navigation at that moment loses the sale.
 *
 * **The picker inside is the real one.** `HomeLocationField` is what settings
 * and registration render, dialog and all, reading real location rows over the
 * network. That is deliberate even in a fixture-driven preview: a hand-built
 * stand-in would answer the one question this scene cannot otherwise answer —
 * whether a full location browser opening on top of the signup rail is usable —
 * with a shape nobody will ever ship.
 *
 * **The save is inert**, as every backend-touching action in a preview scene
 * is: the button holds its committing state for a beat and the dialog closes,
 * and the panel behind it stays exactly as blocked as it was, because there is
 * no profile row here to write and nothing to re-derive the gate from. That is
 * the honest fixture answer, and it leaves the blocked panel on screen to be
 * reopened; the unlocked panel has its own scenario.
 *
 * State lives in the inner form and the shell unmounts it on close, so a
 * reopened dialog starts empty rather than resuming a half-finished pick.
 */
interface SetLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetLocationDialog({
  open,
  onOpenChange,
}: SetLocationDialogProps) {
  if (!open) return null;
  return <SetLocationForm onOpenChange={onOpenChange} />;
}

/**
 * Long enough that the committing state is visibly the same beat a real save
 * takes, short enough not to annoy a reviewer clicking through variants — the
 * same reasoning (and the same order of magnitude) as the preview signup
 * panel's faked commit.
 */
const FAKE_SAVE_MS = 600;

function SetLocationForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [pick, setPick] = useState<LocationPick | null>(null);
  // Flipped synchronously before the (faked) save, and never cleared: the
  // dialog unmounts on the way out, which is what holds the button disabled
  // through the close instead of letting it re-enable for a frame.
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{regionLockCopy.dialog.title}</DialogTitle>
          <DialogDescription>
            {regionLockCopy.dialog.description}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5">
          <Field label={regionLockCopy.dialog.fieldLabel} htmlFor="regionHome">
            <HomeLocationField
              id="regionHome"
              value={pick}
              onChange={setPick}
              disabled={saving}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {regionLockCopy.dialog.cancel}
          </Button>
          <Button
            disabled={pick === null || saving}
            onClick={() => {
              setSaving(true);
              setTimeout(() => onOpenChange(false), FAKE_SAVE_MS);
            }}
          >
            {saving ? regionLockCopy.dialog.saving : regionLockCopy.dialog.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
