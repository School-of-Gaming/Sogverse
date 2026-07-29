"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, MapPin, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useMunicipalitiesByCountry,
  useSites,
  type LocationChainNode,
  type LocationWithChain,
} from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";
import type { Location } from "@/types";
import { LocationList, type LocationListGroup } from "./location-list";
import { NewVenueDialog } from "./new-venue-dialog";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "municipality";

const ANCESTOR_SEPARATOR = " · ";

// Online municipality clubs anchor to a Finnish municipality only. The DB
// trigger still permits country/region (it predates this UI rule), so the
// enforcement lives here: the only rows offered are Finland's municipalities,
// and a pick outside that set is cleared on load.
const MUNI_COUNTRY_CODE = "FI";

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only venues may be picked (in-person products). The list
   *                  is the venues that exist; opening a new one starts from
   *                  the official catalog, so the municipality above it is
   *                  always an official row and never a typed name.
   * "municipality" — only Finnish municipalities may be picked. Used for online
   *                  municipality clubs (the municipality that funds the club).
   *                  No creation — the hierarchy is seeded.
   */
  pickable: PickableMode;
}

/**
 * Product-form location picker.
 *
 * Nothing here browses the `locations` table as a tree. Both modes read a
 * small, scoped slice of it — every venue, or one country's municipalities —
 * and the exhaustive geography an admin drills through to open a *new* venue
 * comes from the static catalog instead, which is the only thing that scales
 * to 34,875 French communes.
 */
export function LocationPicker({ value, onChange, pickable }: LocationPickerProps) {
  return pickable === "site" ? (
    <SitePicker value={value} onChange={onChange} />
  ) : (
    <MunicipalityPicker value={value} onChange={onChange} />
  );
}

interface ModeProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

function SitePicker({ value, onChange }: ModeProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();
  const [browsing, setBrowsing] = useState(false);
  const [newVenueOpen, setNewVenueOpen] = useState(false);

  const { data: sites } = useSites();

  // Clear a pick that is not a venue any more (a deleted row, or a legacy
  // product pinned above site level). `sites` is undefined until the query
  // lands, and "not loaded yet" must never be mistaken for "not a venue" —
  // that would wipe a valid location_id while editing an existing product.
  useEffect(() => {
    if (!value || !sites) return;
    if (!sites.some((site) => site.id === value)) onChange(null);
  }, [value, sites, onChange]);

  const groups = useMemo(() => groupSitesByParent(sites ?? [], locale), [sites, locale]);

  const selected = sites?.find((site) => site.id === value);

  if (!sites) return <PickerSkeleton label={t("loading")} />;

  if (selected && !browsing) {
    return (
      <SelectedLocationCard
        location={selected}
        ancestors={selected.ancestors}
        onEdit={() => setBrowsing(true)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <LocationList
        groups={groups}
        value={value}
        onSelect={(id) => {
          onChange(id);
          setBrowsing(false);
        }}
        labels={{
          searchPlaceholder: t("searchSites"),
          clearSearch: t("clearSearch"),
          empty: t("noVenues"),
          noResults: (query) => t("noResults", { query }),
          loading: t("loading"),
        }}
        footer={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setNewVenueOpen(true)}
          >
            <Landmark className="h-3.5 w-3.5" />
            {t("newVenue")}
          </Button>
        }
      />

      <PickerHint
        hint={t("hintSite")}
        onCancel={selected ? () => setBrowsing(false) : undefined}
        cancelLabel={t("cancel")}
      />

      <NewVenueDialog
        open={newVenueOpen}
        onOpenChange={setNewVenueOpen}
        onPick={(site) => {
          setNewVenueOpen(false);
          onChange(site.id);
          setBrowsing(false);
        }}
      />
    </div>
  );
}

function MunicipalityPicker({ value, onChange }: ModeProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();
  const [browsing, setBrowsing] = useState(false);

  const { data: municipalities } = useMunicipalitiesByCountry(MUNI_COUNTRY_CODE);

  // The query returns exactly the pickable set, so "not in it" covers both
  // invalid shapes at once: a legacy pick anchored to a region or a country,
  // and a municipality outside Finland. Either way the admin re-picks.
  useEffect(() => {
    if (!value || !municipalities) return;
    if (!municipalities.some((row) => row.id === value)) onChange(null);
  }, [value, municipalities, onChange]);

  const groups = useMemo(
    () => groupMunicipalitiesByRegion(municipalities ?? [], locale, t("ungrouped")),
    [municipalities, locale, t],
  );

  const selected = municipalities?.find((row) => row.id === value);

  if (!municipalities) return <PickerSkeleton label={t("loading")} />;

  if (selected && !browsing) {
    return (
      <SelectedLocationCard
        location={selected}
        ancestors={selected.ancestors}
        onEdit={() => setBrowsing(true)}
      />
    );
  }

  return (
    <div className="space-y-3">
      <LocationList
        groups={groups}
        value={value}
        onSelect={(id) => {
          onChange(id);
          setBrowsing(false);
        }}
        labels={{
          searchPlaceholder: t("searchMunicipalities"),
          clearSearch: t("clearSearch"),
          empty: t("noMunicipalities"),
          noResults: (query) => t("noResults", { query }),
          loading: t("loading"),
        }}
      />

      <PickerHint
        hint={t("hintMunicipality")}
        onCancel={selected ? () => setBrowsing(false) : undefined}
        cancelLabel={t("cancel")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** The chain minus the country row, nearest first. */
function meaningfulAncestors(ancestors: LocationChainNode[]): LocationChainNode[] {
  return ancestors.filter((node) => node.type !== "country");
}

function searchTermsOf(node: { name: string; name_i18n: Location["name_i18n"] }) {
  return [node.name, ...localizedNameAlternates(node)];
}

/**
 * Venues under the place they sit in. `ancestors[0]` is the municipality
 * whatever the country's depth, and the rest of the chain becomes the header's
 * context so the region is visible without opening anything.
 */
function groupSitesByParent(
  sites: LocationWithChain[],
  locale: string,
): LocationListGroup[] {
  const groups = new Map<string, LocationListGroup>();

  for (const site of sites) {
    const chain = meaningfulAncestors(site.ancestors);
    // `.at()` rather than `[0]`: the chain really can be empty (a site whose
    // parent row is missing), and index access would type that away.
    const parent = chain.at(0);
    const rest = chain.slice(1);
    const key = parent?.id ?? "__none__";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: parent ? localizedLocationName(parent, locale) : "",
        detail: rest
          .map((node) => localizedLocationName(node, locale))
          .join(ANCESTOR_SEPARATOR),
        searchTerms: parent ? searchTermsOf(parent) : [],
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push({
      id: site.id,
      name: localizedLocationName(site, locale),
      detail: "",
      searchTerms: searchTermsOf(site),
    });
  }

  return sortGroups([...groups.values()], locale);
}

/** Finland's municipalities under their maakunta. */
function groupMunicipalitiesByRegion(
  municipalities: LocationWithChain[],
  locale: string,
  ungroupedLabel: string,
): LocationListGroup[] {
  const groups = new Map<string, LocationListGroup>();

  for (const municipality of municipalities) {
    const region = meaningfulAncestors(municipality.ancestors).at(0);
    const key = region?.id ?? "__none__";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: region ? localizedLocationName(region, locale) : ungroupedLabel,
        detail: "",
        searchTerms: region ? searchTermsOf(region) : [],
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push({
      id: municipality.id,
      name: localizedLocationName(municipality, locale),
      detail: "",
      searchTerms: searchTermsOf(municipality),
    });
  }

  return sortGroups([...groups.values()], locale);
}

/** Alphabetical in the viewer's collation, headers and rows alike. */
function sortGroups(
  groups: LocationListGroup[],
  locale: string,
): LocationListGroup[] {
  for (const group of groups) {
    group.rows.sort((a, b) => a.name.localeCompare(b.name, locale));
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label, locale));
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * The list's height, with nothing readable or clickable in it. A placeholder
 * with no content constrains nothing when the real body replaces it — whereas
 * rendering the browse list first and swapping it for the selected-venue card
 * would move things the admin is already reading.
 */
function PickerSkeleton({ label }: { label: string }) {
  return (
    <div
      className="h-[400px] animate-pulse rounded-md bg-muted"
      aria-label={label}
    />
  );
}

interface PickerHintProps {
  hint: string;
  onCancel?: () => void;
  cancelLabel: string;
}

function PickerHint({ hint, onCancel, cancelLabel }: PickerHintProps) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{hint}</span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {cancelLabel}
        </button>
      )}
    </div>
  );
}

interface SelectedLocationCardProps {
  location: Location;
  /** The row's chain, nearest first, as the scoped reads return it. */
  ancestors: LocationChainNode[];
  onEdit: () => void;
}

function SelectedLocationCard({
  location,
  ancestors,
  onEdit,
}: SelectedLocationCardProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();
  const selectedName = localizedLocationName(location, locale);
  const isSite = location.type === "site";
  // Only sites have site_details / site_staff_details rows. For municipality
  // picks we skip the fetch.
  const { data: details } = useSiteDetails(isSite ? location.id : null);
  // Root first, so it reads "Uusimaa · Helsinki" the way a breadcrumb does.
  const chain = meaningfulAncestors(ancestors).slice().reverse();

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
                    {location.type}
                  </span>
                )}
              </div>
              {chain.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {chain
                    .map((node) => localizedLocationName(node, locale))
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
            onClick={onEdit}
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
            locationId={location.id}
            tier="member"
            address={details?.member?.address ?? null}
            notes={details?.member?.notes ?? null}
          />
          <SiteNotesEditor
            locationId={location.id}
            tier="staff"
            notes={details?.staff?.notes ?? null}
          />
        </>
      )}
    </div>
  );
}
