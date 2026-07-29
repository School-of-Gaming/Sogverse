import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterGeduForm } from "@/components/auth";
import { prefetchSpokenLanguages } from "@/services/users/users.prefetch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("registerGedu"),
    description: "Create your Sogverse game educator account",
  };
}

export default async function RegisterGeduPage() {
  // Prefetch the spoken languages server-side so the checkboxes paint complete
  // on the first frame (layout-shift rule); the table is anon-readable, so this
  // works without a session. Coverage needs no prefetch: the field renders a
  // fixed-height, initially-empty chip box, and the catalog behind its dialog
  // is code-split and only fetched if the registrant opens it.
  const spokenLanguages = await prefetchSpokenLanguages();

  return (
    <Suspense fallback={<div className="h-96 w-full max-w-2xl animate-pulse rounded-lg bg-card" />}>
      <RegisterGeduForm initialSpokenLanguages={spokenLanguages} />
    </Suspense>
  );
}
