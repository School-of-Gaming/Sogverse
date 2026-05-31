"use client";

import { useEffect, useState } from "react";
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

/**
 * One-shot URL marker that carries a gamer's "Add Gamer" intent across the
 * account switch into a parent. A gamer can't create gamers, so clicking
 * "Add Gamer" must first switch into a parent — which loses the intent and
 * strands them on the parent dashboard to re-click. Instead the switch lands on
 * `/select-profile?action=add-gamer`; the selector reads this marker and
 * auto-opens the dialog (whose PIN gate then handles unlock inline). Kept as a
 * single source of truth so the writer (handleSwitch) and reader (the mount
 * effect) can't drift.
 *
 * NOT a caller-supplied redirect, so the `resolveInternalPath` open-redirect
 * rule (see CLAUDE.md) deliberately does not apply: this is a fixed flag whose
 * value is only ever compared `=== value` and then stripped. It never becomes a
 * navigation destination — the only target is the hardcoded `ROUTES.selectProfile`
 * above. A crafted `?action=<anything-else>` simply fails the equality check and
 * is ignored.
 */
const ADD_GAMER_INTENT = { param: "action", value: "add-gamer" } as const;

interface FamilyProfileSelectorProps {
  /**
   * Override behavior when the viewer clicks their own tile. Default (unset)
   * makes the active tile non-interactive — used inside the My Family
   * section, where the viewer is already "where they are". The
   * /select-profile interstitial passes a navigator here so a parent can
   * pick themselves to enter the parent dashboard.
   */
  onSelfClick?: () => void;
  /**
   * When set, honor the `ADD_GAMER_INTENT` URL marker on mount — read it, strip
   * it, and auto-open the Add Gamer dialog once the viewer is known to be a
   * parent. Only the /select-profile interstitial passes this (it's where the
   * gamer→parent switch lands); the My Family section never auto-opens.
   */
  autoOpenAddGamerFromUrl?: boolean;
  /**
   * Server-prefetched family list to seed React Query (see `useFamily`). The
   * /select-profile RSC passes it so the selector paints fully populated on
   * first frame; omitted for in-session mounts (dialogs), which load client-side.
   */
  initialFamily?: FamilyMember[];
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
export function FamilyProfileSelector({
  onSelfClick,
  autoOpenAddGamerFromUrl = false,
  initialFamily,
}: FamilyProfileSelectorProps = {}) {
  const t = useTranslations("family");
  const { user, profile } = useAuth();
  const { data: family, isLoading, error } = useFamily({ initialData: initialFamily });
  const [committingTargetId, setCommittingTargetId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [pendingAddGamerIntent, setPendingAddGamerIntent] = useState(false);
  const [selectParentOpen, setSelectParentOpen] = useState(false);

  const currentUserId = user?.id ?? null;
  const viewerIsCustomer = profile?.role === "customer";

  // Honor the gamer→parent "Add Gamer" intent: read the URL marker once on
  // mount and strip it (so a refresh/back doesn't reopen), recording a pending
  // intent. We can't open here — the viewer's role isn't known yet — so the
  // render derives the open state from `pendingAddGamerIntent && viewerIsCustomer`
  // below. window.location (not useSearchParams) avoids forcing a Suspense
  // boundary, matching unlock-gate's ?redirect= read.
  useEffect(() => {
    if (!autoOpenAddGamerFromUrl) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(ADD_GAMER_INTENT.param) !== ADD_GAMER_INTENT.value) return;
    params.delete(ADD_GAMER_INTENT.param);
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      rest ? `${window.location.pathname}?${rest}` : window.location.pathname,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount-time URL read, mirrors unlock-gate
    setPendingAddGamerIntent(true);
  }, [autoOpenAddGamerFromUrl]);

  async function handleSwitch(
    target: FamilyMember,
    options?: { addGamerIntent?: boolean },
  ) {
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
      if (options?.addGamerIntent && target.role === "customer") {
        // Carry the intent into the parent so the dialog (and its PIN gate)
        // auto-opens on /select-profile instead of dumping them on /parent.
        navigateToAddGamerIntent();
      } else {
        navigateToDashboard(target.role);
      }
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

  // A pending gamer→parent intent opens the dialog as soon as we know the viewer
  // is the parent (post-switch). Deriving it here — rather than in a second
  // effect — keeps the role-gating reactive without another set-state-in-effect.
  const showAddGamer = addGamerOpen || (pendingAddGamerIntent && viewerIsCustomer);

  function handleAddGamerOpenChange(next: boolean) {
    if (next) {
      setAddGamerOpen(true);
    } else {
      // Closing clears both the manual flag and any honored intent so it can't
      // re-open on the next render.
      setAddGamerOpen(false);
      setPendingAddGamerIntent(false);
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

      <AddGamerDialog open={showAddGamer} onOpenChange={handleAddGamerOpenChange} />
      <SelectParentToAddGamerDialog
        open={selectParentOpen}
        onOpenChange={setSelectParentOpen}
        parents={parents}
        onPickParent={(parent) => {
          // Close before kicking off the switch so the underlying tile's
          // spinner is visible and a switch failure surfaces through the
          // selector's inline switchError (which the dialog backdrop
          // would otherwise hide). The intent flag routes the switch to
          // /select-profile?action=add-gamer so the dialog re-opens there.
          setSelectParentOpen(false);
          handleSwitch(parent, { addGamerIntent: true });
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

/**
 * Land on the parent's /select-profile carrying the Add Gamer intent marker, so
 * the selector there auto-opens the dialog. Module-scope (like
 * navigateToDashboard) because assigning window.location.href inside a component
 * trips react-hooks/immutability — the navigation is a side effect, not state.
 */
function navigateToAddGamerIntent() {
  window.location.href = `${ROUTES.selectProfile}?${ADD_GAMER_INTENT.param}=${ADD_GAMER_INTENT.value}`;
}
