"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getChildLevel, resolveLabels } from "@/lib/constants/location-hierarchies";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { Location } from "@/types";

/**
 * No `country_code`: the create route derives it from the parent row and
 * discards whatever a client sends, so naming it here would be a value nobody
 * reads. The parent's code is still used *in* this dialog — to resolve which
 * level sits below the parent and what that country calls it.
 */
export interface LocationFormValues {
  name: string;
  type: Location["type"];
  parent_id: string | null;
}

/**
 * What "add a child under this" needs to know about the parent: which row, what
 * to call it, and which country's level names apply below it. Declared as its
 * own shape rather than the whole row so a caller holding a picked place — which
 * is a browse row or a search hit, not a full select — can pass it directly.
 */
export type LocationFormParent = Pick<
  Location,
  "id" | "name" | "name_i18n" | "type" | "country_code"
>;

/**
 * The one dialog for naming a location by hand: adding a child under a parent,
 * and in practice the child is always a `site`.
 *
 * There is deliberately no "add a country" mode any more, and no free-text
 * creation above the site level. Countries, regions and municipalities are
 * official reference data seeded from each country's statistical
 * classification, never named by someone typing. A site is the only level that
 * exists in no national classification, which is why it is the only one an
 * admin names.
 */
interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LocationFormValues) => Promise<void>;
  isPending: boolean;
  /** The location the new one is added under. */
  parent: LocationFormParent;
}

export function LocationFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  parent,
}: LocationFormDialogProps) {
  if (!open) return null;

  return (
    <LocationFormDialogInner
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      isPending={isPending}
      parent={parent}
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
  parent,
}: Omit<LocationFormDialogProps, "open">) {
  const t = useTranslations('admin.locations');
  const c = useTranslations('common');
  const locale = useLocale();

  // The level below the parent, and what the parent's country calls it.
  const childLevel = getChildLevel(parent.country_code, parent.type);
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const title = t('addChildUnder', {
    type: childLabels?.label ?? t('location'),
    parent: localizedLocationName(parent, locale),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('nameRequired'));
      return;
    }

    if (!childLevel) return;
    const values: LocationFormValues = {
      name: name.trim(),
      type: childLevel.type,
      parent_id: parent.id,
    };

    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c('unexpectedError'));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field label={t('name')} htmlFor="loc-name">
              <Input
                id="loc-name"
                placeholder={
                  childLevel
                    ? t('enterTypeName', { type: childLabels!.label.toLowerCase() })
                    : t('enterName')
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                required
                autoFocus
              />
            </Field>
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
            <Button type="submit" disabled={isPending}>
              {isPending
                ? t('adding')
                : t('addType', { type: childLabels?.label ?? t('location') })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
