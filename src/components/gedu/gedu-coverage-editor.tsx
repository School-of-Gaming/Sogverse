"use client";

/**
 * Self-contained editor for a gedu's coverage areas. Mounted on both the
 * shared /settings page (under a gedu-role branch) and the admin
 * /admin/users/[id] page — the only thing that varies is the geduId passed in.
 *
 * Selection semantics:
 *   - Ticking a parent auto-ticks all its descendants.
 *   - Unticking a descendant unticks that descendant AND every selected
 *     ancestor above it, because the ancestor no longer fully covers its
 *     subtree. Sibling branches are unaffected.
 *
 * An empty selection is treated as "remote-only" and is valid.
 */

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LocationTree,
  buildLocationTree,
  filterLocationTree,
} from "@/components/locations/location-tree";
import { useAllLocations } from "@/services/locations";
import { useGeduLocations, useSetGeduLocations } from "@/services/gedu-locations";
import type { Location } from "@/types";
import { buildCoverageRelations, toggleCoverage } from "./coverage-cascade";

interface GeduCoverageEditorProps {
  geduId: string;
}

export function GeduCoverageEditor({ geduId }: GeduCoverageEditorProps) {
  const t = useTranslations("gedu.coverage");
  const { data: allLocations, isLoading: locationsLoading } = useAllLocations();
  const { data: current, isLoading: currentLoading } = useGeduLocations(geduId);
  const setMutation = useSetGeduLocations();

  // Local overrides — populated once the user starts ticking. Before that,
  // render straight from the server set. This keeps the initial paint in
  // sync with `current` without a setState-in-effect hop.
  const [overrides, setOverrides] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const selected = useMemo<Set<string>>(() => {
    if (overrides) return overrides;
    return new Set((current ?? []).map((r) => r.location_id));
  }, [overrides, current]);

  const relations = useMemo(
    () => buildCoverageRelations(allLocations ?? []),
    [allLocations],
  );

  const locationById = useMemo(
    () => new Map((allLocations ?? []).map((l) => [l.id, l])),
    [allLocations],
  );

  const tree = useMemo(
    () => (allLocations ? buildLocationTree(allLocations) : []),
    [allLocations],
  );

  const filteredTree = useMemo(
    () => filterLocationTree(tree, searchQuery),
    [tree, searchQuery],
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

  const isDirty = useMemo(() => {
    if (!current) return false;
    const serverSet = new Set(current.map((r) => r.location_id));
    if (serverSet.size !== selected.size) return true;
    for (const id of selected) if (!serverSet.has(id)) return true;
    return false;
  }, [current, selected]);

  function toggle(id: string) {
    setOverrides(toggleCoverage(selected, id, relations));
  }

  async function handleSave() {
    // The mutation's onSuccess returns the invalidate promise, so mutateAsync
    // resolves only after the refetch completes — the cache is fresh by this
    // point and dropping the override won't cause a stale-state flash.
    await setMutation.mutateAsync({ geduId, locationIds: Array.from(selected) });
    setOverrides(null);
  }

  function handleClearAll() {
    setOverrides(new Set());
  }

  const isLoading = locationsLoading || currentLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("remoteOnlyNote")}</p>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="h-[420px] overflow-y-auto rounded-md border">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </div>
              ) : (
                <LocationTree
                  nodes={filteredTree}
                  searchQuery={searchQuery}
                  selectable
                  selectedIds={selected}
                  onToggleSelect={toggle}
                />
              )}
            </div>
          </div>

          {/* Fixed-height summary — the list scrolls internally so adding or
              removing rows never reflows the page. */}
          <div className="flex flex-col rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">
                {t("selectedHeading", { count: selected.size })}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearAll}>
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
                        title={t("remove", { name: loc.name })}
                      >
                        <span>{loc.name}</span>
                        <X className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {setMutation.isError && (
            <p className="text-sm text-destructive">
              {setMutation.error instanceof Error
                ? setMutation.error.message
                : t("saveError")}
            </p>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || setMutation.isPending}
          >
            {setMutation.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
