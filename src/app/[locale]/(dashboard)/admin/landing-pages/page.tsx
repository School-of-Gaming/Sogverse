import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AdminLandingPagesView } from "@/components/admin/landing-pages/admin-landing-pages-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLandingPages") };
}

export default async function AdminLandingPagesRoute() {
  const t = await getTranslations("admin.landingPages");

  return (
    <AdminHub hub="marketing" description={t("subtitle")}>
      <AdminLandingPagesView />
    </AdminHub>
  );
}
