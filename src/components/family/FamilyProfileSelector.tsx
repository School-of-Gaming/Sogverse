"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers/auth-provider";
import { FamilyService, useFamily, type FamilyMember } from "@/services/family";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Netflix-style profile selector for the current viewer's family.
 *
 * Shows every family member as a square avatar tile with their first name,
 * including the active viewer (highlighted with a primary-colored ring).
 * Clicking another member's tile signs out and signs in as that account
 * with no confirmation dialog — matches Netflix profile-switch UX.
 *
 * The trailing "Create new gamer" tile is currently a no-op on both
 * dashboards. From the gamer side it'll eventually switch to the parent
 * and open the add-gamer flow; from the parent side it'll open the
 * add-gamer form directly.
 */
export function FamilyProfileSelector() {
  const t = useTranslations("family");
  const { user } = useAuth();
  const { data: family, isLoading, error } = useFamily();
  const [committingTargetId, setCommittingTargetId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const currentUserId = user?.id ?? null;

  async function handleSwitch(target: FamilyMember) {
    if (target.id === currentUserId) return;
    if (committingTargetId) return;

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

  const ordered = family ? sortFamily(family) : null;

  return (
    <div className="space-y-4">
      {switchError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {switchError}
        </div>
      )}

      {error ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error.message || t("loadFailed")}
        </div>
      ) : (
        <TileRow>
          {isLoading || !ordered
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonTile key={i} />)
            : ordered.map((member) => (
                <ProfileTile
                  key={member.id}
                  member={member}
                  isActive={member.id === currentUserId}
                  isCommitting={committingTargetId === member.id}
                  isAnyCommitting={!!committingTargetId}
                  onClick={() => handleSwitch(member)}
                />
              ))}
          {!isLoading && ordered && <CreateGamerTile />}
        </TileRow>
      )}
    </div>
  );
}

/**
 * Mobile: horizontal scroll, large enough taps; we use negative margin +
 * padding so the row scrolls from edge-to-edge of the parent container
 * even though the parent is centered. Desktop: wrap and center.
 */
function TileRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
      <div className="flex flex-nowrap gap-4 sm:flex-wrap sm:justify-center sm:gap-6">
        {children}
      </div>
    </div>
  );
}

function ProfileTile({
  member,
  isActive,
  isCommitting,
  isAnyCommitting,
  onClick,
}: {
  member: FamilyMember;
  isActive: boolean;
  isCommitting: boolean;
  isAnyCommitting: boolean;
  onClick: () => void;
}) {
  const disabled = isActive || isAnyCommitting;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group flex w-24 flex-shrink-0 flex-col items-center gap-2 sm:w-28 md:w-32",
        isActive ? "cursor-default" : "cursor-pointer",
      )}
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-lg ring-4 ring-offset-2 ring-offset-background transition",
          isActive
            ? "ring-primary"
            : "ring-transparent group-hover:ring-primary/50 group-focus-visible:ring-primary",
        )}
      >
        <Identicon id={member.id} size={128} />
        {isCommitting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>
      <span
        className={cn(
          "line-clamp-1 max-w-full text-sm font-medium",
          isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {member.first_name}
      </span>
    </button>
  );
}

function CreateGamerTile() {
  const t = useTranslations("family");
  // TODO: when the create-gamer flow is ready, wire this up:
  //  - parent dashboard: open the create-gamer form/dialog directly
  //  - gamer dashboard: switch to a parent first, then open the form
  // Until then this is a no-op.
  return (
    <button
      type="button"
      onClick={() => {}}
      className="group flex w-24 flex-shrink-0 flex-col items-center gap-2 sm:w-28 md:w-32"
      aria-label={t("createNewGamer")}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/40 transition group-hover:border-primary group-hover:bg-primary/5">
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus
            className="h-12 w-12 text-muted-foreground transition group-hover:text-primary"
            strokeWidth={1.5}
          />
        </div>
      </div>
      <span className="line-clamp-2 max-w-full text-center text-sm font-medium text-muted-foreground group-hover:text-foreground">
        {t("createNewGamer")}
      </span>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div
      aria-hidden
      className="flex w-24 flex-shrink-0 flex-col items-center gap-2 sm:w-28 md:w-32"
    >
      <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

/** Stable order: parents first (by name), then gamers (by name). */
function sortFamily(members: FamilyMember[]): FamilyMember[] {
  return [...members].sort((a, b) => {
    if (a.role !== b.role) return a.role === "customer" ? -1 : 1;
    return a.first_name.localeCompare(b.first_name);
  });
}

function navigateToDashboard(role: FamilyMember["role"]) {
  window.location.href =
    role === "customer" ? ROUTES.customer.dashboard : ROUTES.gamer.dashboard;
}
