"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAllLocations, useCreateLocation } from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import {
  LocationTree,
  buildAncestorChain,
  type LocationTreeCreateConfig,
  type LocationTreeSelection,
} from "@/components/locations/location-tree";
import type { Location } from "@/types";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "jurisdiction";

const ANCESTOR_SEPARATOR = " · ";
const JURISDICTION_TYPES = ["country", "region", "municipality"] as const;

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only sites may be picked (in-person products). Admins may
   *                  create new sites under a municipality, but not higher
   *                  levels (those are seeded reference data).
   * "jurisdiction" — countries, regions, or municipalities may be picked;
   *                  sites are hidden. Used for online municipality clubs.
   *                  No creation — the hierarchy is seeded.
   */
  pickable: PickableMode;
}

/**
 * Product-form location picker. A thin wrapper around the shared
 * `<LocationTree>` that adds the product-specific bits: the selected-state
 * summary card (with breadcrumb + member/staff site notes) and the data/
 * mutation wiring. The tree, search, and create dialog all live in the
 * shared component.
 */
export function LocationPicker({ value, onChange, pickable }: LocationPickerProps) {
  const t = useTranslations("admin.products.locationPicker");
  const [browsing, setBrowsing] = useState(false);

  const { data: locations } = useAllLocations();
  const createLocation = useCreateLocation();
  const all = useMemo(() => locations ?? [], [locations]);

  const existingCountryCodes = useMemo(
    () =>
      new Set(
        all.flatMap((l) =>
          l.type === "country" && l.country_code ? [l.country_code] : []
        )
      ),
    [all]
  );

  // Clear selection if the current pick is no longer valid for the mode.
  useEffect(() => {
    if (!value) return;
    const current = all.find((l) => l.id === value);
    if (!current) {
      onChange(null);
      return;
    }
    if (pickable === "site" && current.type !== "site") {
      onChange(null);
    } else if (pickable === "jurisdiction" && current.type === "site") {
      onChange(null);
    }
  }, [pickable, value, all, onChange]);

  const selected = value ? all.find((l) => l.id === value) : undefined;

  // Compact summary with a Change button while a valid pick is in place.
  if (selected && !browsing) {
    return (
      <SelectedSiteCard
        selected={selected}
        all={all}
        onChange={() => setBrowsing(true)}
      />
    );
  }

  const selection: LocationTreeSelection =
    pickable === "site"
      ? {
          mode: "single",
          value,
          onSelect: (id) => {
            onChange(id);
            setBrowsing(false);
          },
          pickableTypes: ["site"],
        }
      : {
          mode: "single",
          value,
          onSelect: (id) => {
            onChange(id);
            setBrowsing(false);
          },
          pickableTypes: JURISDICTION_TYPES,
          pickLabel: t("pick"),
        };

  // Creation is restricted to sites; jurisdictions are seeded reference data.
  const create: LocationTreeCreateConfig | undefined =
    pickable === "site"
      ? {
          allowedChildTypes: ["site"],
          onCreate: (values) => createLocation.mutateAsync(values),
          existingCountryCodes,
          isPending: createLocation.isPending,
        }
      : undefined;

  return (
    <div className="space-y-3">
      <LocationTree
        locations={all}
        selection={selection}
        hiddenTypes={pickable === "jurisdiction" ? ["site"] : undefined}
        create={create}
        searchPlaceholder={t("searchPlaceholder")}
        listClassName="max-h-[360px]"
      />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {pickable === "site" ? t("hintSite") : t("hintJurisdiction")}
        </span>
        {selected && (
          <button
            type="button"
            onClick={() => setBrowsing(false)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("cancel")}
          </button>
        )}
      </div>
    </div>
  );
}

interface SelectedSiteCardProps {
  selected: Location;
  all: Location[];
  onChange: () => void;
}

function SelectedSiteCard({ selected, all, onChange }: SelectedSiteCardProps) {
  const t = useTranslations("admin.products.locationPicker");
  const isSite = selected.type === "site";
  // Only sites have site_details / site_staff_details rows. For jurisdiction
  // picks we skip the fetch.
  const { data: details } = useSiteDetails(isSite ? selected.id : null);
  const chain = buildAncestorChain(selected, all)
    .filter((a) => a.id !== selected.id)
    .filter((a) => a.type !== "country");

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selected.name}</span>
                {!isSite && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {selected.type}
                  </span>
                )}
              </div>
              {chain.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {chain.map((a) => a.name).join(ANCESTOR_SEPARATOR)}
                </div>
              )}
              {!isSite && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noVenueHint", { name: selected.name })}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChange}
            className="shrink-0 gap-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("change")}
          </Button>
        </div>
      </div>

      {isSite && (
        <>
          <SiteNotesEditor
            locationId={selected.id}
            tier="member"
            address={details?.member?.address ?? null}
            notes={details?.member?.notes ?? null}
          />
          <SiteNotesEditor
            locationId={selected.id}
            tier="staff"
            notes={details?.staff?.notes ?? null}
          />
        </>
      )}
    </div>
  );
}
