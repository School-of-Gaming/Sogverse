import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminDashboard"), description: "Manage users, products, and system settings" };
}

/**
 * `/admin` — the ops queue an admin starts their day in.
 *
 * The route is metadata and nothing else: the page is one platform-wide read
 * against the admin's own session, so there is nothing worth prefetching here
 * that would not be a second copy of the same query. Everything below is the
 * client shell, which owns the read, the clock and the viewer's zone.
 */
export default function AdminDashboardRoute() {
  return <AdminDashboardPage />;
}
