import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminGroupsPageContent } from "@/components/admin/AdminGroupsPageContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGroups"), description: "View all groups, educators, and students" };
}

export default function AdminGroupsPage() {
  return <AdminGroupsPageContent />;
}
