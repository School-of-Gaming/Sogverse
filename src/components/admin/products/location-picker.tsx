"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useLocationsByIds,
  useMunicipalitiesByCountry,
  type LocationWithChain,
} from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import { LocationPickerPanel } from "@/components/locations/location-picker-panel";
import { groupLocationsByParent } from "@/components/locations/location-groups";
import { withoutCountry } from "@/lib/locations/ancestor-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  shouldDropStoredPick,
  shouldDropStoredRow,
} from "@/lib/locations/stored-pick";
import type { LocationType } from "@/types";
import { VenuePickerDialog } from "./venue-picker-dialog";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "municipality";

const ANCESTOR_SEPARATOR = " · ";

// Online municipality clubs anchor to a Finnish municipality only. The DB
// trigger still permits country/region (it predates this UI rule), so the
// enforcement lives here: the only rows offered are Finland's municipalities,
// and a pick outside that set is cleared on load.
const MUNI_COUNTRY_CODE = "FI";

/** The one level an in-person product may pin to. */
const VENUE_TYPES: readonly LocationType[] = ["site"];

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only venues may be picked (in-person products). Picking
   *                  one opens the shared tree dialog: search reaches a venue
   *                  by name in one step, browsing walks down to a municipality
   *                  and lists the venues in it, and a venue that does not
   *                  exist yet is named there.
   * "municipality" — only Finnish municipalities may be picked. Used for online
   *                  municipality clubs (the municipality that funds the club).
   *                  No creation — the hierarchy is seeded.
   */
  pickable: PickableMode;
}

/**
 * Product-form location picker: two modes that pick two different levels, and
 * that reach their rows two different ways.
 *
 * **Venues open the shared tree dialog** — the same dialog gedu coverage and a
 * parent's own location use. There is no bounded set of venues to fetch: sites
 * exist in every country the hierarchy covers, and the flat "every site" list
 * this replaced looked bounded only because every site happened to be Finnish.
 *
 * **Municipalities stay a bounded set, listed inline.** One country's
 * municipalities is a real, finite collection — this club is funded by a
 * Finnish kunta and by nothing else — so the whole list is fetched, grouped
 * under its region and narrowed in memory, with no dialog to open and no
 * request per keystroke.
 *
 * What lives here and nowhere else: the card a chosen place collapses to (with
 * its site notes), and the guard that drops a stored `location_id` the current
 * mode would no longer accept.
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
  const [picking, setPicking] = useState(false);

  // The stored id is known synchronously; the row behind it is one keyed
  // lookup. Nothing here fetches a collection to check membership of, so the
  // guard below asks the row what it is instead.
  const { data: rows } = useLocationsByIds(value ? [value] : []);

  /**
   * Three states, and the middle one is the whole point. `undefined` is "the
   * read has not landed"; `null` is a resolved "there is no such row" — a
   * deleted venue — which a set-membership check could never tell apart from
   * the first. Nothing stored resolves to `null` without a read at all.
   */
  const row: LocationWithChain | null | undefined = !value
    ? null
    : rows === undefined
      ? undefined
      : (rows[0] ?? null);

  // Clear a pick this field would not accept: a venue that was deleted, or —
  // the everyday one — a municipality club toggled from online to in-person,
  // which leaves a municipality id in a field that now takes only venues.
  // "Not read yet" must never be mistaken for either.
  useEffect(() => {
    if (shouldDropStoredRow(value, row, VENUE_TYPES)) onChange(null);
  }, [value, row, onChange]);

  return (
    <>
      {value === null ? (
        // Nothing is stored, so nothing is pending and this is final from the
        // first frame: a compact affordance, not a panel-sized hole. The panel
        // it used to hold lives in the dialog now.
        <ChoosePlaceButton
          label={t("chooseVenue")}
          onClick={() => setPicking(true)}
        />
      ) : (
        <SelectedLocationCard
          locationId={value}
          location={row ?? undefined}
          onEdit={() => setPicking(true)}
        />
      )}

      <VenuePickerDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(siteId) => {
          setPicking(false);
          onChange(siteId);
        }}
      />
    </>
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
        locationId={selected.id}
        location={selected}
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
 * The empty state of the venue field: one compact control that opens the
 * dialog.
 *
 * Deliberately not a reserved panel-sized box. The browse panel moved into a
 * dialog, so there is nothing here that could ever grow into that space, and
 * holding it open would be dead space rather than a shift avoided — the field
 * that replaces this control when a venue is chosen is a card, and the swap
 * between the two is a user's own click.
 */
function ChoosePlaceButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md border border-input bg-background px-3 py-3 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {label}
      </span>
    </button>
  );
}

/**
 * The space the municipality list is about to occupy, held empty.
 *
 * There is nothing in it on purpose. The read behind it is one bounded, indexed
 * request — one country's municipalities — so the state it is waiting on
 * arrives within a frame or two; a skeleton would announce a wait that is over
 * before it can be read. What does matter is the *size*: reserving it is what
 * keeps the rest of the product form from jumping when the rows land, which is
 * the layout rule's whole point.
 *
 * `compact` = the caller already knows a municipality is picked, so this will
 * resolve into the small selected-state card rather than the browse list.
 * Editing an existing product is the most common way in here, so sizing for the
 * state it becomes is what actually holds the form still.
 *
 * The venue field has no equivalent: its rows are behind a dialog, so there is
 * no list to hold a space for, and its own three-state read fills a card that
 * is already at its final size.
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
  /** The stored id — known before the row behind it is. */
  locationId: string;
  /**
   * The row and its chain, nearest first, or `undefined` while a keyed read is
   * still in flight. The municipality mode always has its row (it holds the
   * whole set); the venue mode does not, on the first frame of an edit.
   */
  location: LocationWithChain | undefined;
  onEdit: () => void;
}

/**
 * What a chosen place collapses to: its name, its path, an affordance to change
 * it, and — for a venue — the two tiers of site notes.
 *
 * The card is at its final size from the first frame and fills the text in, per
 * the loading rule: the read behind it is one row by primary key, so a skeleton
 * would be gone before it could be read, and the "Change" button is live
 * immediately because it needs nothing from the read.
 */
function SelectedLocationCard({
  locationId,
  location,
  onEdit,
}: SelectedLocationCardProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();

  /**
   * Whether the site-notes editors belong under this card.
   *
   * `undefined` means the row has not arrived, and the only field that renders
   * this card before its row is the venue one — where the stored id is a `site`
   * by database constraint. Mounting the editors on the id alone is therefore
   * right, and it is what keeps the rest of the form from being pushed down a
   * frame later. A stored id that turns out *not* to be a site is cleared by
   * the caller's guard, which swaps this whole block for the choose affordance
   * rather than moving anything.
   */
  const showNotes = location === undefined || location.type === "site";
  // Only sites have site_details / site_staff_details rows, so a municipality
  // pick skips the fetch outright.
  const { data: details } = useSiteDetails(showNotes ? locationId : null);
  // Root first, so it reads "Uusimaa · Helsinki" the way a breadcrumb does.
  const chain = location ? withoutCountry(location.ancestors).reverse() : [];

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              {/* Both lines keep their height while the row is resolving, so
                  the name and the path appear in place rather than growing the
                  card under whatever is below it. */}
              <div className="flex min-h-6 items-center gap-2">
                {location && (
                  <>
                    <span className="font-medium">
                      {localizedLocationName(location, locale)}
                    </span>
                    {!showNotes && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {location.type}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="mt-0.5 min-h-4 text-xs text-muted-foreground">
                {chain
                  .map((node) => localizedLocationName(node, locale))
                  .join(ANCESTOR_SEPARATOR)}
              </div>
              {location && !showNotes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noVenueHint", {
                    name: localizedLocationName(location, locale),
                  })}
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

      {showNotes && (
        <>
          <SiteNotesEditor
            locationId={locationId}
            tier="member"
            address={details?.member?.address ?? null}
            notes={details?.member?.notes ?? null}
          />
          <SiteNotesEditor
            locationId={locationId}
            tier="staff"
            notes={details?.staff?.notes ?? null}
          />
        </>
      )}
    </div>
  );
}
