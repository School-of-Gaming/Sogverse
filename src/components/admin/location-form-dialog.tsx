"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SUPPORTED_COUNTRIES, getChildLevel } from "@/lib/constants";
import type { Location } from "@/types";

export interface LocationFormValues {
  name: string;
  type: Location["type"];
  parent_id: string | null;
  country_code: string | null;
}

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LocationFormValues) => Promise<void>;
  isPending: boolean;
  /** When set, the dialog is in "edit" mode. */
  initialValues?: Location;
  /** When adding a child, this is the parent location. */
  parent?: Location | null;
  /** Country codes that already exist (to disable in the country picker). */
  existingCountryCodes?: Set<string>;
}

export function LocationFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialValues,
  parent,
  existingCountryCodes,
}: LocationFormDialogProps) {
  if (!open) return null;

  return (
    <LocationFormDialogInner
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      isPending={isPending}
      initialValues={initialValues}
      parent={parent}
      existingCountryCodes={existingCountryCodes}
    />
  );
}

/**
 * Inner component that mounts fresh each time the dialog opens,
 * so useState initializers run with the latest props.
 */
function LocationFormDialogInner({
  onOpenChange,
  onSubmit,
  isPending,
  initialValues,
  parent,
  existingCountryCodes,
}: Omit<LocationFormDialogProps, "open">) {
  const isEditing = !!initialValues;
  const isAddingCountry = !isEditing && !parent;

  // For "add child" mode, determine the child level from the parent
  const childLevel = parent ? getChildLevel(parent.country_code, parent.type) : null;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Build the dialog title
  const title = isEditing
    ? `Edit ${initialValues.name}`
    : isAddingCountry
      ? "Add Country"
      : `Add ${childLevel?.label ?? "Location"} under ${parent!.name}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Build values per mode, validating along the way
    let values: LocationFormValues;

    if (isAddingCountry) {
      if (!selectedCountryCode) {
        setError("Please select a country");
        return;
      }
      const country = SUPPORTED_COUNTRIES.find((c) => c.code === selectedCountryCode);
      if (!country) return;
      values = { name: country.name, type: "country", parent_id: null, country_code: country.code };
    } else if (isEditing) {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      values = { name: name.trim(), type: initialValues.type, parent_id: initialValues.parent_id, country_code: initialValues.country_code };
    } else {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      if (!childLevel || !parent) return;
      values = { name: name.trim(), type: childLevel.type, parent_id: parent.id, country_code: parent.country_code };
    }

    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  };

  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  const availableCountries = SUPPORTED_COUNTRIES.filter(
    (c) => !existingCountryCodes?.has(c.code)
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {isAddingCountry ? (
              <div className="space-y-2">
                <Label htmlFor="loc-country">Country</Label>
                <select
                  id="loc-country"
                  value={selectedCountryCode}
                  onChange={(e) => setSelectedCountryCode(e.target.value)}
                  disabled={isPending}
                  className={selectClassName}
                  autoFocus
                >
                  <option value="">Select a country...</option>
                  {availableCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                {availableCountries.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All supported countries have already been added.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="loc-name">Name</Label>
                <Input
                  id="loc-name"
                  placeholder={
                    childLevel
                      ? `Enter ${childLevel.label.toLowerCase()} name`
                      : "Enter name"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                  required
                  autoFocus
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || (isAddingCountry && availableCountries.length === 0)}
            >
              {isPending
                ? isEditing ? "Saving..." : "Adding..."
                : isEditing ? "Save Changes" : isAddingCountry ? "Add Country" : `Add ${childLevel?.label ?? "Location"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
