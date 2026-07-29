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
 * Saved rows arrive as `location_id`s, so the editor reads the rows themselves
 * to learn each one's `(country, type, official code)` and light up the
 * matching catalog node. Rows with no such identity — venues, and anything from
 * a country that ships no catalog — are shown as removable chips instead.
 *
 * Save resolves every newly ticked code back to a row id before writing. That
 * resolution can legitimately come up empty (a code whose row is not seeded on
 * this environment yet), and when it does the save is refused with the place
 * named, rather than quietly writing a coverage set missing a tick the gedu
 * just made.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLocationsByIds,
  useResolveLocationsByCodes,
} from "@/services/locations";
import { useGeduLocations, useSetGeduLocations } from "@/services/gedu-locations";
import type { CatalogPick } from "@/lib/locations/catalog";
import { CoverageAreasField } from "./coverage-areas-field";
import {
  codeRefsOf,
  matchResolvedRows,
  pendingTicksByCountry,
  sameTickKeys,
  splitCoverageRows,
  toggleCoverageTick,
  type CoverageTick,
} from "./coverage-ticks";

interface GeduCoverageEditorProps {
  geduId: string;
}

/** One shared empty set, so the untouched render is referentially stable. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/** Everything the user has changed since load. `null` means "untouched". */
interface CoverageDraft {
  ticks: Map<string, CoverageTick>;
  removedLegacyIds: Set<string>;
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

  const resolveByCodes = useResolveLocationsByCodes();
  const setMutation = useSetGeduLocations();

  const saved = useMemo(
    () => splitCoverageRows(locations ?? [], locale),
    [locations, locale],
  );

  // Before the first edit the editor renders straight off the server set, so
  // the initial paint needs no setState-in-effect hop.
  const [draft, setDraft] = useState<CoverageDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * Set synchronously before the save starts. `mutation.isPending` flips false
   * the moment React Query dispatches success, which is before this component
   * has re-rendered against the refreshed cache — a gap in which the button
   * would re-enable and a second click could fire.
   */
  const [committing, setCommitting] = useState(false);

  const ticks = draft?.ticks ?? saved.ticks;
  const removedLegacyIds = draft?.removedLegacyIds ?? EMPTY_IDS;
  const legacy = useMemo(
    () => saved.legacy.filter((row) => !removedLegacyIds.has(row.id)),
    [saved.legacy, removedLegacyIds],
  );

  const isDirty =
    draft !== null &&
    (!sameTickKeys(draft.ticks, saved.ticks) ||
      draft.removedLegacyIds.size > 0);

  function edit(change: (current: CoverageDraft) => CoverageDraft) {
    setSaveError(null);
    setDraft((current) =>
      change(
        current ?? {
          ticks: new Map(saved.ticks),
          removedLegacyIds: new Set(),
        },
      ),
    );
  }

  function handleToggle(pick: CatalogPick) {
    edit((current) => ({
      ...current,
      ticks: toggleCoverageTick(current.ticks, pick),
    }));
  }

  function handleClear() {
    edit((current) => ({ ...current, ticks: new Map() }));
  }

  function handleRemoveLegacy(id: string) {
    edit((current) => ({
      ...current,
      removedLegacyIds: new Set(current.removedLegacyIds).add(id),
    }));
  }

  async function handleSave() {
    if (committing) return;
    setSaveError(null);
    setCommitting(true);

    try {
      const ids = new Set<string>();
      for (const tick of ticks.values()) {
        if (tick.locationId) ids.add(tick.locationId);
      }
      for (const row of legacy) ids.add(row.id);

      // Newly ticked catalog nodes carry a code, not a row id. One request per
      // country; a code with no row comes back absent, which is a refusal, not
      // a silent drop.
      const unresolved: CoverageTick[] = [];
      for (const [country, pending] of pendingTicksByCountry(ticks)) {
        const resolved = await resolveByCodes(country, codeRefsOf(pending));
        const matched = matchResolvedRows(pending, resolved);
        for (const id of matched.ids) ids.add(id);
        unresolved.push(...matched.unresolved);
      }

      if (unresolved.length > 0) {
        setSaveError(
          t("unresolvedError", {
            names: unresolved.map((tick) => tick.label).join(", "),
          }),
        );
        setCommitting(false);
        return;
      }

      // The mutation's onSuccess returns the invalidate promise, so this
      // resolves only once the refetch has landed — dropping the draft here
      // cannot flash stale state. Both setStates are in the same event, so the
      // button goes straight from "saving" to disabled-because-clean.
      await setMutation.mutateAsync({
        geduId,
        locationIds: Array.from(ids),
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
          onClear={handleClear}
          legacy={legacy}
          onRemoveLegacy={handleRemoveLegacy}
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
