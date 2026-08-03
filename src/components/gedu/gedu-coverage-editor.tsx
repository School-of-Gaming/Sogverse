"use client";

/**
 * Self-contained editor for a gedu's coverage areas. Mounted on both the
 * shared /settings page (under a gedu-role branch) and the admin
 * /admin/users/[id] page — the only thing that varies is the geduId passed in.
 *
 * Coverage is **positive selection**: each tick is an independent "I cover this
 * whole subtree" claim and becomes one `gedu_locations` row. Ticking a région
 * does not tick its départements; unticking a commune does not disturb any
 * ancestor tick. An empty selection is valid and means "remote-only".
 *
 * Saved rows arrive as `location_id`s and the picker browses rows, so a tick is
 * a row id from the moment it is made to the moment it is written. There is no
 * resolution step, no claim the editor can display but not store, and therefore
 * no failure mode where a save is refused because a place the gedu just ticked
 * turned out to have no row.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocationsByIds } from "@/services/locations";
import { useGeduLocations, useSetGeduLocations } from "@/services/gedu-locations";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { CoverageAreasField } from "./coverage-areas-field";
import {
  sameTickKeys,
  sortedTicks,
  ticksFromRows,
  toggleCoverageTick,
  type CoverageTick,
} from "./coverage-ticks";

interface GeduCoverageEditorProps {
  geduId: string;
}

export function GeduCoverageEditor({ geduId }: GeduCoverageEditorProps) {
  const t = useTranslations("gedu.coverage");
  const c = useTranslations("common");
  const locale = useLocale();

  const { data: rows, isLoading: rowsLoading } = useGeduLocations(geduId);
  const locationIds = useMemo(
    () => (rows ?? []).map((row) => row.location_id),
    [rows],
  );
  const { data: locations, isLoading: locationsLoading } =
    useLocationsByIds(locationIds);

  const setMutation = useSetGeduLocations();

  const saved = useMemo(
    () => ticksFromRows(locations ?? [], locale),
    [locations, locale],
  );

  // Before the first edit the editor renders straight off the server set, so
  // the initial paint needs no setState-in-effect hop.
  const [draft, setDraft] = useState<Map<string, CoverageTick> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Set synchronously before the save starts. `mutation.isPending` flips false
   * the moment React Query dispatches success, which is before this component
   * has re-rendered against the refreshed cache — a gap in which the button
   * would re-enable and a second click could fire.
   */
  const [committing, setCommitting] = useState(false);

  const ticks = draft ?? saved;
  const isDirty = draft !== null && !sameTickKeys(draft, saved);

  function edit(
    change: (current: Map<string, CoverageTick>) => Map<string, CoverageTick>,
  ) {
    setSaveError(null);
    setDraft((current) => change(current ?? new Map(saved)));
  }

  function handleToggle(pick: LocationPick) {
    edit((current) => toggleCoverageTick(current, pick, locale));
  }

  function handleRemove(locationId: string) {
    edit((current) => {
      const next = new Map(current);
      next.delete(locationId);
      return next;
    });
  }

  async function handleSave() {
    if (committing) return;
    setSaveError(null);
    setCommitting(true);

    try {
      // The mutation's onSuccess returns the invalidate promise, so this
      // resolves only once the refetch has landed — dropping the draft here
      // cannot flash stale state. Both setStates are in the same event, so the
      // button goes straight from "saving" to disabled-because-clean.
      await setMutation.mutateAsync({
        geduId,
        locationIds: sortedTicks(ticks, locale).map((tick) => tick.locationId),
      });
      setDraft(null);
      setCommitting(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : c("unexpectedError"));
      setCommitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("remoteOnlyNote")}</p>

        <CoverageAreasField
          ticks={ticks}
          onToggle={handleToggle}
          onRemove={handleRemove}
          onClear={() => edit(() => new Map())}
          disabled={committing}
          loading={rowsLoading || locationsLoading}
        />

        {/* One reserved line for the failure message, so surfacing it cannot
            move the save button out from under the pointer. */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-h-[20px] flex-1 text-sm text-destructive" role="alert">
            {saveError}
          </p>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || committing}
          >
            {committing ? t("saving") : t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
