"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
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
import { getChildLevel, resolveLabels } from "@/lib/constants";
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
 * The one dialog for naming a location by hand. Two modes remain — rename an
 * existing row, or add a child under a parent — and in practice the child is
 * always a `site`.
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
  /** When set, the dialog is in "edit" mode. */
  initialValues?: Location;
  /** When adding a child, this is the parent location. */
  parent?: LocationFormParent | null;
}

export function LocationFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  initialValues,
  parent,
}: LocationFormDialogProps) {
  // Nothing to name without either a row to rename or a parent to add under.
  if (!open || (!initialValues && !parent)) return null;

  return (
    <LocationFormDialogInner
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      isPending={isPending}
      initialValues={initialValues}
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
  initialValues,
  parent,
}: Omit<LocationFormDialogProps, "open">) {
  const t = useTranslations('admin.locations');
  const c = useTranslations('common');
  const locale = useLocale();
  const isEditing = !!initialValues;

  // For "add child" mode, determine the child level from the parent
  const childLevel = parent ? getChildLevel(parent.country_code, parent.type) : null;
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const title = isEditing
    ? t('editName', { name: initialValues.name })
    : t('addChildUnder', {
        type: childLabels?.label ?? t('location'),
        parent: parent ? localizedLocationName(parent, locale) : t('location'),
      });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('nameRequired'));
      return;
    }

    let values: LocationFormValues;
    if (isEditing) {
      values = { name: name.trim(), type: initialValues.type, parent_id: initialValues.parent_id };
    } else {
      if (!childLevel || !parent) return;
      values = { name: name.trim(), type: childLevel.type, parent_id: parent.id };
    }

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
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
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
                ? isEditing ? c('saving') : t('adding')
                : isEditing ? c('saveChanges') : t('addType', { type: childLabels?.label ?? t('location') })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
