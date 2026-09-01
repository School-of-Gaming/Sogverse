"use client";

import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FamilyProfileSelector } from "@/components/family";
import type { FamilyMember } from "@/services/family";

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
}: {
  selfDashboardPath: string;
  initialFamily?: FamilyMember[];
}) {
  const t = useTranslations("selectProfile");
  const c = useTranslations("common");

  return (
    <div className="w-full max-w-3xl space-y-10 sm:space-y-12">
      {/* One of the two places Space Mono is spent (the other is the voice
          room's zone names): the platform asking, in its own voice, who is
          entering it. Everything else on this page — and every heading that is
          the brand *speaking* rather than the world naming itself — is Poppins.
          The mono advances a fixed 0.6em per character against Poppins' ~0.55,
          so the scale steps down one notch from the H1 it replaces: at 24px the
          widest locale (25 characters, English and French alike) sets 360px and
          takes two balanced lines inside the 328px the 360px floor gives, with
          the longest single word at 130px; from `sm` it is one line at 30px.
          `font-bold`, not the app's SemiBold heading weight, because Space Mono
          ships 400 and 700 and nothing between — asking for 600 would render
          700 anyway and only make the source say something untrue. */}
      <h1 className="text-balance text-center font-brand-mono text-2xl font-bold sm:text-3xl">
        {t("title")}
      </h1>
      <FamilyProfileSelector
        autoOpenAddGamerFromUrl
        initialFamily={initialFamily}
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
