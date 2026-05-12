"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers/auth-provider";
import { FamilyService, useFamily, type FamilyMember } from "@/services/family";
import { AddGamerDialog } from "./AddGamerDialog";
import { SelectParentToAddGamerDialog } from "./SelectParentToAddGamerDialog";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

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
 * then the "Add Gamer" tile. Never horizontal-scrolls. Each tile has a
 * subtle border so the icon shape stands out against the dark page
 * background. The active viewer's tile gets a primary-colored ring;
 * clicking another tile signs out and signs in as that account with no
 * confirmation dialog.
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
      <Row>
        <SkeletonTile />
        <SkeletonTile />
        <SkeletonTile />
      </Row>
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
      <Row>
        {parents.map((member) => (
          <ProfileTile
            key={member.id}
            member={member}
            isActive={member.id === currentUserId}
            activeIsClickable={!!onSelfClick}
            isCommitting={committingTargetId === member.id}
            isAnyCommitting={!!committingTargetId}
            onClick={() => handleSwitch(member)}
          />
        ))}
        {gamers.map((member) => (
          <ProfileTile
            key={member.id}
            member={member}
            isActive={member.id === currentUserId}
            activeIsClickable={!!onSelfClick}
            isCommitting={committingTargetId === member.id}
            isAnyCommitting={!!committingTargetId}
            onClick={() => handleSwitch(member)}
          />
        ))}
        {canTriggerAddGamer && (
          <AddGamerTile onClick={handleAddGamerClick} />
        )}
      </Row>

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

/**
 * Wrap-on-every-breakpoint, centered. Vertical padding leaves room for the
 * active tile's ring + ring-offset so neither gets clipped by section
 * boundaries.
 */
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-center gap-3 py-1 sm:gap-5">
      {children}
    </div>
  );
}

function ProfileTile({
  member,
  isActive,
  activeIsClickable,
  isCommitting,
  isAnyCommitting,
  onClick,
}: {
  member: FamilyMember;
  isActive: boolean;
  activeIsClickable: boolean;
  isCommitting: boolean;
  isAnyCommitting: boolean;
  onClick: () => void;
}) {
  const disabled = (isActive && !activeIsClickable) || isAnyCommitting;
  const clickable = !isActive || activeIsClickable;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group flex w-16 flex-col items-center gap-2 transition-transform duration-150 sm:w-20 md:w-24",
        clickable ? "cursor-pointer hover:scale-105 focus-visible:scale-105" : "cursor-default",
      )}
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-lg border-2 ring-offset-2 ring-offset-background transition-[border,box-shadow] duration-150",
          isActive
            ? "border-transparent ring-4 ring-primary"
            : "border-border ring-0 ring-primary/50 group-hover:border-transparent group-hover:ring-4 group-focus-visible:border-transparent group-focus-visible:ring-4",
        )}
      >
        <Identicon id={member.id} size={112} />
        {isCommitting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>
      {/* whitespace-nowrap + text-center lets long names spill into the
          gap between tiles instead of truncating. The button itself stays
          w-16/20/24 so avatar layout is unchanged; only the text overflows. */}
      <span
        className={cn(
          "whitespace-nowrap text-center text-xs font-medium sm:text-sm",
          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {member.first_name}
      </span>
    </button>
  );
}

function AddGamerTile({ onClick }: { onClick: () => void }) {
  const t = useTranslations("family");
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-16 flex-col items-center gap-2 transition-transform duration-150 hover:scale-105 focus-visible:scale-105 sm:w-20 md:w-24"
      aria-label={t("addGamer")}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/40 transition-colors duration-150 group-hover:border-primary group-hover:bg-primary/5 group-focus-visible:border-primary">
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus
            className="h-10 w-10 text-muted-foreground transition group-hover:text-primary sm:h-12 sm:w-12"
            strokeWidth={1.5}
          />
        </div>
      </div>
      <span className="whitespace-nowrap text-center text-xs font-medium text-muted-foreground group-hover:text-foreground sm:text-sm">
        {t("addGamer")}
      </span>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div
      aria-hidden
      className="flex w-16 flex-col items-center gap-2 sm:w-20 md:w-24"
    >
      <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-12 animate-pulse rounded bg-muted sm:h-5 sm:w-16" />
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
