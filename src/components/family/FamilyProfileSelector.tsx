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
 * Family-tree layout: parents on the top row, gamers (plus the "Add Gamer"
 * tile) on the bottom row, both rows centered and wrapped on every breakpoint
 * — never horizontal-scroll, since the dashboard must not spill outside the
 * viewport. Each tile has a subtle border so the icon shape stands out
 * against the dark page background. The active viewer's tile gets a
 * primary-colored ring; clicking another tile signs out and signs in as
 * that account with no confirmation dialog.
 *
 * The "Add Gamer" tile is currently a no-op pending the create-gamer flow.
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

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {error.message || t("loadFailed")}
      </div>
    );
  }

  if (isLoading || !family) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <Row>
          <SkeletonTile />
        </Row>
        <Row>
          <SkeletonTile />
          <SkeletonTile />
        </Row>
      </div>
    );
  }

  const parents = family.filter((m) => m.role === "customer").sort(byFirstName);
  const gamers = family.filter((m) => m.role === "gamer").sort(byFirstName);

  return (
    <div className="space-y-4">
      {switchError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {switchError}
        </div>
      )}

      <div className="space-y-6 sm:space-y-8">
        <Row>
          {parents.map((member) => (
            <ProfileTile
              key={member.id}
              member={member}
              isActive={member.id === currentUserId}
              isCommitting={committingTargetId === member.id}
              isAnyCommitting={!!committingTargetId}
              onClick={() => handleSwitch(member)}
            />
          ))}
        </Row>
        <Row>
          {gamers.map((member) => (
            <ProfileTile
              key={member.id}
              member={member}
              isActive={member.id === currentUserId}
              isCommitting={committingTargetId === member.id}
              isAnyCommitting={!!committingTargetId}
              onClick={() => handleSwitch(member)}
            />
          ))}
          <AddGamerTile />
        </Row>
      </div>
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
        "group flex w-20 flex-col items-center gap-2 transition-transform duration-150 sm:w-24 md:w-28",
        isActive ? "cursor-default" : "cursor-pointer hover:scale-105 focus-visible:scale-105",
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

function AddGamerTile() {
  const t = useTranslations("family");
  // TODO: when the create-gamer flow is ready, wire this up:
  //  - parent dashboard: open the create-gamer form/dialog directly
  //  - gamer dashboard: switch to a parent first, then open the form
  // Until then this is a no-op.
  return (
    <button
      type="button"
      onClick={() => {}}
      className="group flex w-20 flex-col items-center gap-2 transition-transform duration-150 hover:scale-105 focus-visible:scale-105 sm:w-24 md:w-28"
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
      <span className="line-clamp-1 max-w-full text-center text-sm font-medium text-muted-foreground group-hover:text-foreground">
        {t("addGamer")}
      </span>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div
      aria-hidden
      className="flex w-20 flex-col items-center gap-2 sm:w-24 md:w-28"
    >
      <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
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
