import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewGuideAction } from "@/components/admin/guides/admin-guides-page";
import { AdminGuidesView } from "@/components/admin/guides/admin-guides-view";
import { AdminHub } from "@/components/admin/hubs/admin-hub";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGuides") };
}

export default async function AdminGuidesRoute() {
  const t = await getTranslations("admin.guides");

  return (
    <AdminHub hub="marketing" description={t("subtitle")} action={<NewGuideAction />}>
      <AdminGuidesView />
    </AdminHub>
  );
}
