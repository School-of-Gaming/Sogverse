"use client";

/**
 * Where a parent lives: one optional municipality — Finland's kunta, France's
 * commune. That is the level immediately above a site, and the finest level the
 * official classifications carry, so it is what `pickableTypes` asks for.
 *
 * Deliberately not the gedu coverage control. Coverage is a multi-tick set of
 * "I cover this whole subtree" claims at any level; this is a single row that
 * answers "where is your family", so it uses the picker's **single** mode and
 * holds one value or none.
 *
 * ## One control, not a value plus a button
 *
 * The box *is* the picker: it shows what is chosen and opens the dialog when
 * clicked, the way a `<select>` does. Splitting those into a display row and a
 * separate "choose" button made two rows out of one control and forced the
 * button to name the level being picked — and any such name ("choose your
 * municipality") is wrong for somebody, because a viewer's locale does not say
 * which country they live in or what that country calls this level. The generic
 * "location" is the honest label; a country's own vocabulary belongs inside the
 * dialog, below the country the user actually picked.
 *
 * Presentational: the caller owns the value and decides what committing it
 * means (a registration submit, a settings save). The pick carries the row and
 * its ancestors, which is a `location_id` to store and a path to render without
 * a second read.
 *
 * The box is one fixed height across chosen and unchosen, and the clear button
 * is mounted only alongside a value — nothing survives the swap between those
 * two states, so there is no width to reserve, and reserving one only left a
 * dead column that the hover fill stopped short of.
 *
 * ## Three states, not two
 *
 * `undefined` is "the saved value has not arrived yet" and `null` is "nothing
 * is chosen"; a caller with no stored value to read (the registration form)
 * simply never passes the first. The distinction earns its keep on settings,
 * where a saved id is known before the row behind it is: reading a location by
 * id is a bounded indexed lookup that lands in a frame or two, so the box
 * renders empty at its final height and fills in — no skeleton and no spinner,
 * which is the loading rule's category for a call like this one. What it must
 * not do is render the "add your location" prompt in the meantime: that is a
 * different claim (you have not chosen one) shown to someone who has, and it is
 * clickable, so a fast user opens the picker over a value that was about to
 * appear.
 */

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LocationPickerDialog } from "@/components/locations/location-browser";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { cn } from "@/lib/utils";
import type { LocationType } from "@/types";

/** Punctuation between the levels of a path — not copy, so not translated. */
const PATH_SEPARATOR = ", ";

/**
 * The level a parent picks. One entry, not a list: every catalogued country
 * names some level "the municipality", and it is always the one directly above
 * a site.
 */
const PICKABLE_TYPES: readonly LocationType[] = ["municipality"];

interface HomeLocationFieldProps {
  /**
   * The chosen place, `null` for none, or `undefined` while a stored value is
   * still being read. See the note above: the third state exists so the box can
   * stay silent rather than claim nothing is chosen.
   */
  value: LocationPick | null | undefined;
  onChange: (value: LocationPick | null) => void;
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
          // Each control carries its own focus ring rather than the box
          // carrying one `focus-within` ring for both: with two adjacent
          // targets, a ring around the whole box says something has focus
          // without saying which, and tabbing looks like nothing happened.
          "flex h-[60px] items-center rounded-md border border-input bg-background",
          disabled && "opacity-50",
        )}
      >
        {/* The trigger and the clear button are siblings rather than nested:
            a button inside a button is invalid, and it is the same split every
            two-affordance row in the picker already uses. With nothing chosen
            the trigger takes the whole box and rounds on both sides, so the
            hover fill reaches the border it is drawn inside. */}
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed",
            value ? "rounded-l-md" : "rounded-md",
          )}
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
                {localizedLocationName(value.location, locale)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {homeLocationPath(value, locale)}
              </span>
            </span>
          ) : value === null ? (
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {t("choose")}
            </span>
          ) : (
            // Resolving. Deliberately empty rather than a skeleton: the box is
            // already at its final height and the read behind it is one row by
            // primary key.
            <span className="min-w-0 flex-1" />
          )}
        </button>

        {/* The button *is* the column rather than a small circle centred in
            one: padding around a 14px glyph gave a ~26px target, under both the
            44px and 48px touch minimums, and a thumb that missed it hit the
            trigger and opened the dialog instead — the opposite of the intent.
            There is no hover on touch, so the visible glyph is the affordance
            either way. */}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={c("clear")}
            title={c("clear")}
            className="flex h-full w-12 shrink-0 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <LocationPickerDialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        pickableTypes={PICKABLE_TYPES}
        // Confirming writes nothing: the row already exists, so the caller
        // holds the pick until its own save. The dialog's confirm button stays
        // disabled from the click through to the unmount this triggers.
        onConfirm={async (pick) => {
          onChange(pick);
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * The chosen place's path, widest last: `"Nord, Hauts-de-France, France"`.
 * `ancestors` is nearest-first, the same order the picker shows a search hit's
 * path in, so a pick reads identically before and after it lands in the field.
 * The country stays in here — unlike the picker's own row detail, which drops
 * it because the breadcrumb above already says which country is being browsed.
 */
function homeLocationPath(pick: LocationPick, locale: string): string {
  return pick.ancestors
    .map((node) => localizedLocationName(node, locale))
    .join(PATH_SEPARATOR);
}
