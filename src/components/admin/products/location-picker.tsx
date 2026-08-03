"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, MapPin, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useMunicipalitiesByCountry,
  useSites,
  type LocationChainNode,
} from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import { LocationPickerPanel } from "@/components/locations/location-picker-panel";
import { groupLocationsByParent } from "@/components/locations/location-groups";
import { withoutCountry } from "@/lib/locations/ancestor-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { shouldDropStoredPick } from "@/lib/locations/stored-pick";
import type { Location } from "@/types";
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
   *                  is the venues that exist; opening a new one starts by
   *                  browsing the hierarchy to a municipality, so the row above
   *                  the venue is always a seeded one and never a typed name.
   * "municipality" — only Finnish municipalities may be picked. Used for online
   *                  municipality clubs (the municipality that funds the club).
   *                  No creation — the hierarchy is seeded.
   */
  pickable: PickableMode;
}

/**
 * Product-form location picker: two configurations of the shared panel, plus
 * the three things that are genuinely this form's own.
 *
 * Both modes put the panel in its **set** scope — a bounded collection the form
 * has already fetched (every venue, or one country's municipalities) grouped by
 * the place above it, which is the view an admin picking a venue actually
 * wants. Browsing the tree is what the "new venue" flow opens, and that is the
 * same panel in its tree scope.
 *
 * What lives here and nowhere else: the card a chosen place collapses to (with
 * its site notes), the hint line under the list, and the effect that drops a
 * stored `location_id` the mode would no longer accept.
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
  const [query, setQuery] = useState("");

  const { data: sites } = useSites();

  // Clear a pick that is not a venue any more (a deleted row, or a legacy
  // product pinned above site level). "Not loaded yet" must never be mistaken
  // for "not a venue" — that would wipe a valid location_id while editing an
  // existing product — which is the whole of what the guard decides.
  useEffect(() => {
    if (shouldDropStoredPick(value, sites)) onChange(null);
  }, [value, sites, onChange]);

  const groups = useMemo(
    () => groupLocationsByParent(sites ?? [], locale, ""),
    [sites, locale],
  );

  const selected = sites?.find((site) => site.id === value);

  if (!sites) return <PickerPlaceholder label={t("loading")} compact={!!value} />;

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
      <LocationPickerPanel
        query={query}
        onQueryChange={setQuery}
        scope={{
          kind: "set",
          groups,
          value,
          onSelect: (pick) => {
            onChange(pick.location.id);
            setBrowsing(false);
          },
          labels: {
            searchPlaceholder: t("searchSites"),
            empty: t("noVenues"),
          },
          footer: (
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
          ),
        }}
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
  const [query, setQuery] = useState("");

  const { data: municipalities } = useMunicipalitiesByCountry(MUNI_COUNTRY_CODE);

  // The query returns exactly the pickable set, so "not in it" covers both
  // invalid shapes at once: a legacy pick anchored to a region or a country,
  // and a municipality outside Finland. Either way the admin re-picks — and,
  // as above, only once the set has actually arrived.
  useEffect(() => {
    if (shouldDropStoredPick(value, municipalities)) onChange(null);
  }, [value, municipalities, onChange]);

  const groups = useMemo(
    () => groupLocationsByParent(municipalities ?? [], locale, t("ungrouped")),
    [municipalities, locale, t],
  );

  const selected = municipalities?.find((row) => row.id === value);

  if (!municipalities)
    return <PickerPlaceholder label={t("loading")} compact={!!value} />;

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
      <LocationPickerPanel
        query={query}
        onQueryChange={setQuery}
        scope={{
          kind: "set",
          groups,
          value,
          onSelect: (pick) => {
            onChange(pick.location.id);
            setBrowsing(false);
          },
          labels: {
            searchPlaceholder: t("searchMunicipalities"),
            empty: t("noMunicipalities"),
          },
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
// Shared bits
// ---------------------------------------------------------------------------

/**
 * The space the picker is about to occupy, held empty.
 *
 * There is nothing in it on purpose. Both reads behind this control are one
 * bounded, indexed request — every venue, or one country's municipalities — so
 * the state it is waiting on arrives within a frame or two; a skeleton would
 * announce a wait that is over before it can be read. What does matter is the
 * *size*: reserving it is what keeps the rest of the product form from jumping
 * when the rows land, which is the layout rule's whole point.
 *
 * `compact` = the caller already knows a location is picked, so this will
 * resolve into the small selected-state card rather than the browse list.
 * Editing an existing product is the most common way in here, so sizing for the
 * state it becomes is what actually holds the form still.
 */
function PickerPlaceholder({ label, compact }: { label: string; compact: boolean }) {
  return (
    <div
      className={cn("rounded-md", compact ? "h-24" : "h-[460px]")}
      aria-label={label}
      aria-busy="true"
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
  const chain = withoutCountry(ancestors).reverse();

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
