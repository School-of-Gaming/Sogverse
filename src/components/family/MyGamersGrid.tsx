"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFamily, type FamilyMember } from "@/services/family";
import { ROUTES, MAX_GAMERS_PER_PARENT } from "@/lib/constants";
import { AddGamerDialog } from "./AddGamerDialog";
import {
  AddGamerTile,
  ProfileTile,
  ProfileTilesRow,
  SkeletonTile,
} from "./ProfileTiles";

/**
 * Parent dashboard "My Gamers" grid. Visually shares the tile primitives with
 * the /select-profile FamilyProfileSelector, but only lists the parent's own
 * gamers (no parent tiles, no profile switching). Tiles are smaller — this is
 * a dashboard widget, not a full-page picker.
 *
 * Clicking a gamer routes to /parent/gamers/[id] to manage that gamer.
 *
 * `initialFamily` (server-prefetched on the parent dashboard) seeds the cache
 * so the grid paints populated on first frame; omitted elsewhere.
 */
export function MyGamersGrid({ initialFamily }: { initialFamily?: FamilyMember[] } = {}) {
  const t = useTranslations("family");
  const { data: family, isLoading, error } = useFamily({ initialData: initialFamily });
  const [addGamerOpen, setAddGamerOpen] = useState(false);

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error.message || t("loadFailed")}
      </div>
    );
  }

  if (isLoading || !family) {
    return (
      <ProfileTilesRow>
        <SkeletonTile size="sm" />
        <SkeletonTile size="sm" />
        <SkeletonTile size="sm" />
      </ProfileTilesRow>
    );
  }

  const gamers = family.filter((m) => m.role === "gamer").sort(byFirstName);
  // Steven Brown Rule (UI-only cap) — see MAX_GAMERS_PER_PARENT for lore.
  const canAddGamer = gamers.length < MAX_GAMERS_PER_PARENT;

  return (
    <div className="space-y-4">
      <ProfileTilesRow>
        {gamers.map((member) => (
          <ProfileTile
            key={member.id}
            member={member}
            size="sm"
            href={`${ROUTES.customer.gamers}/${member.id}`}
          />
        ))}
        {canAddGamer && (
          <AddGamerTile size="sm" onClick={() => setAddGamerOpen(true)} />
        )}
      </ProfileTilesRow>

      <AddGamerDialog open={addGamerOpen} onOpenChange={setAddGamerOpen} />
    </div>
  );
}

function byFirstName(a: FamilyMember, b: FamilyMember): number {
  return a.first_name.localeCompare(b.first_name);
}
