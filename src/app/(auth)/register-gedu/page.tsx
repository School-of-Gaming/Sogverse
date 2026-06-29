import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterGeduForm } from "@/components/auth";
import { prefetchSpokenLanguages } from "@/services/users/users.prefetch";
import { prefetchAllLocations } from "@/services/locations/locations.prefetch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("registerGedu"),
    description: "Create your Sogverse game educator account",
  };
}

export default async function RegisterGeduPage() {
  // Prefetch reference data server-side so the language checkboxes and coverage
  // tree paint complete on the first frame (layout-shift rule). Both are
  // anon-readable, so this works without a session.
  const [spokenLanguages, locations] = await Promise.all([
    prefetchSpokenLanguages(),
    prefetchAllLocations(),
  ]);

  return (
    <Suspense fallback={<div className="h-96 w-full max-w-2xl animate-pulse rounded-lg bg-card" />}>
      <RegisterGeduForm
        initialSpokenLanguages={spokenLanguages}
        initialLocations={locations}
      />
    </Suspense>
  );
}
