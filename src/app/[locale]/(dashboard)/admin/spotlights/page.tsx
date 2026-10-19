import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { NewSpotlightAction } from "@/components/admin/spotlights/admin-spotlights-page";
import { AdminSpotlightsView } from "@/components/admin/spotlights/admin-spotlights-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminSpotlights") };
}

export default async function AdminSpotlightsRoute() {
  const t = await getTranslations("admin.spotlights");

  return (
    <AdminHub hub="marketing" description={t("subtitle")} action={<NewSpotlightAction />}>
      <AdminSpotlightsView />
    </AdminHub>
  );
}
