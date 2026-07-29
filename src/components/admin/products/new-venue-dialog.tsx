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
  CatalogDialogShell,
  CatalogPicker,
} from "@/components/locations/catalog-picker";
import { LocationFormDialog } from "@/components/admin/location-form-dialog";
import {
  useCreateLocation,
  useResolveLocationsByCodes,
  useSitesByParent,
} from "@/services/locations";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { Location } from "@/types";

/**
 * Opening a venue somewhere the admin has never run anything.
 *
 * Two steps, because they answer two different questions with two different
 * sources. *Where in the world* is answered by the official catalog — browse
 * or search a country's classification, confirm one commune, and the spelling
 * and the official code are right by construction. *Which building* is
 * answered by the database, because a venue exists in no classification and
 * only an admin can name it.
 *
 * Between the two sits a plain lookup: every commune is a seeded row, so the
 * confirmed catalog code resolves to the row that is about to be the venue's
 * parent. Nothing above a site is ever created here. A code with no row is a
 * refusal with the place named — on an environment where a country's rows have
 * not been loaded yet, that is exactly what an admin needs to be told, and
 * inventing the row instead would put an unofficial parent under the venue.
 */

interface NewVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A venue was chosen — an existing one in this commune, or a new one. */
  onPick: (site: Location) => void;
}

export function NewVenueDialog({
  open,
  onOpenChange,
  onPick,
}: NewVenueDialogProps) {
  const t = useTranslations("admin.products.locationPicker");
  const locale = useLocale();

  /** The commune the catalog pick resolved to. Null means "still choosing". */
  const [place, setPlace] = useState<Location | null>(null);
  const [naming, setNaming] = useState(false);

  const resolveByCodes = useResolveLocationsByCodes();
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
      <CatalogDialogShell
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={t("newVenueTitle")}
        description={t("newVenueDescription")}
      >
        {({ catalog, country, countryLabel }) => (
          <CatalogPicker
            // A new catalog is a new search index, a new browse position and a
            // new selection — all of which are the panel's own state.
            key={country}
            catalog={catalog}
            countryLabel={countryLabel}
            selection={{
              mode: "single",
              onConfirm: async (entry) => {
                const rows = await resolveByCodes(country, [
                  { type: entry.type, external_code: entry.code },
                ]);
                // A resolution that finds nothing comes back as an empty
                // array, so this really can be undefined.
                const row = rows.at(0);
                if (!row) {
                  throw new Error(t("newVenueUnresolved", { name: entry.name }));
                }
                setPlace(row);
              },
              onCancel: close,
            }}
          />
        )}
      </CatalogDialogShell>
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
              buttons under it never move. */}
          <div className="h-[180px] overflow-y-auto rounded-md border border-input bg-background p-2">
            {sitesLoading ? (
              <div
                className="h-full animate-pulse rounded bg-muted"
                aria-label={t("loading")}
              />
            ) : sites && sites.length > 0 ? (
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
