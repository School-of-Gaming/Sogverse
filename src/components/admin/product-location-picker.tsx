"use client";

/**
 * Product location picker for the admin product form.
 *
 * Remote | In-person toggle. When In-person, renders cascading dropdowns
 * dynamically from `SUPPORTED_COUNTRIES[countryCode].hierarchy` — so FI shows
 * Country → Maakunta → Kunta → Site, US shows Country → State → City →
 * School District → Site, and adding a new country to the table automatically
 * works here with zero code changes.
 *
 * Every dropdown has a "+" button that opens LocationFormDialog inline so
 * admins can build out a Country → Region → City → Site chain without leaving
 * the product form. The deepest selection must be a `site` (leaf) — the submit
 * button in the parent form stays disabled until `location_id` is a site.
 */

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LocationFormDialog, type LocationFormValues } from "@/components/admin/location-form-dialog";
import { buildAncestorChain } from "@/components/locations/location-tree";
import { useAllLocations, useCreateLocation } from "@/services/locations";
import {
  getChildLevel,
  getCountryConfig,
  getCountryName,
  resolveLabels,
  type HierarchyLevel,
} from "@/lib/constants";
import type { Location, LocationType } from "@/types";

interface ProductLocationPickerProps {
  isRemote: boolean;
  locationId: string | null;
  onChange: (next: { isRemote: boolean; locationId: string | null }) => void;
  disabled?: boolean;
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const EMPTY_SELECTION: Record<LocationType, string | null> = {
  country: null,
  region: null,
  municipality: null,
  district: null,
  site: null,
};

export function ProductLocationPicker({
  isRemote,
  locationId,
  onChange,
  disabled,
}: ProductLocationPickerProps) {
  const t = useTranslations("admin.productLocation");
  const tLoc = useTranslations("admin.locations");
  const locale = useLocale();

  const { data: allLocations } = useAllLocations();
  const createLocation = useCreateLocation();

  // Local override that takes effect once the admin starts clicking. Before
  // that, the visible selection is derived from the incoming `locationId`
  // prop — so edit mode "hydrates" automatically without a setState-in-render
  // or setState-in-effect hop.
  const [localSelectedIds, setLocalSelectedIds] = useState<Record<
    LocationType,
    string | null
  > | null>(null);

  const selectedIds = useMemo<Record<LocationType, string | null>>(() => {
    if (localSelectedIds) return localSelectedIds;
    if (!allLocations || !locationId) return EMPTY_SELECTION;
    const current = allLocations.find((l) => l.id === locationId);
    if (!current) return EMPTY_SELECTION;
    const next = { ...EMPTY_SELECTION };
    for (const loc of buildAncestorChain(current, allLocations)) {
      next[loc.type] = loc.id;
    }
    return next;
  }, [allLocations, locationId, localSelectedIds]);

  // Dialog state — which parent to create a child under, if any.
  const [dialogParent, setDialogParent] = useState<Location | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // When creating a country, we need a signal that the dialog is in country mode.
  const [dialogMode, setDialogMode] = useState<"country" | "child">("child");

  const countryRows = useMemo(
    () => (allLocations ?? []).filter((l) => l.type === "country"),
    [allLocations],
  );

  const selectedCountry = useMemo(
    () => countryRows.find((c) => c.id === selectedIds.country) ?? null,
    [countryRows, selectedIds.country],
  );

  const hierarchy: HierarchyLevel[] = useMemo(() => {
    if (!selectedCountry) return [];
    return getCountryConfig(selectedCountry.country_code)?.hierarchy ?? [];
  }, [selectedCountry]);

  // For each level in the hierarchy, find the rows whose parent is the
  // previous-level's selection.
  const childrenByLevel = useMemo(() => {
    const result = new Map<LocationType, Location[]>();
    if (!allLocations || !selectedCountry) return result;

    let parentId: string | null = selectedCountry.id;
    for (const level of hierarchy) {
      const rows = allLocations.filter(
        (l) => l.parent_id === parentId && l.type === level.type,
      );
      result.set(level.type, rows);
      const nextSelected = selectedIds[level.type];
      if (!nextSelected) break;
      parentId = nextSelected;
    }
    return result;
  }, [allLocations, hierarchy, selectedCountry, selectedIds]);

  const existingCountryCodes = useMemo(
    () => new Set(countryRows.map((c) => c.country_code ?? "").filter(Boolean)),
    [countryRows],
  );

  // Propagate the deepest site selection up to the parent form. If the
  // admin stops short of a site, we pass null so the submit stays disabled.
  function commitLocation(nextSelected: Record<LocationType, string | null>) {
    setLocalSelectedIds(nextSelected);
    const siteId = nextSelected.site;
    onChange({ isRemote: false, locationId: siteId });
  }

  function handleLevelSelect(levelType: LocationType, id: string) {
    const next = { ...selectedIds, [levelType]: id };
    // Clear every level deeper than the one we just changed.
    const idx = hierarchy.findIndex((h) => h.type === levelType);
    for (let i = idx + 1; i < hierarchy.length; i++) {
      next[hierarchy[i].type] = null;
    }
    commitLocation(next);
  }

  function handleCountrySelect(id: string) {
    commitLocation({
      country: id,
      region: null,
      municipality: null,
      district: null,
      site: null,
    });
  }

  function openAddChild(parent: Location) {
    setDialogParent(parent);
    setDialogMode("child");
    setDialogOpen(true);
  }

  function openAddCountry() {
    setDialogParent(null);
    setDialogMode("country");
    setDialogOpen(true);
  }

  async function handleDialogSubmit(values: LocationFormValues) {
    const created = await createLocation.mutateAsync(values);
    // Auto-select the newly created row at its level.
    if (values.type === "country") {
      commitLocation({
        country: created.id,
        region: null,
        municipality: null,
        district: null,
        site: null,
      });
    } else {
      handleLevelSelect(values.type, created.id);
    }
  }

  if (isRemote) {
    return (
      <div className="space-y-2">
        <Label>{t("locationLabel")}</Label>
        <ModeToggle
          isRemote
          onChange={(remote) => {
            if (remote) {
              onChange({ isRemote: true, locationId: null });
            } else {
              // Re-populate locationId from any prior site selection.
              onChange({ isRemote: false, locationId: selectedIds.site });
            }
          }}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label>{t("locationLabel")}</Label>
      <ModeToggle
        isRemote={false}
        onChange={(remote) => {
          if (remote) onChange({ isRemote: true, locationId: null });
        }}
        disabled={disabled}
      />

      {/* Country dropdown — always present. */}
      <div className="space-y-2">
        <Label htmlFor="product-location-country">{tLoc("country")}</Label>
        <div className="flex gap-2">
          <select
            id="product-location-country"
            value={selectedIds.country ?? ""}
            onChange={(e) => handleCountrySelect(e.target.value)}
            disabled={disabled || !allLocations}
            className={selectClassName}
          >
            <option value="">{tLoc("selectCountry")}</option>
            {countryRows.map((country) => {
              const config = getCountryConfig(country.country_code);
              const displayName = config
                ? getCountryName(config, locale)
                : country.name;
              return (
                <option key={country.id} value={country.id}>
                  {displayName}
                </option>
              );
            })}
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={openAddCountry}
            disabled={disabled}
            title={tLoc("addCountry")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cascading child-level dropdowns — one per hierarchy level. Each
          dropdown is enabled only when the previous level has a selection. */}
      {selectedCountry &&
        hierarchy.map((level, idx) => {
          const parentType: LocationType =
            idx === 0 ? "country" : hierarchy[idx - 1].type;
          const parentId: string | null =
            idx === 0 ? selectedCountry.id : selectedIds[parentType];
          const disabledLevel = disabled || !parentId;
          const rows = childrenByLevel.get(level.type) ?? [];
          const labels = resolveLabels(level, locale);
          const parentLocation: Location | null = parentId
            ? allLocations?.find((l) => l.id === parentId) ?? null
            : null;
          const childLevelExists = getChildLevel(
            selectedCountry.country_code,
            parentType,
          );

          return (
            <div key={level.type} className="space-y-2">
              <Label htmlFor={`product-location-${level.type}`}>
                {labels.label}
              </Label>
              <div className="flex gap-2">
                <select
                  id={`product-location-${level.type}`}
                  value={selectedIds[level.type] ?? ""}
                  onChange={(e) => handleLevelSelect(level.type, e.target.value)}
                  disabled={disabledLevel}
                  className={selectClassName}
                >
                  <option value="">
                    {t("selectLevel", { type: labels.label })}
                  </option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => parentLocation && openAddChild(parentLocation)}
                  disabled={disabledLevel || !parentLocation || !childLevelExists}
                  title={tLoc("addChildUnder", {
                    type: labels.label,
                    parent: parentLocation?.name ?? "",
                  })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

      {selectedCountry && !selectedIds.site && (
        <p className="text-xs text-muted-foreground">{t("selectSiteHint")}</p>
      )}

      <LocationFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleDialogSubmit}
        isPending={createLocation.isPending}
        parent={dialogMode === "child" ? dialogParent : null}
        existingCountryCodes={existingCountryCodes}
      />
    </div>
  );
}

function ModeToggle({
  isRemote,
  onChange,
  disabled,
}: {
  isRemote: boolean;
  onChange: (isRemote: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.productLocation");
  const options: Array<{ value: boolean; label: string }> = [
    { value: true, label: t("remote") },
    { value: false, label: t("inPerson") },
  ];
  return (
    <div className="flex w-fit rounded-md border border-input" role="radiogroup">
      {options.map((opt) => {
        const active = opt.value === isRemote;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
