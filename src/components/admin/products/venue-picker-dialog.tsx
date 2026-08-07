"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LocationPickerDialog,
  useCountryInitialPath,
} from "@/components/locations/location-browser";
import type { LocationSummary } from "@/components/locations/location-picker-panel";
import { LocationFormDialog } from "@/components/admin/location-form-dialog";
import { useCreateLocation, useSitesByParent } from "@/services/locations";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { LocationType } from "@/types";

/**
 * Choosing the venue an in-person product runs at — every way of choosing one,
 * in a single dialog.
 *
 * This used to be the "open a new venue" escape hatch behind a flat list of
 * every site that exists. The list is gone: it was Finland-shaped by accident
 * (it looked bounded only because only Finnish sites existed) and it had no
 * answer for a venue in a country whose sites nobody had created yet. What it
 * was genuinely good at — finding a building by name without knowing its kunta
 * — the search index does better, across every country, so that is where it
 * now happens.
 *
 * ## Two ways in, and why a site is pickable but not browsable
 *
 * The tree panel's rule is that **a row of a pickable type is terminal**:
 * clicking it selects rather than descends. That rule is what makes both
 * entrances work off one configuration, `pickableTypes = [municipality, site]`:
 *
 * - **Browsing** walks countries → regions → (districts) → municipalities and
 *   stops there, because a municipality is now terminal. Confirming one is not
 *   the answer, it is the *next question*: this dialog then lists the venues in
 *   it and offers to name a new one. That is the two-step flow, unchanged —
 *   *where in the world* is answered by the seeded hierarchy, *which building*
 *   by an admin, and there is nothing between them because the confirmed row is
 *   already the venue's parent.
 * - **Searching** reaches sites directly, because search is filtered to the
 *   same two types and a site carries its whole ancestor chain back. An admin
 *   who knows the building's name types it and confirms the hit — one step, no
 *   municipality to guess at.
 *
 * So a site is confirmable but never *browsable to*, and that asymmetry is the
 * design rather than a gap in it. Browsing exists to answer "where", and the
 * venue list below is the last level of it — a purpose-built one, because it is
 * the only level that also has to offer creation. Making a site drillable-to in
 * the tree would mean making a municipality non-terminal, which would take the
 * create affordance off the only screen that can carry it.
 *
 * Nothing above a site is ever created here; the hierarchy is seeded.
 */

interface VenuePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A venue was chosen — searched for, listed, or named just now. */
  onPick: (siteId: string) => void;
  /**
   * A caller's business rule, when the product itself is bound to one country
   * (a municipality club exists only where a kunta funds it): the tree opens
   * inside that country and offers no other country's rows, browsing and
   * searching alike. Absent, venues may be picked in any country.
   */
  countryCode?: string;
}

/**
 * What a row may be confirmed as, and — because the dialog passes the same list
 * to search — what a search hit may be. A municipality confirms as "show me the
 * venues here"; a site confirms as the venue itself.
 */
const VENUE_PICKABLE_TYPES: readonly LocationType[] = ["municipality", "site"];

export function VenuePickerDialog({
  open,
  onOpenChange,
  onPick,
  countryCode,
}: VenuePickerDialogProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();
  const initialPath = useCountryInitialPath(countryCode);

  /** The municipality the tree confirmed. Null means "still choosing where". */
  const [place, setPlace] = useState<LocationSummary | null>(null);
  const [naming, setNaming] = useState(false);

  const createLocation = useCreateLocation();
  const { data: sites } = useSitesByParent(place?.id);

  function reset() {
    setPlace(null);
    setNaming(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function pick(siteId: string) {
    onPick(siteId);
    reset();
  }

  if (!place) {
    return (
      <LocationPickerDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={t("venuePickerTitle")}
        description={t("venuePickerDescription")}
        pickableTypes={VENUE_PICKABLE_TYPES}
        countryCode={countryCode}
        initialPath={initialPath}
        onConfirm={({ location }) => {
          // The two confirmable types mean two different things, and this is
          // the only place that knows which: a site is the answer, a
          // municipality is the next question. Either way nothing is fetched,
          // resolved or created — the panel browses `locations` rows, so the
          // confirmed pick already *is* the row, which is why this resolves
          // immediately. The confirm button stays disabled through it, because
          // both branches swap this view away.
          if (location.type === "site") pick(location.id);
          else setPlace(location);
          return Promise.resolve();
        }}
      />
    );
  }

  const placeName = localizedLocationName(place, locale);

  // Only one dialog is ever on screen: naming a venue replaces the list rather
  // than stacking a second overlay over it.
  if (naming) {
    return (
      <LocationFormDialog
        open
        onOpenChange={(next) => {
          if (!next) setNaming(false);
        }}
        onSubmit={async (values) => {
          const created = await createLocation.mutateAsync(values);
          pick(created.id);
        }}
        isPending={createLocation.isPending}
        parent={place}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("venuesIn", { name: placeName })}</DialogTitle>
          <DialogDescription>{t("venuesInDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* One fixed-height box across loading, empty and loaded, so the
              buttons under it never move. The read behind it is an indexed
              lookup of one municipality's venues, so the loading state is the
              empty box — there is nothing long enough to skeleton, and the
              undefined case is deliberately not the empty one: "no venues
              here" is a claim, and it must not be made before the answer. */}
          <div className="h-[180px] overflow-y-auto rounded-md border border-input bg-background p-2">
            {sites === undefined ? null : sites.length > 0 ? (
              <div className="space-y-0.5">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => pick(site.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {localizedLocationName(site, locale)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("venuesHereEmpty")}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPlace(null)}
            >
              {t("changeMunicipality")}
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              onClick={() => setNaming(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addVenue")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
