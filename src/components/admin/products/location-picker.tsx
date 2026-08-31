"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  useLocationsByIds,
  type LocationWithChain,
} from "@/services/locations";
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
import {
  SitePanel,
  type SiteNotesDraft,
} from "@/components/group-workspace/SitePanel";
import { createSiteDetailsSave } from "@/components/group-workspace/site-details-save";
import { useUpdateLocation } from "@/services/locations";
import { useUpdateSiteNotes } from "@/services/products";
import { useSiteNotes } from "@/services/sites";
import { MUNI_CLUB_COUNTRY_CODE } from "./product-type-config";
import { SitePickerDialog } from "./site-picker-dialog";

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
 * municipality clubs' `countryBound` — the site field reads it from there, so
 * an in-person municipality club is Finland-bound through the same rule.
 */
const MUNI_COUNTRY_CODE = MUNI_CLUB_COUNTRY_CODE;

/**
 * The one level an in-person product may pin to — in any country, unless the
 * product type itself is bound to one (see `SitePicker`'s `countryCode`).
 */
const SITE_ACCEPTS: AcceptedLocation = { types: ["site"] };

/** The one level, and the one country, an online municipality club may pin to. */
const MUNI_ACCEPTS: AcceptedLocation = {
  types: ["municipality"],
  countryCode: MUNI_COUNTRY_CODE,
};

interface LocationPickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only sites may be picked (in-person products). Picking
   *                  one opens the shared tree dialog: search reaches a site
   *                  by name in one step, browsing walks down to a municipality
   *                  and lists the sites in it, and a site that does not
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
   * municipality club picks its site inside Finland only, because the club
   * itself exists only where a kunta funds it. Applied to the site mode's
   * dialog (browse and search alike) and to its stored-pick guard, so a site
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
 * What lives here and nowhere else: the card a chosen place collapses to, and
 * the guard that drops a stored `location_id` the current mode would no longer
 * accept.
 *
 * `ChosenSitePanel` also lives in this file and is deliberately **not** part of
 * this component — the section renders it as the field's sibling, so the field's
 * hint stays against the control it describes. It is here because it asks the
 * same guard the same question about the same read.
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
 * site — which a set-membership check could never tell apart from the first.
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
  // municipality club runs at a Finnish site, full stop).
  const accepts = useSiteAccepts(countryCode);

  // Clear a pick this field would not accept: a site that was deleted, or —
  // the everyday one — a municipality club toggled from online to in-person,
  // which leaves a municipality id in a field that now takes only sites.
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
        emptyLabel={t("chooseSite")}
        picksSite
        onOpen={() => setPicking(true)}
      />

      <SitePickerDialog
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

/**
 * What the site field will accept back, as one memoized value both the field
 * and the panel below it read — so "is this pick still good?" is asked in one
 * shape whoever is asking.
 */
function useSiteAccepts(countryCode: string | undefined): AcceptedLocation {
  return useMemo<AcceptedLocation>(
    () => (countryCode ? { types: SITE_ACCEPTS.types, countryCode } : SITE_ACCEPTS),
    [countryCode],
  );
}

/**
 * The site panel for whatever the site field currently holds, or nothing.
 *
 * **It is deliberately a sibling of the field rather than a child of it.** The
 * field is a labelled control with a hint under it saying what a site *is*, and
 * a hint belongs against the control it describes — a whole editable record
 * wedged between the two would orphan it. So the "Where" section renders this
 * directly beneath, and the two share their answer rather than their box: the
 * keyed read here is the same React Query entry the field's own guard reads, on
 * the same key, so asking twice costs nothing and cannot disagree.
 *
 * The gate is the field's own verdict — a pick the guard has condemned has no
 * site to show — plus the row's own type, because only a `site` row has a
 * record on the other side of the notes read.
 */
export function ChosenSitePanel({
  value,
  countryCode,
}: {
  value: string | null;
  countryCode?: string;
}) {
  const row = useStoredRow(value);
  const accepts = useSiteAccepts(countryCode);

  if (shouldDropStoredRow(value, row, accepts)) return null;
  if (row === null || row === undefined || row.type !== "site") return null;

  return <PickedSitePanel siteId={row.id} siteName={row.name} />;
}

/**
 * The chosen site's own record — its name, its address and its two standing
 * notes — editable from the product form, in the one panel every staff surface
 * showing a site renders.
 *
 * **Why it is here at all.** An admin naming a new building in the picker's
 * create dialog has, at that moment, everything they know about it: the door
 * code, the room, the caretaker. Sending them to `/admin/sites/[id]` and back to
 * write it down is how it does not get written down. The site row exists the
 * instant it is picked or created, so this works identically on the add form —
 * a fresh site shows the panel with an empty address and two ghost notes, ready
 * to fill in, over a product that does not exist yet.
 *
 * **It is not part of the product form's save.** Every field here belongs to the
 * *building*, shared by every product running in it, and each writes on its own
 * route the moment its Save is pressed — exactly as it does on the group page
 * and the site page. The product form's own submit, its validation and its
 * committing flag never see any of it, and the panel's controls are all
 * `type="button"` so none of them can reach the surrounding `<form>`. The one
 * thing that could is Enter inside the name or address input, which a browser
 * turns into an implicit submit of the form those inputs happen to sit in — so
 * the wrapper below refuses that key rather than letting a half-filled product
 * be saved by somebody finishing an address.
 *
 * **Both saves are supplied, because an admin owns the site record.** That is
 * the whole of what makes the name and the address editable; the panel never
 * asks who is looking. Same pair, and the same shared implementation of what a
 * half-failed save leaves behind, as the admin site page and the admin group
 * page.
 *
 * **Nothing is rendered until the notes read lands, and a failed read renders
 * nothing at all** — the same refusal the admin site page makes, for the same
 * reason: the panel saves what its editor holds, so offering an editor over
 * fields this component invented empty invites a Save that blanks an address
 * and two paragraphs somebody wrote.
 *
 * The cost of that is one settle on an edit form's first paint: the id is known
 * synchronously but the row and the notes are two round trips, so the panel
 * appears a frame or two in and the sections under Where move down by its
 * height. It is the same settle the notes had when they last lived under the
 * chosen-place card, and it is accepted for the same reason — the alternative is
 * holding a
 * variable-height slot open on every in-person product form for a panel that is
 * often two short ghost lines, which is the dead space the layout rule names as
 * the other way to get this wrong. Reserving cannot be made honest here: the
 * height is a paragraph somebody typed.
 *
 * `retry` is left at React Query's default, deliberately: nothing on this page
 * is blank while the read flies — the form is complete and usable without the
 * panel — so this is not one of the call sites that has to buy a shorter
 * failure.
 */
function PickedSitePanel({
  siteId,
  siteName,
}: {
  siteId: string;
  /**
   * The canonical, native-language `locations.name` — not the localized display
   * name — because that is the value the rename writes. A site carries no
   * `name_i18n`, so on this row the two are the same string; using the stored
   * one keeps that a fact about the data rather than a coincidence.
   */
  siteName: string;
}) {
  const [editing, setEditing] = useState(false);
  const { data: notes } = useSiteNotes(siteId);
  const updateNotes = useUpdateSiteNotes();
  const rename = useUpdateLocation();

  const handleSaveNotes = async (draft: SiteNotesDraft) => {
    await updateNotes.mutateAsync({
      location_id: siteId,
      member: { notes: draft.publicNote },
      staff: { notes: draft.staffNote },
    });
  };

  /**
   * **The same implementation the admin site and group pages run**, imported
   * rather than reproduced: which route each field travels on, and what a
   * half-failed save leaves behind, are rules about the record rather than
   * about which page you reached it from.
   */
  const handleSaveDetails = createSiteDetailsSave({
    locationId: siteId,
    rename,
    updateAddress: updateNotes,
  });

  if (notes === undefined) return null;

  return (
    <div
      className="rounded-md border border-input bg-card p-4"
      // Enter in a text input is a browser's implicit submit of the form the
      // input sits in — which here is the product form. The panel's own Save is
      // a button and reaches its routes directly, so the key has nothing to do
      // in these fields and everything to break outside them.
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
        }
      }}
    >
      <SitePanel
        siteName={siteName}
        address={notes.address}
        publicNote={notes.memberNote}
        staffNote={notes.staffNote}
        editing={editing}
        onEditingChange={setEditing}
        onSaveNotes={handleSaveNotes}
        onSaveDetails={handleSaveDetails}
      />
    </div>
  );
}

function MunicipalityPicker({ value, onChange }: ModeProps) {
  const t = useTranslations("admin.products.locationPicker");
  const [picking, setPicking] = useState(false);

  const row = useStoredRow(value);

  // The same guard as the site field, asked a different question: this one
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
        picksSite={false}
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
 * next question, which is the whole difference from the site flow, where a
 * confirmed municipality opens a site list because a building still has to be
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
  /** Whether a pick in this mode is a site (rather than a municipality). */
  picksSite: boolean;
  onOpen: () => void;
}

/**
 * The field itself: a compact control when nothing is chosen, the card when
 * something is.
 *
 * The guard's own verdict decides which, rather than the effect it drives. An
 * effect runs *after* the paint that made it true, so gating only on `value`
 * shows one frame of a card the guard has already condemned — on the
 * online-to-in-person toggle that frame is a municipality rendered as a site,
 * pill and all, which is a thing that cannot exist. One predicate, read in both
 * places, and there is no frame to see.
 */
function ChosenPlace({
  value,
  dropping,
  row,
  emptyLabel,
  picksSite,
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
      location={row ?? undefined}
      picksSite={picksSite}
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
  /**
   * The row and its chain, nearest first, or `undefined` while the keyed read
   * is still in flight. Both modes render this card before their row lands.
   */
  location: LocationWithChain | undefined;
  /**
   * Whether this field's picks are sites rather than municipalities. A
   * property of the *mode*, not of the row, so it is known synchronously —
   * inferring it from a row that has not arrived would push the rest of the
   * form down a frame later.
   */
  picksSite: boolean;
  onEdit: () => void;
}

/**
 * What a chosen place collapses to: its name, its path, and an affordance to
 * change it.
 *
 * The card is at its final size from the first frame and fills the text in, per
 * the loading rule: the read behind it is one row by primary key, so a skeleton
 * would be gone before it could be read, and the "Change" button is live
 * immediately because it needs nothing from the read. Everything whose *height*
 * the read could otherwise change is either reserved (the name and path lines)
 * or does not depend on it at all (the municipality note, which is a fact about
 * the mode).
 *
 * **The site's own record sits under this field again, and it is a different
 * thing from what used to.** What was here before was this file's own pair of
 * note fields, each committing out of band the moment its own little Save was
 * pressed, inside a form nothing else committed until the bottom of the page.
 * What is there now is the shared site panel — the same component the admin site
 * page and both group pages render, rendered by the section as this field's
 * sibling — so there is one arrangement of a building's four fields wherever
 * staff meet one, and the out-of-band save is the *point* rather than the wart:
 * those fields belong to the building and to every other product running in it,
 * so they cannot wait on this product's save. See `ChosenSitePanel`.
 */
function SelectedLocationCard({
  location,
  picksSite,
  onEdit,
}: SelectedLocationCardProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();

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
                    {!picksSite && (
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
              {!picksSite && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noSiteHint")}
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
    </div>
  );
}
