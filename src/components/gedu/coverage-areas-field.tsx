"use client";

/**
 * The coverage-area control, shared by every surface that edits a gedu's
 * coverage: the settings page, the admin user-detail page, and the public
 * register-gedu form.
 *
 * It renders what is currently claimed as a fixed-height box of chips, and
 * opens the picker to change it. It holds no data of its own — the caller owns
 * the tick map and decides what committing means (a save button, or a
 * registration submit) — and the picker fetches nothing until the user asks to
 * browse.
 *
 * The chip box has a fixed height and scrolls internally: coverage arrives
 * after the first paint on the editor surfaces, and a growing list would
 * otherwise push the button below it out from under the pointer.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LocationCoverageDialog } from "@/components/locations/location-browser";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { sortedTicks, type CoverageTick } from "./coverage-ticks";

interface CoverageAreasFieldProps {
  ticks: ReadonlyMap<string, CoverageTick>;
  /** A row was ticked or unticked in the picker. */
  onToggle: (pick: LocationPick) => void;
  /** A chip's X was clicked. Separate from `onToggle` because a chip knows only
   *  the row id it stands for, and inventing a whole pick to express that would
   *  be a lie the caller cannot see through. */
  onRemove: (locationId: string) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Saved coverage is still loading; the box shows a note instead of chips. */
  loading?: boolean;
}

export function CoverageAreasField({
  ticks,
  onToggle,
  onRemove,
  onClear,
  disabled,
  loading,
}: CoverageAreasFieldProps) {
  const t = useTranslations("gedu.coverage");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const rows = sortedTicks(ticks, locale);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">
            {t("selectedHeading", { count: rows.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled || rows.length === 0}
          >
            {t("clearAll")}
          </Button>
        </div>

        <div className="h-52 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneSelected")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rows.map((tick) => (
                <CoverageChip
                  key={tick.locationId}
                  label={tick.label}
                  detail={tick.detail}
                  removeLabel={t("remove", { name: tick.label })}
                  disabled={disabled}
                  onRemove={() => onRemove(tick.locationId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Also gated on `loading`: opening the dialog before the saved rows
          have landed would let the first tick seed a draft from an EMPTY
          saved set — and saving that draft would silently delete every
          existing claim via the delete-all-and-insert write. */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || loading}
      >
        {t("chooseAreas")}
      </Button>

      <LocationCoverageDialog
        open={open}
        onOpenChange={setOpen}
        selectedIds={new Set(ticks.keys())}
        onToggle={onToggle}
      />
    </div>
  );
}

interface CoverageChipProps {
  label: string;
  detail: string;
  removeLabel: string;
  onRemove: () => void;
  disabled?: boolean;
}

function CoverageChip({
  label,
  detail,
  removeLabel,
  onRemove,
  disabled,
}: CoverageChipProps) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
      <span className="truncate font-medium">{label}</span>
      {detail && (
        <span className="truncate text-muted-foreground">{detail}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        title={removeLabel}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
