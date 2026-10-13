import { AdminHub } from "@/components/admin/hubs/admin-hub";
import { AdminSitesPage } from "@/components/admin/sites/admin-sites-page";

export default function SitesPage() {
  return (
    <AdminHub hub="products">
      <AdminSitesPage />
    </AdminHub>
  );
}
