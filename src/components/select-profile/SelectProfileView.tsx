"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/providers";
import { FamilyProfileSelector } from "@/components/family";
import { trackDashboardNav } from "@/lib/analytics";

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
}: {
  selfDashboardPath: string;
}) {
  const t = useTranslations("selectProfile");
  const pathname = usePathname();
  const { profile } = useAuth();

  return (
    <div className="w-full max-w-3xl space-y-10 sm:space-y-12">
      <h1 className="text-balance text-center text-3xl font-bold sm:text-4xl">
        {t("title")}
      </h1>
      <FamilyProfileSelector
        onSelfClick={() => {
          // Parents/gamers reaching their dashboard by choosing their own
          // tile. track() is sendBeacon-backed, so it survives the full-page
          // navigation kicked off just below.
          if (profile?.role === "customer" || profile?.role === "gamer") {
            trackDashboardNav({
              role: profile.role,
              method: "profile_selector",
              from: pathname,
            });
          }
          // Full-page navigation so the proxy/root layout re-run and the
          // dashboard hydrates against fresh session cookies.
          window.location.href = selfDashboardPath;
        }}
      />
    </div>
  );
}
