"use client";

/**
 * Presentational coverage-area picker: the location tree + a fixed-height
 * "selected" summary, driven entirely by local state. It owns the cascade
 * semantics (ticking a parent ticks its subtree; unticking a child unticks
 * selected ancestors) but knows nothing about persistence — the caller holds
 * the `Set<location_id>` and reacts to `onChange`.
 *
 * Two callers:
 *   - GeduCoverageEditor (settings + admin user page) wires it to a gedu's
 *     saved coverage and a save mutation.
 *   - the public register-gedu form collects coverage before the account exists.
 *
 * An empty selection means "remote-only" and is valid.
 */

import { useMemo } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LocationTree } from "@/components/locations/location-tree";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { Location } from "@/types";
import { buildCoverageRelations, toggleCoverage } from "./coverage-cascade";

interface CoveragePickerProps {
  locations: Location[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  loading?: boolean;
}

export function CoveragePicker({ locations, selected, onChange, loading }: CoveragePickerProps) {
  const t = useTranslations("gedu.coverage");
  const locale = useLocale();

  const relations = useMemo(() => buildCoverageRelations(locations), [locations]);

  const locationById = useMemo(
    () => new Map(locations.map((l) => [l.id, l])),
    [locations],
  );

  const selectedList = useMemo(() => {
    const rows: Location[] = [];
    for (const id of selected) {
      const loc = locationById.get(id);
      if (loc) rows.push(loc);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [selected, locationById]);

  function toggle(id: string) {
    onChange(toggleCoverage(selected, id, relations));
  }

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
      <div>
        {loading ? (
          <div className="flex h-[420px] items-center justify-center rounded-md border text-sm text-muted-foreground">
            {t("loading")}
          </div>
        ) : (
          <LocationTree
            locations={locations}
            selection={{ mode: "multi", selectedIds: selected, onToggle: toggle }}
            searchPlaceholder={t("searchPlaceholder")}
            listClassName="h-[420px]"
          />
        )}
      </div>

      {/* Fixed-height summary — the list scrolls internally so adding or
          removing rows never reflows the page. */}
      <div className="flex flex-col rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {t("selectedHeading", { count: selected.size })}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(new Set())}>
            {t("clearAll")}
          </Button>
        </div>
        <div className="h-[420px] overflow-y-auto">
          {selectedList.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {t("noneSelected")}
            </div>
          ) : (
            <ul className="divide-y">
              {selectedList.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onClick={() => toggle(loc.id)}
                    className="group flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    title={t("remove", { name: localizedLocationName(loc, locale) })}
                  >
                    <span>{localizedLocationName(loc, locale)}</span>
                    <X className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
