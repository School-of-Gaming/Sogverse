"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, MapPin, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAllLocations, useCreateLocation } from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import {
  LocationTree,
  buildAncestorChain,
  type LocationTreeCreateConfig,
  type LocationTreeSelection,
} from "@/components/locations/location-tree";
import { CatalogPickerDialog } from "@/components/locations/catalog-picker";
import type { Location } from "@/types";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "municipality";

const ANCESTOR_SEPARATOR = " · ";
// Online municipality clubs anchor to a Finnish municipality only. The DB
// trigger still permits country/region (it predates this UI rule), so the
// enforcement lives here: the tree is filtered to Finland and only
// municipality rows are selectable. Tightened from the older
// country/region/municipality "jurisdiction" picker.
const MUNI_COUNTRY_CODE = "FI";

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only sites may be picked (in-person products). Admins may
   *                  name new sites under a municipality, and add a missing
   *                  municipality from its country's official catalog. No level
   *                  above a site is ever typed by hand.
   * "municipality" — only Finnish municipalities may be picked; the tree is
   *                  filtered to Finland and sites/countries/regions are not
   *                  selectable. Used for online municipality clubs (the
   *                  municipality that funds the club). No creation — the
   *                  hierarchy is seeded.
   */
  pickable: PickableMode;
}

/**
 * Product-form location picker. A thin wrapper around the shared
 * `<LocationTree>` that adds the product-specific bits: the selected-state
 * summary card (with breadcrumb + member/staff site notes) and the data/
 * mutation wiring. The tree, search, and create dialog all live in the
 * shared component.
 *
 * In site mode it also owns the bridge between the two shared components: the
 * catalog picker materializes a municipality, and the tree is then told to
 * reveal it so the admin's next click is the "+ Site" button on that row.
 */
export function LocationPicker({ value, onChange, pickable }: LocationPickerProps) {
  const t = useTranslations("admin.products.locationPicker");
  const [browsing, setBrowsing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  // The municipality a catalog pick just materialized: the tree reveals it so
  // the admin's next click ("+ Site") is already under the cursor.
  const [focusId, setFocusId] = useState<string | null>(null);

  const { data: locations } = useAllLocations();
  const createLocation = useCreateLocation();
  const all = useMemo(() => locations ?? [], [locations]);

  // Municipality mode shows Finland only — every FI row (country, region,
  // municipality) carries country_code "FI", so this keeps the navigable
  // chain down to the selectable municipalities while hiding other countries.
  // Site mode is unchanged (full tree, sites selectable/creatable anywhere).
  const treeLocations = useMemo(
    () =>
      pickable === "municipality"
        ? all.filter((l) => l.country_code === MUNI_COUNTRY_CODE)
        : all,
    [all, pickable]
  );

  // Clear selection if the current pick is no longer valid for the mode.
  useEffect(() => {
    if (!value) return;
    // Locations load async; until they're here, "not found" just means "not
    // loaded yet" — don't mistake that for an invalid pick and wipe a valid
    // location_id while editing an existing product.
    if (all.length === 0) return;
    const current = all.find((l) => l.id === value);
    if (!current) {
      onChange(null);
      return;
    }
    if (pickable === "site" && current.type !== "site") {
      onChange(null);
    } else if (
      pickable === "municipality" &&
      (current.type !== "municipality" ||
        current.country_code !== MUNI_COUNTRY_CODE)
    ) {
      // Drops legacy/staging picks that aren't a FI municipality (e.g. an
      // online muni club previously anchored to a region or country), forcing
      // the admin to re-pick a valid municipality when they next edit.
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
          pickableTypes: ["municipality"],
          pickLabel: t("pick"),
        };

  // Creation is restricted to sites, and that is the whole rule: every level
  // above a site comes from an official catalog, by seed or by materialization.
  const create: LocationTreeCreateConfig | undefined =
    pickable === "site"
      ? {
          allowedChildTypes: ["site"],
          onCreate: (values) => createLocation.mutateAsync(values),
          isPending: createLocation.isPending,
        }
      : undefined;

  return (
    <div className="space-y-3">
      <LocationTree
        locations={treeLocations}
        selection={selection}
        hiddenTypes={pickable === "municipality" ? ["site"] : undefined}
        create={create}
        focusId={pickable === "site" ? focusId : null}
        searchPlaceholder={t("searchPlaceholder")}
        listClassName="max-h-[360px]"
      />

      {pickable === "site" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setCatalogOpen(true)}
        >
          <Landmark className="h-3.5 w-3.5" />
          {t("addFromCatalog")}
        </Button>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {pickable === "site" ? t("hintSite") : t("hintMunicipality")}
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

      {pickable === "site" && (
        <CatalogPickerDialog
          open={catalogOpen}
          onOpenChange={setCatalogOpen}
          onMaterialized={(location) => {
            setCatalogOpen(false);
            // The list invalidation the mutation fired is still in flight; the
            // tree reveals the row as soon as the refetch delivers it.
            setFocusId(location.id);
          }}
        />
      )}
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
  const locale = useLocale();
  const selectedName = localizedLocationName(selected, locale);
  const isSite = selected.type === "site";
  // Only sites have site_details / site_staff_details rows. For municipality
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
                <span className="font-medium">{selectedName}</span>
                {!isSite && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {selected.type}
                  </span>
                )}
              </div>
              {chain.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {chain
                    .map((a) => localizedLocationName(a, locale))
                    .join(ANCESTOR_SEPARATOR)}
                </div>
              )}
              {!isSite && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noVenueHint", { name: selectedName })}
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
