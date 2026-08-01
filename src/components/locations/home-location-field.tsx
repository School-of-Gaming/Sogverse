"use client";

/**
 * Where a parent lives: one optional municipality — Finland's kunta, France's
 * commune. That is the level immediately above a site, and the finest thing the
 * official catalogs classify, so the catalog's own leaf *is* the level we want
 * and no extra depth rule is needed here.
 *
 * Deliberately not the gedu coverage control. Coverage is a multi-tick set of
 * "I cover this whole subtree" claims at any level; this is a single leaf that
 * answers "where is your family", so it uses the catalog panel's **single**
 * mode and holds one value or none.
 *
 * ## One control, not a value plus a button
 *
 * The box *is* the picker: it shows what is chosen and opens the dialog when
 * clicked, the way a `<select>` does. Splitting those into a display row and a
 * separate "choose" button below it made two rows out of one control and forced
 * the button to name the thing being picked — and any such name ("choose your
 * municipality") is wrong for somebody, because a viewer's locale does not tell
 * you what their country calls this level, or which country they are in. The
 * generic "location" is the honest label; the country's own vocabulary belongs
 * inside the dialog, after a country has actually been chosen.
 *
 * Presentational, in the style-guide sense: the caller owns the value and
 * decides what committing it means (a registration submit, a settings save).
 * The default country's catalog is bundled, so the dialog opens with its list
 * already rendered and no loading state at all.
 *
 * The box is one fixed height across chosen and unchosen, and the clear button
 * sits in a slot that is reserved whether or not it is occupied, so neither
 * picking nor clearing moves anything.
 */

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getCountryConfig, getCountryName } from "@/lib/constants";
import {
  CatalogDialogShell,
  CatalogPicker,
} from "@/components/locations/catalog-picker";
import type { CatalogPick } from "@/lib/locations/catalog";
import { cn } from "@/lib/utils";

/** Punctuation between the levels of a path — not copy, so not translated. */
const PATH_SEPARATOR = ", ";

interface HomeLocationFieldProps {
  value: CatalogPick | null;
  onChange: (value: CatalogPick | null) => void;
  /** Associates the trigger with the `Field` label wrapping it. */
  id?: string;
  disabled?: boolean;
}

export function HomeLocationField({
  value,
  onChange,
  id,
  disabled,
}: HomeLocationFieldProps) {
  const t = useTranslations("locations.home");
  const c = useTranslations("common");
  const locale = useLocale();

  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "flex h-[60px] items-center rounded-md border border-input bg-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          disabled && "opacity-50",
        )}
      >
        {/* The trigger and the clear button are siblings rather than nested:
            a button inside a button is invalid, and the same split is what
            every two-affordance row in the catalog UI already does. */}
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-l-md px-3 text-left outline-none hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed"
        >
          <MapPin
            className={cn(
              "h-4 w-4 shrink-0",
              value ? "text-primary" : "text-muted-foreground",
            )}
          />
          {value ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {value.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {homeLocationPath(value, locale)}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {t("choose")}
            </span>
          )}
        </button>

        {/* Reserved whether or not it is occupied, so the text column keeps one
            width and choosing a place cannot reflow the line being read. */}
        <span className="flex h-full w-10 shrink-0 items-center justify-center">
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={c("clear")}
              title={c("clear")}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <CatalogDialogShell
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
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
              // The entry carries its level and code but not its country, which
              // only the shell knows; pairing them here is what makes the value
              // a full catalog identity a row resolver could take later.
              onConfirm: async (entry) => {
                onChange({
                  country,
                  type: entry.type,
                  code: entry.code,
                  name: entry.name,
                  ancestors: entry.ancestors,
                });
                setOpen(false);
              },
              onCancel: () => setOpen(false),
            }}
          />
        )}
      </CatalogDialogShell>
    </>
  );
}

/**
 * The chosen place's path, widest last: `"Nord, Hauts-de-France, France"`.
 * `ancestors` is nearest-first, which is the same order the catalog panel shows
 * a search hit's path in, so a pick reads identically before and after it lands
 * in the field. The country is appended because the dialog can switch countries
 * and the ancestors alone would not say which one won.
 */
function homeLocationPath(value: CatalogPick, locale: string): string {
  const config = getCountryConfig(value.country);
  const country = config ? getCountryName(config, locale) : value.country;
  return [...value.ancestors, country].join(PATH_SEPARATOR);
}
