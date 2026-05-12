"use client";

import { useTranslations } from "next-intl";
import { FamilyProfileSelector } from "@/components/family";
import { ROUTES } from "@/lib/constants";

/**
 * Full-screen, chrome-free landing for parents right after sign-in.
 *
 * Reuses FamilyProfileSelector to show parent + gamer tiles + "Add Gamer".
 * Clicking a gamer tile signs in as that gamer (handled inside the selector).
 * Clicking the parent's own tile navigates to /parent — the active tile is a
 * no-op in the My Family section but here it's the "Continue as me" choice.
 */
export function SelectProfileView() {
  const t = useTranslations("selectProfile");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-10 sm:space-y-12">
        <h1 className="text-balance text-center text-3xl font-bold sm:text-4xl">
          {t("title")}
        </h1>
        <FamilyProfileSelector
          onSelfClick={() => {
            // Full-page navigation so the proxy/root layout re-run and the
            // parent dashboard hydrates against fresh session cookies.
            window.location.href = ROUTES.customer.dashboard;
          }}
        />
      </div>
    </div>
  );
}
