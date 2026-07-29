"use client";

/**
 * The coverage-area control, shared by every surface that edits a gedu's
 * coverage: the settings page, the admin user-detail page, and the public
 * register-gedu form.
 *
 * It renders what is currently claimed as a fixed-height box of chips, and
 * opens the catalog dialog to change it. It holds no data of its own — the
 * caller owns the tick map and decides what committing means (a save button, or
 * a registration submit) — and the catalog itself is loaded by the dialog, so
 * nothing here is fetched until the user asks to browse.
 *
 * The chip box has a fixed height and scrolls internally: coverage arrives
 * after the first paint on the editor surfaces, and a growing list would
 * otherwise push the button below it out from under the pointer.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CatalogCoverageDialog } from "@/components/locations/catalog-picker";
import { catalogRefKey, type CatalogPick } from "@/lib/locations/catalog";
import { cn } from "@/lib/utils";
import {
  sortedTicks,
  type CoverageTick,
  type LegacyCoverageRow,
} from "./coverage-ticks";

interface CoverageAreasFieldProps {
  ticks: ReadonlyMap<string, CoverageTick>;
  onToggle: (pick: CatalogPick) => void;
  onClear: () => void;
  /** Saved rows the catalog cannot show — venues and pre-catalog entries. */
  legacy?: readonly LegacyCoverageRow[];
  onRemoveLegacy?: (id: string) => void;
  disabled?: boolean;
  /** Saved coverage is still loading; the box shows a note instead of chips. */
  loading?: boolean;
}

export function CoverageAreasField({
  ticks,
  onToggle,
  onClear,
  legacy = [],
  onRemoveLegacy,
  disabled,
  loading,
}: CoverageAreasFieldProps) {
  const t = useTranslations("gedu.coverage");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const rows = sortedTicks(ticks, locale);
  const total = rows.length + legacy.length;

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {t("selectedHeading", { count: total })}
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
          ) : total === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneSelected")}</p>
          ) : (
            <div className="space-y-3">
              {rows.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {rows.map((tick) => (
                    <CoverageChip
                      key={catalogRefKey(tick.ref)}
                      label={tick.label}
                      detail={tick.detail}
                      removeLabel={t("remove", { name: tick.label })}
                      disabled={disabled}
                      onRemove={() =>
                        onToggle({
                          ...tick.ref,
                          name: tick.label,
                          ancestors: [],
                        })
                      }
                    />
                  ))}
                </div>
              )}

              {legacy.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium">{t("legacyHeading")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("legacyNote")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {legacy.map((row) => (
                      <CoverageChip
                        key={row.id}
                        label={row.label}
                        detail={
                          row.kind === "venue"
                            ? t("venueBadge")
                            : t("legacyBadge")
                        }
                        removeLabel={t("remove", { name: row.label })}
                        disabled={disabled || !onRemoveLegacy}
                        onRemove={() => onRemoveLegacy?.(row.id)}
                        muted
                      />
                    ))}
                  </div>
                </div>
              )}
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

      <CatalogCoverageDialog
        open={open}
        onOpenChange={setOpen}
        tickedKeys={new Set(ticks.keys())}
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
  muted?: boolean;
}

function CoverageChip({
  label,
  detail,
  removeLabel,
  onRemove,
  disabled,
  muted,
}: CoverageChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        muted ? "bg-muted text-muted-foreground" : "bg-background",
      )}
    >
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
        className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
