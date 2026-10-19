import { getTranslations } from "next-intl/server";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import {
  AddSiteAction,
  AdminSitesPage,
} from "@/components/admin/sites/admin-sites-page";

export default async function SitesPage() {
  const t = await getTranslations("admin.sites");

  return (
    <AdminHub
      hub="products"
      description={t("subtitle")}
      action={<AddSiteAction />}
    >
      <AdminSitesPage />
    </AdminHub>
  );
}
