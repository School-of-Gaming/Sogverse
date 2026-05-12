"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFamily, type FamilyMember } from "@/services/family";
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
 * Click is currently a no-op; the tile keeps its hover/focus styling so the
 * affordance is in place for the upcoming manage-gamer screen.
 */
export function MyGamersGrid() {
  const t = useTranslations("family");
  const { data: family, isLoading, error } = useFamily();
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
  // Same Steven Brown limit as FamilyProfileSelector — see that file for lore.
  const canAddGamer = gamers.length < 7;

  return (
    <div className="space-y-4">
      <ProfileTilesRow>
        {gamers.map((member) => (
          <ProfileTile
            key={member.id}
            member={member}
            size="sm"
            onClick={() => {
              // Placeholder: routes to /parent/gamers/[id] manage screen once built.
            }}
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
