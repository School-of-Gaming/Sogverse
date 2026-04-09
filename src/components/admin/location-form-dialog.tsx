"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations('admin.locations');
  const c = useTranslations('common');
  const isEditing = !!initialValues;
  const isAddingCountry = !isEditing && !parent;

  // For "add child" mode, determine the child level from the parent
  const childLevel = parent ? getChildLevel(parent.country_code, parent.type) : null;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Build the dialog title
  const title = isEditing
    ? t('editName', { name: initialValues.name })
    : isAddingCountry
      ? t('addCountry')
      : t('addChildUnder', { type: childLevel?.label ?? t('location'), parent: parent!.name });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Build values per mode, validating along the way
    let values: LocationFormValues;

    if (isAddingCountry) {
      if (!selectedCountryCode) {
        setError(t('pleaseSelectCountry'));
        return;
      }
      const country = SUPPORTED_COUNTRIES.find((c) => c.code === selectedCountryCode);
      if (!country) return;
      values = { name: country.name, type: "country", parent_id: null, country_code: country.code };
    } else if (isEditing) {
      if (!name.trim()) {
        setError(t('nameRequired'));
        return;
      }
      values = { name: name.trim(), type: initialValues.type, parent_id: initialValues.parent_id, country_code: initialValues.country_code };
    } else {
      if (!name.trim()) {
        setError(t('nameRequired'));
        return;
      }
      if (!childLevel || !parent) return;
      values = { name: name.trim(), type: childLevel.type, parent_id: parent.id, country_code: parent.country_code };
    }

    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c('unexpectedError'));
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
                <Label htmlFor="loc-country">{t('country')}</Label>
                <select
                  id="loc-country"
                  value={selectedCountryCode}
                  onChange={(e) => setSelectedCountryCode(e.target.value)}
                  disabled={isPending}
                  className={selectClassName}
                  autoFocus
                >
                  <option value="">{t('selectCountry')}</option>
                  {availableCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                {availableCountries.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('allCountriesAdded')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="loc-name">{t('name')}</Label>
                <Input
                  id="loc-name"
                  placeholder={
                    childLevel
                      ? t('enterTypeName', { type: childLevel.label.toLowerCase() })
                      : t('enterName')
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
              {c('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isPending || (isAddingCountry && availableCountries.length === 0)}
            >
              {isPending
                ? isEditing ? c('saving') : t('adding')
                : isEditing ? c('saveChanges') : isAddingCountry ? t('addCountry') : t('addType', { type: childLevel?.label ?? t('location') })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
