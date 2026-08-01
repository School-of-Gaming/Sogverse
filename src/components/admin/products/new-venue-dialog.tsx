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
import { LocationPickerDialog } from "@/components/locations/location-browser";
import type { LocationSummary } from "@/components/locations/location-picker-panel";
import { LocationFormDialog } from "@/components/admin/location-form-dialog";
import { useCreateLocation, useSitesByParent } from "@/services/locations";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { Location } from "@/types";

/**
 * Opening a venue somewhere the admin has never run anything.
 *
 * Two steps, because they answer two different questions. *Where in the world*
 * is answered by browsing or searching the seeded hierarchy and confirming one
 * municipality — the spelling and the official code are right by construction,
 * because the thing confirmed is the row itself. *Which building* is answered
 * by an admin naming a site under it, because a venue exists in no
 * classification and nobody else can name it.
 *
 * There is nothing between the two any more. The picker hands back the row it
 * was browsing, so the confirmed municipality *is* the venue's parent — no code
 * to look up, and no way for the step to fail with a place that has no record.
 * Nothing above a site is ever created here.
 */

interface NewVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A venue was chosen — an existing one in this commune, or a new one. */
  onPick: (site: Location) => void;
}

/** The level a venue hangs off. Sites are only ever created under one of these. */
const VENUE_PARENT_TYPES = ["municipality"] as const;

export function NewVenueDialog({
  open,
  onOpenChange,
  onPick,
}: NewVenueDialogProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();

  /** The municipality the picker confirmed. Null means "still choosing". */
  const [place, setPlace] = useState<LocationSummary | null>(null);
  const [naming, setNaming] = useState(false);

  const createLocation = useCreateLocation();
  const { data: sites, isLoading: sitesLoading } = useSitesByParent(place?.id);

  function reset() {
    setPlace(null);
    setNaming(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  function pick(site: Location) {
    onPick(site);
    reset();
  }

  if (!place) {
    return (
      <LocationPickerDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={t("newVenueTitle")}
        description={t("newVenueDescription")}
        pickableTypes={VENUE_PARENT_TYPES}
        onConfirm={({ location }) => {
          // The panel browses `locations` rows, so the confirmed pick is
          // already the row. Nothing is fetched, resolved or created here —
          // which is why this can resolve immediately.
          setPlace(location);
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
          pick(await createLocation.mutateAsync(values));
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
              empty box — there is nothing long enough to skeleton. */}
          <div className="h-[180px] overflow-y-auto rounded-md border border-input bg-background p-2">
            {sitesLoading ? null : sites && sites.length > 0 ? (
              <div className="space-y-0.5">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => pick(site)}
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
