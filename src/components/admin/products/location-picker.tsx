"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useLocationsByIds,
  type LocationWithChain,
} from "@/services/locations";
import { useSiteDetails } from "@/services/products";
import {
  LocationPickerDialog,
  useBoundCountryName,
  useCountryInitialPath,
} from "@/components/locations/location-browser";
import { withoutCountry } from "@/lib/locations/ancestor-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  shouldDropStoredRow,
  type AcceptedLocation,
} from "@/lib/locations/stored-pick";
import { MUNI_CLUB_COUNTRY_CODE } from "./product-type-config";
import { VenuePickerDialog } from "./venue-picker-dialog";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "municipality";

const ANCESTOR_SEPARATOR = " · ";

/**
 * Online municipality clubs anchor to a Finnish municipality only — the kunta
 * that funds the club. The DB trigger still permits a country or a region (it
 * predates this UI rule), so the picker is the gate, in three places that each
 * stop something the next one cannot: the dialog opens *inside* Finland and
 * offers no other country's rows while browsing, search hits from elsewhere are
 * dropped before the panel sees them, and the guard clears a stored id that is
 * not a Finnish municipality — which is what catches a row saved before any of
 * that existed.
 *
 * The constant lives with the product-type config, which also states it as
 * municipality clubs' `countryBound` — the venue field reads it from there, so
 * an in-person municipality club is Finland-bound through the same rule.
 */
const MUNI_COUNTRY_CODE = MUNI_CLUB_COUNTRY_CODE;

/**
 * The one level an in-person product may pin to — in any country, unless the
 * product type itself is bound to one (see `SitePicker`'s `countryCode`).
 */
const VENUE_ACCEPTS: AcceptedLocation = { types: ["site"] };

/** The one level, and the one country, an online municipality club may pin to. */
const MUNI_ACCEPTS: AcceptedLocation = {
  types: ["municipality"],
  countryCode: MUNI_COUNTRY_CODE,
};

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only venues may be picked (in-person products). Picking
   *                  one opens the shared tree dialog: search reaches a venue
   *                  by name in one step, browsing walks down to a municipality
   *                  and lists the venues in it, and a venue that does not
   *                  exist yet is named there.
   * "municipality" — only Finnish municipalities may be picked (the kunta that
   *                  funds an online municipality club). The same tree dialog,
   *                  opened at Finland and scoped to it, and confirming the
   *                  municipality *is* the answer — there is no second step and
   *                  nothing to create, because the hierarchy is seeded.
   */
  pickable: PickableMode;
  /**
   * The product type's `countryBound`, when it has one: an in-person
   * municipality club picks its venue inside Finland only, because the club
   * itself exists only where a kunta funds it. Applied to the site mode's
   * dialog (browse and search alike) and to its stored-pick guard, so a venue
   * left over from a type change in another country is cleared, not kept.
   * The municipality mode carries its own hardcoded bound and ignores this.
   */
  countryCode?: string;
}

/**
 * Product-form location picker: two modes that pick two different levels of one
 * hierarchy, through one dialog.
 *
 * Both modes open the shared tree dialog — the same one gedu coverage and a
 * parent's own location use — and differ only in what they will accept back and
 * where they start. Neither fetches a collection to choose from: sites exist in
 * every country the hierarchy covers, and Finland's kuntaa, while genuinely
 * bounded, are reached faster by typing three letters than by scrolling a
 * grouped list of all of them.
 *
 * What lives here and nowhere else: the card a chosen place collapses to (with
 * its site notes, for a venue), and the guard that drops a stored `location_id`
 * the current mode would no longer accept.
 */
export function LocationPicker({ value, onChange, pickable, countryCode }: LocationPickerProps) {
  return pickable === "site" ? (
    <SitePicker value={value} onChange={onChange} countryCode={countryCode} />
  ) : (
    <MunicipalityPicker value={value} onChange={onChange} />
  );
}

interface ModeProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * The row behind the stored id. The id is known synchronously; the row is one
 * keyed lookup.
 *
 * Three states, and the middle one is the whole point. `undefined` is "the read
 * has not landed"; `null` is a resolved "there is no such row" — a deleted
 * venue — which a set-membership check could never tell apart from the first.
 * Nothing stored resolves to `null` without a read at all.
 */
function useStoredRow(value: string | null): LocationWithChain | null | undefined {
  const { data: rows } = useLocationsByIds(value ? [value] : []);
  if (!value) return null;
  if (rows === undefined) return undefined;
  return rows[0] ?? null;
}

function SitePicker({
  value,
  onChange,
  countryCode,
}: ModeProps & { countryCode?: string }) {
  const t = useTranslations("admin.products.locationPicker");
  const [picking, setPicking] = useState(false);

  const row = useStoredRow(value);

  // What this field accepts: a site, anywhere — or a site in the product
  // type's one country, when the type is bound to one (an in-person
  // municipality club runs at a Finnish venue, full stop).
  const accepts = useMemo<AcceptedLocation>(
    () => (countryCode ? { types: VENUE_ACCEPTS.types, countryCode } : VENUE_ACCEPTS),
    [countryCode],
  );

  // Clear a pick this field would not accept: a venue that was deleted, or —
  // the everyday one — a municipality club toggled from online to in-person,
  // which leaves a municipality id in a field that now takes only venues.
  // "Not read yet" must never be mistaken for either.
  const dropping = shouldDropStoredRow(value, row, accepts);

  useEffect(() => {
    if (dropping) onChange(null);
  }, [dropping, onChange]);

  return (
    <>
      <ChosenPlace
        value={value}
        dropping={dropping}
        row={row}
        emptyLabel={t("chooseVenue")}
        withNotes
        onOpen={() => setPicking(true)}
      />

      <VenuePickerDialog
        open={picking}
        onOpenChange={setPicking}
        countryCode={countryCode}
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
  const [picking, setPicking] = useState(false);

  const row = useStoredRow(value);

  // The same guard as the venue field, asked a different question: this one
  // also refuses a right-level row in the wrong country. Both invalid shapes
  // land on it — a legacy pick anchored to a region or a country, and a
  // municipality outside Finland — and neither can be answered before the read
  // has landed.
  const dropping = shouldDropStoredRow(value, row, MUNI_ACCEPTS);

  useEffect(() => {
    if (dropping) onChange(null);
  }, [dropping, onChange]);

  return (
    <>
      <ChosenPlace
        value={value}
        dropping={dropping}
        row={row}
        emptyLabel={t("chooseMunicipality")}
        withNotes={false}
        onOpen={() => setPicking(true)}
      />

      <MunicipalityPickerDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(municipalityId) => {
          setPicking(false);
          onChange(municipalityId);
        }}
      />
    </>
  );
}

/**
 * The municipality flow, which is the tree dialog and nothing else.
 *
 * Two things configure it. **`pickableTypes` is municipality alone**, so a
 * municipality row is terminal — confirming one is the answer rather than the
 * next question, which is the whole difference from the venue flow, where a
 * confirmed municipality opens a venue list because a building still has to be
 * named. **The country is both a starting point and a bound**: the dialog opens
 * with Finland already in the breadcrumb, listing its maakunnat, and no other
 * country's rows are offered by browsing or by search.
 *
 * The Finland row comes through `useCountryInitialPath` — the browse read at
 * the root of the tree, the same request the panel makes when someone clicks
 * back up to "all countries", so it is one cache entry serving both and can
 * never disagree with what browsing shows. Nothing waits on it: while the read
 * is pending there is no seed and the dialog opens at the (empty) root; the
 * moment it resolves, the seed and the root's rows land in the same render, so
 * no one-country root list is ever on screen. That degradation is deliberate,
 * and it is why the seed is a derived fallback rather than an effect that
 * writes state — an effect could land after the admin had already navigated
 * and drag them back.
 */
function MunicipalityPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (municipalityId: string) => void;
}) {
  const t = useTranslations("admin.products.locationPicker");
  const initialPath = useCountryInitialPath(MUNI_COUNTRY_CODE);
  // Off the same row the breadcrumb opens on, so the panel's copy and its
  // breadcrumb can never name different countries.
  const boundCountryName = useBoundCountryName(initialPath);

  return (
    <LocationPickerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("municipalityPickerTitle")}
      description={t("hintMunicipality")}
      pickableTypes={MUNI_ACCEPTS.types}
      countryCode={MUNI_COUNTRY_CODE}
      initialPath={initialPath}
      boundCountryName={boundCountryName}
      onConfirm={({ location }) => {
        // Nothing is fetched, resolved or created: the panel browses `locations`
        // rows, so the confirmed pick already *is* the row. The confirm button
        // stays disabled through this, because the caller swaps the view away.
        onPick(location.id);
        return Promise.resolve();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

interface ChosenPlaceProps {
  value: string | null;
  /** The guard's verdict on `value`, read directly rather than via its effect. */
  dropping: boolean;
  row: LocationWithChain | null | undefined;
  /** What the empty state's control says. */
  emptyLabel: string;
  /** Whether a pick in this mode carries site notes. */
  withNotes: boolean;
  onOpen: () => void;
}

/**
 * The field itself: a compact control when nothing is chosen, the card when
 * something is.
 *
 * The guard's own verdict decides which, rather than the effect it drives. An
 * effect runs *after* the paint that made it true, so gating only on `value`
 * shows one frame of a card the guard has already condemned — on the
 * online-to-in-person toggle that frame is a municipality rendered as a venue,
 * pill and all, which is a thing that cannot exist. One predicate, read in both
 * places, and there is no frame to see.
 */
function ChosenPlace({
  value,
  dropping,
  row,
  emptyLabel,
  withNotes,
  onOpen,
}: ChosenPlaceProps) {
  if (value === null || dropping) {
    // Nothing is stored (or nothing valid is), so nothing is pending and this
    // is final from the first frame: a compact affordance, not a panel-sized
    // hole. The panel this used to hold lives in a dialog now.
    return <ChoosePlaceButton label={emptyLabel} onClick={onOpen} />;
  }
  return (
    <SelectedLocationCard
      locationId={value}
      location={row ?? undefined}
      withNotes={withNotes}
      onEdit={onOpen}
    />
  );
}

/**
 * The empty state of either field: one compact control that opens the dialog.
 *
 * Deliberately not a reserved panel-sized box. The browse panel lives in a
 * dialog, so there is nothing here that could ever grow into that space, and
 * holding it open would be dead space rather than a shift avoided — the field
 * that replaces this control when a place is chosen is a card, and the swap
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

interface SelectedLocationCardProps {
  /** The stored id — known before the row behind it is. */
  locationId: string;
  /**
   * The row and its chain, nearest first, or `undefined` while the keyed read
   * is still in flight. Both modes render this card before their row lands.
   */
  location: LocationWithChain | undefined;
  /**
   * Whether this field's picks carry site notes. A property of the *mode*, not
   * of the row, so it is known synchronously — which matters twice over:
   * inferring it from a row that has not arrived would either fetch site
   * details for a municipality or push the rest of the form down a frame later.
   */
  withNotes: boolean;
  onEdit: () => void;
}

/**
 * What a chosen place collapses to: its name, its path, an affordance to change
 * it, and — for a venue — the two tiers of site notes.
 *
 * The card is at its final size from the first frame and fills the text in, per
 * the loading rule: the read behind it is one row by primary key, so a skeleton
 * would be gone before it could be read, and the "Change" button is live
 * immediately because it needs nothing from the read. Everything whose *height*
 * the read could otherwise change is either reserved (the name and path lines)
 * or does not depend on it at all (the municipality note, which is a fact about
 * the mode). The notes editors stacked under the card are a separate read with
 * a settle of their own, older than this control and untouched by it.
 */
function SelectedLocationCard({
  locationId,
  location,
  withNotes,
  onEdit,
}: SelectedLocationCardProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();

  // Only sites have site_details / site_staff_details rows, so a municipality
  // pick skips the fetch outright.
  const { data: details } = useSiteDetails(withNotes ? locationId : null);
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
                  the name and the path appear *in place* and the card's own
                  height never changes. That claim stops at the card: the notes
                  editors below it grow when their own read lands, which is a
                  pre-existing settle this reserves nothing for and does not
                  pretend to fix. */}
              <div className="flex min-h-6 items-center gap-2">
                {location && (
                  <>
                    <span className="font-medium">
                      {localizedLocationName(location, locale)}
                    </span>
                    {!withNotes && (
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
              {/* Rendered from the first frame, because it says what picking a
                  municipality *means* and that is settled by the mode. It
                  deliberately does not name the kunta: the name is a few pixels
                  above it, and interpolating it would make this paragraph's
                  height depend on a read — the one thing the card must not
                  allow, since it wraps and the form sits underneath. */}
              {!withNotes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noVenueHint")}
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

      {/*
        The `key` is load-bearing and must not be "simplified" away.

        A notes editor holds its open/closed state and its draft text in local
        state, seeded once at mount. Since the picker became an overlay, this
        card is no longer unmounted while a different venue is being chosen —
        so without a key an editor left open across a venue change survives the
        change with the *old* venue's draft in it, pointed at the *new*
        `locationId`. Saving then writes one building's address and notes onto
        another's, and `site_details` / `site_staff_details` are per-site rows
        shared by every product at that site, so the damage is not confined to
        the product being edited.

        Keying on the id makes a venue change a remount, which is what drops
        the stale draft. Anything else — resetting from props, an effect that
        syncs the draft — reintroduces the same class of bug the first time
        someone edits one of the two pieces of state and not the other.
      */}
      {withNotes && (
        <>
          <SiteNotesEditor
            key={`member-${locationId}`}
            locationId={locationId}
            tier="member"
            address={details?.member?.address ?? null}
            notes={details?.member?.notes ?? null}
          />
          <SiteNotesEditor
            key={`staff-${locationId}`}
            locationId={locationId}
            tier="staff"
            notes={details?.staff?.notes ?? null}
          />
        </>
      )}
    </div>
  );
}
