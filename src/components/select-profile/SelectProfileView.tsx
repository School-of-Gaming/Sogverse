"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FamilyProfileSelector } from "@/components/family";
import type { FamilyMember } from "@/services/family";
import type { SessionProvenance } from "@/lib/session-provenance";

/**
 * Body of the family profile selector page. The page-level layout owns the
 * outer flex/min-height + simplified header; this component is just the
 * centered content column.
 *
 * Reuses FamilyProfileSelector to show parent + gamer tiles + "Add Gamer".
 * Clicking another family member's tile switches accounts (handled inside
 * the selector). Clicking the viewer's own tile navigates to their dashboard
 * — the active tile is a no-op in the My Family section but here it's the
 * "Continue as me" choice. The destination depends on the viewer's role, so
 * the parent page passes it in.
 */
export function SelectProfileView({
  selfDashboardPath,
  initialFamily,
  initialSessionProvenance,
}: {
  selfDashboardPath: string;
  initialFamily?: FamilyMember[];
  /**
   * Seeded because this page serves gamers, whose switches are gated: without
   * it the tiles paint out of service and enable themselves once the client
   * refetch lands.
   */
  initialSessionProvenance?: SessionProvenance;
}) {
  const t = useTranslations("selectProfile");
  const c = useTranslations("common");

  return (
    <div className="w-full max-w-3xl space-y-10 sm:space-y-12">
      <h1 className="text-balance text-center text-3xl font-bold sm:text-4xl">
        {t("title")}
      </h1>
      <FamilyProfileSelector
        autoOpenAddGamerFromUrl
        initialFamily={initialFamily}
        initialSessionProvenance={initialSessionProvenance}
        onSelfClick={() => {
          // Full-page navigation so the proxy/root layout re-run and the
          // dashboard hydrates against fresh session cookies. Deliberately
          // not tracked: dashboard_nav compares the two header affordances,
          // and this click is the post-login landing flow, not one of them.
          window.location.href = selfDashboardPath;
        }}
      />
      {/* Escape hatch for a customer who can't get past the PIN gate (forgot
          their PIN and can't reach the reset email). Sign-out is otherwise only
          on /settings, which sits behind the gate — so a locked user has no way
          out without this. /select-profile is PIN-exempt and the post-login
          landing screen, so it's the one place a stuck user always reaches.
          Canonical form-post sign-out (POST + Lax cookies = CSRF-safe), same
          shape as the settings sign-out. */}
      <div className="flex items-center justify-center">
        <form action="/api/auth/signout" method="post">
          <Button type="submit" variant="link" className="h-auto gap-1.5 p-0 text-sm text-muted-foreground">
            <LogOut className="h-4 w-4" />
            {c("signOut")}
          </Button>
        </form>
      </div>
    </div>
  );
}
