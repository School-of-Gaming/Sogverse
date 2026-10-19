import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminSpotlightsView } from "@/components/admin/spotlights/admin-spotlights-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminSpotlights") };
}

export default function AdminSpotlightsRoute() {
  return <AdminSpotlightsView />;
}
