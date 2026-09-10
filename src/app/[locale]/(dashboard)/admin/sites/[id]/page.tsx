import { AdminSiteDetailPage } from "@/components/admin/sites/admin-site-detail-page";

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminSiteDetailPage siteId={id} />;
}
