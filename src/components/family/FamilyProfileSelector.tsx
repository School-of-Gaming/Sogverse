"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers/auth-provider";
import { FamilyService, useFamily, type FamilyMember } from "@/services/family";
import { AddGamerDialog } from "./AddGamerDialog";
import { SelectParentToAddGamerDialog } from "./SelectParentToAddGamerDialog";
import {
  AddGamerTile,
  ProfileTile,
  ProfileTilesRow,
  SkeletonTile,
} from "./ProfileTiles";
import { ROUTES } from "@/lib/constants";

interface FamilyProfileSelectorProps {
  /**
   * Override behavior when the viewer clicks their own tile. Default (unset)
   * makes the active tile non-interactive — used inside the My Family
   * section, where the viewer is already "where they are". The
   * /select-profile interstitial passes a navigator here so a parent can
   * pick themselves to enter the parent dashboard.
   */
  onSelfClick?: () => void;
}

/**
 * Netflix-style profile selector for the current viewer's family.
 *
 * One centered, wrap-on-every-breakpoint row: parents first, then gamers,
 * then the "Add Gamer" tile. Never horizontal-scrolls. The active viewer's
 * tile gets a primary-colored ring; clicking another tile signs out and
 * signs in as that account with no confirmation dialog.
 *
 * The "Add Gamer" tile opens AddGamerDialog. useCreateGamer's onSuccess
 * invalidates the family query so the new gamer slots into the row.
 */
export function FamilyProfileSelector({ onSelfClick }: FamilyProfileSelectorProps = {}) {
  const t = useTranslations("family");
  const { user, profile } = useAuth();
  const { data: family, isLoading, error } = useFamily();
  const [committingTargetId, setCommittingTargetId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [selectParentOpen, setSelectParentOpen] = useState(false);

  const currentUserId = user?.id ?? null;
  const viewerIsCustomer = profile?.role === "customer";

  async function handleSwitch(target: FamilyMember) {
    if (committingTargetId) return;

    if (target.id === currentUserId) {
      if (!onSelfClick) return;
      // Hold the spinner through the full-page nav initiated by onSelfClick
      // — same loading-state contract as the cross-account switch below.
      setCommittingTargetId(target.id);
      onSelfClick();
      return;
    }

    setSwitchError(null);
    setCommittingTargetId(target.id);

    try {
      const service = new FamilyService();
      await service.switchAccount(target.id);
      // Full-page navigation so the new session cookies hydrate the root
      // layout (browser Supabase singleton is seeded at construction time).
      navigateToDashboard(target.role);
    } catch (err) {
      setCommittingTargetId(null);
      setSwitchError(err instanceof Error ? err.message : t("switchFailed"));
    }
  }

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
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
      </ProfileTilesRow>
    );
  }

  const parents = family.filter((m) => m.role === "customer").sort(byFirstName);
  const gamers = family.filter((m) => m.role === "gamer").sort(byFirstName);

  // The Steven Brown Rule: a beloved family friend of Chief Engineer Kyle's
  // who fathered seven children. If Steven can manage seven gamers, that's
  // also the most anyone else can reasonably need on one Sogverse account.
  // UI-only cap — the API and DB happily accept more if a power user calls
  // the route directly.
  const underStevenBrownLimit = gamers.length < 7;
  // Gamers can also see the tile. Clicking from a gamer's dashboard opens
  // a "pick a parent to switch into" dialog instead of the form, since
  // only parents can actually create gamers. Defensively hide the tile
  // if a gamer has no linked parents (shouldn't happen in practice).
  const canTriggerAddGamer = viewerIsCustomer
    ? underStevenBrownLimit
    : underStevenBrownLimit && parents.length > 0;

  function handleAddGamerClick() {
    if (viewerIsCustomer) {
      setAddGamerOpen(true);
    } else {
      setSelectParentOpen(true);
    }
  }

  const isAnyCommitting = !!committingTargetId;

  return (
    <div className="space-y-4">
      {switchError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {switchError}
        </div>
      )}

      {/* Single wrap-on-every-breakpoint row: parents first, then gamers,
          then "Add Gamer". Wraps to multiple lines as needed on narrow
          viewports — never horizontal-scrolls. */}
      <ProfileTilesRow>
        {[...parents, ...gamers].map((member) => {
          const isActive = member.id === currentUserId;
          const activeIsClickable = !!onSelfClick;
          // Non-active tiles stay visually clickable even while a switch is
          // in flight — only the active tile (when it has no self navigator)
          // shows the default cursor.
          const clickable = !isActive || activeIsClickable;
          return (
            <ProfileTile
              key={member.id}
              member={member}
              isActive={isActive}
              clickable={clickable}
              disabled={(isActive && !activeIsClickable) || isAnyCommitting}
              isLoading={committingTargetId === member.id}
              onClick={() => handleSwitch(member)}
            />
          );
        })}
        {canTriggerAddGamer && (
          <AddGamerTile onClick={handleAddGamerClick} />
        )}
      </ProfileTilesRow>

      <AddGamerDialog open={addGamerOpen} onOpenChange={setAddGamerOpen} />
      <SelectParentToAddGamerDialog
        open={selectParentOpen}
        onOpenChange={setSelectParentOpen}
        parents={parents}
        onPickParent={(parent) => {
          // Close before kicking off the switch so the underlying tile's
          // spinner is visible and a switch failure surfaces through the
          // selector's inline switchError (which the dialog backdrop
          // would otherwise hide).
          setSelectParentOpen(false);
          handleSwitch(parent);
        }}
      />
    </div>
  );
}

function byFirstName(a: FamilyMember, b: FamilyMember): number {
  return a.first_name.localeCompare(b.first_name);
}

function navigateToDashboard(role: FamilyMember["role"]) {
  window.location.href =
    role === "customer" ? ROUTES.customer.dashboard : ROUTES.gamer.dashboard;
}
