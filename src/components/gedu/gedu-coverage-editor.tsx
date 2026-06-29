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
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllLocations } from "@/services/locations";
import { useGeduLocations, useSetGeduLocations } from "@/services/gedu-locations";
import { CoveragePicker } from "./coverage-picker";

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

  const selected = useMemo<Set<string>>(() => {
    if (overrides) return overrides;
    return new Set((current ?? []).map((r) => r.location_id));
  }, [overrides, current]);

  const isDirty = useMemo(() => {
    if (!current) return false;
    const serverSet = new Set(current.map((r) => r.location_id));
    if (serverSet.size !== selected.size) return true;
    for (const id of selected) if (!serverSet.has(id)) return true;
    return false;
  }, [current, selected]);

  async function handleSave() {
    // The mutation's onSuccess returns the invalidate promise, so mutateAsync
    // resolves only after the refetch completes — the cache is fresh by this
    // point and dropping the override won't cause a stale-state flash.
    await setMutation.mutateAsync({ geduId, locationIds: Array.from(selected) });
    setOverrides(null);
  }

  const isLoading = locationsLoading || currentLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("remoteOnlyNote")}</p>

        <CoveragePicker
          locations={allLocations ?? []}
          selected={selected}
          onChange={setOverrides}
          loading={isLoading}
        />

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
