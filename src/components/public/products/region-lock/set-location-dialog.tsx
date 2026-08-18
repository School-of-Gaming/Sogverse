"use client";

import { useState } from "react";
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
import { Field } from "@/components/ui/field";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";

/**
 * **Setting the family's location without leaving the product page.**
 *
 * The region lock's no-location state is a missing input rather than a refusal,
 * so the signup panel asks for it where the parent already is. That is the same
 * interaction shape the panel's other in-place fix uses — the add-a-child
 * dialog opened from the picker — for the same reason: the parent is
 * mid-purchase, and sending them to settings at that moment loses the sale.
 *
 * **The picker inside is the real one**, dialog and all: what settings and
 * registration render, reading live location rows. Nothing about picking a
 * place is re-implemented for this surface.
 *
 * **Persisting is the caller's**, handed in as one async function. The live
 * panel writes the profile with it; a preview scene fakes the wait and
 * re-derives its own gate. That split is what lets this dialog be reviewed on a
 * fixture page without a profile row behind it, and it keeps the dialog itself
 * free of any knowledge of how a location is stored.
 *
 * The dialog is only ever offered to a parent who has no location stored, so
 * there is nothing to read before it opens and no saved value it could clobber:
 * the field starts empty, and the save button is dead until a place is picked.
 * State lives in the inner form and the shell unmounts it on close, so a
 * reopened dialog starts empty rather than resuming a half-finished pick.
 */
interface SetLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Persist the pick. Resolving closes the dialog; rejecting re-enables the
   * button and surfaces the message, because the parent is still standing in
   * front of the thing they wanted to change.
   */
  onSave: (pick: LocationPick) => Promise<void>;
}

export function SetLocationDialog({
  open,
  onOpenChange,
  onSave,
}: SetLocationDialogProps) {
  if (!open) return null;
  return <SetLocationForm onOpenChange={onOpenChange} onSave={onSave} />;
}

function SetLocationForm({
  onOpenChange,
  onSave,
}: {
  onOpenChange: (open: boolean) => void;
  onSave: (pick: LocationPick) => Promise<void>;
}) {
  const t = useTranslations("productDetail.signupPanel.regionLock");
  const c = useTranslations("common");

  const [pick, setPick] = useState<LocationPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Flipped synchronously before the save, so there is no render between the
  // click and the outcome where the button is live again. Cleared only on the
  // failure path, which is the one outcome that leaves the parent here with
  // something to retry; on success the dialog unmounts and takes the flag with
  // it.
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (pick === null) return;
    setError(null);
    setSaving(true);
    onSave(pick)
      .then(() => onOpenChange(false))
      .catch((err: unknown) => {
        setSaving(false);
        setError(err instanceof Error ? err.message : c("somethingWentWrong"));
      });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="mt-5">
          <Field label={t("dialogField")} htmlFor="regionHome">
            <HomeLocationField
              id="regionHome"
              value={pick}
              onChange={setPick}
              disabled={saving}
            />
          </Field>
        </div>

        {error !== null && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {c("cancel")}
          </Button>
          <Button disabled={pick === null || saving} onClick={handleSave}>
            {saving ? c("saving") : t("dialogSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
